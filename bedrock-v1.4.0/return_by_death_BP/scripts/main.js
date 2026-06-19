/**
 * Return By Death - Bedrock Edition (incl. Pocket Edition) - v1.4.0
 * =================================================================
 *
 * Inspired by Subaru Natsuki's ability from Re:Zero.
 *
 * v1.4.0 RESTORATION RELEASE:
 *   This version merges the proven death-detection foundation from v1.3.0
 *   with the complete v1.2.5 feature set. After v1.3.1 stripped everything
 *   down to just "play sound on death", users requested a single release
 *   that brings every feature back together - this is it.
 *
 *   v1.3.0 FOUNDATION (kept):
 *     - entityDie event + 1-tick polling fallback (most reliable death detection)
 *     - GLOBAL_REWIND_ACTIVE mutex (prevents double-restore)
 *     - Auto gamerule setup at startup (doimmediaterespawn, keepinventory,
 *       showdeathmessages)
 *     - EntityComponentTypes constants (modern API, not hardcoded strings)
 *     - EquipmentSlot.Offhand saved + restored
 *     - player.getTotalExperience() + resetLevel() for XP
 *     - @minecraft/server 1.19.0 (modern API surface)
 *
 *   v1.2.5 FEATURES (restored):
 *     - broadcastRadius config + !rbd radius command (was dropped in v1.3.0)
 *     - Full particle beacon ring (4-direction basic_crit + column + endrod)
 *     - Death cause extraction from entityDie event (was hardcoded "unknown")
 *     - Sound volume + pitch from CONFIG applied to playSound
 *     - showDeathTitle + sendDeathQuote + triggerWitchScent + witch watching
 *     - Action bar cooldown display loop
 *     - All slash commands, chat commands, and RBD Notebook UI menu
 *
 *   v1.4.0 ADDITIONAL FIXES:
 *     - causeStr now passed through triggerReturn so death log is meaningful
 *     - Particle beacon distance check uses named constant (BEACON_MAX_DISTANCE)
 *     - playReturnByDeathSound respects CONFIG.soundVolume (was hardcoded 1.0
 *       in v1.3.0, breaking the !rbd volume command)
 *     - All version strings bumped to 1.4.0
 *
 * CORE MECHANIC:
 *   - Every saveIntervalSeconds (default 20s), capture player state:
 *     position, dimension, rotation, health, hunger, XP, total XP,
 *     inventory (36 slots), equipment (head/chest/legs/feet/offhand),
 *     potion effects, fire ticks
 *   - On death: play iconic RBD sound to all players, mark for return,
 *     restore full state on respawn (with double-teleport safety)
 *   - Tier 1 flavor: witch scent, death quotes, heartbeat at low HP,
 *     "Witch of Envy is watching" every 5th death
 *
 * CHAT COMMANDS (Layer 2 - older Bedrock, may need Beta APIs toggle):
 *   Player: !rbd save, info, status, loops, looplog, lastdeath, revert,
 *           testsound, reset, named <name>, named list, named delete <name>,
 *           particles on|off, debug, forcerestore, debug_save, help
 *   Op:     !rbd interval, cooldown, broadcast, radius, volume, pitch,
 *           maxnamed, mod
 *
 * SLASH COMMANDS (Layer 1 - Bedrock 1.21.80+, no Beta APIs needed):
 *   Same as above but typed as /rbd:save, /rbd:info, etc.
 *
 * ITEM UI (Layer 3 - universal fallback):
 *   Right-click the "RBD Notebook" item (given on join) for a button menu.
 *
 * IMPORTANT SOUND NOTE:
 *   - Sound is in the RESOURCE pack (not behavior pack) - Bedrock only loads
 *     custom sounds from resource packs.
 *   - If sound doesn't play: restart MC client completely, ensure both packs
 *     are active in the world.
 */

import {
  world,
  system,
  GameMode,
  EntityComponentTypes,
  EquipmentSlot,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
} from "@minecraft/server";

// ============================ Configuration ============================

const SAVE_SOUND_ID = "rbd.return_by_death";
const INVULN_TICKS_AFTER_RETURN = 60;
const ITEM_DESPAWN_RADIUS = 8;
const MAX_LOG_ENTRIES = 10;

// v1.2.5: Particle beacon (restored in v1.4.0)
const BEACON_INTERVAL_TICKS = 20;
const BEACON_MAX_DISTANCE = 64;

// Tier 1 config
const WITCH_SCENT_DURATION_MS = 60_000;
const WITCH_SCENT_INTERVAL_TICKS = 40;
const HEARTBEAT_HP_THRESHOLD = 6;
const HEARTBEAT_CHECK_TICKS = 20;
const WITCH_WATCHING_INTERVAL = 5;

// Track which command layers are active (for /rbd debug)
const LAYERS = {
  customCommand: false,
  chatSend: false,
  itemUI: false,
};

// Default config (persists in world dynamic property)
const DEFAULT_CONFIG = {
  enabled: true,
  saveIntervalSeconds: 20,
  cooldownSeconds: 0,
  broadcastDeaths: false,
  broadcastRadius: -1,            // v1.4.0: restored from v1.2.5 (-1 = global)
  soundVolume: 100,
  soundPitch: 100,
  particleBeaconEnabled: true,
  deathCounterEnabled: true,
  maxNamedSavePoints: 3,
  actionBarCooldown: true,
  witchScentEnabled: true,
  deathQuotesEnabled: true,
  heartbeatEnabled: true,
  witchWatchingEnabled: true,
};

let CONFIG = loadConfig();

function loadConfig() {
  try {
    const raw = world.getDynamicProperty("rbd:config");
    if (raw && typeof raw === "string") {
      return Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw));
    }
  } catch (e) {
    console.log("[RBD] Failed to load config:", e);
  }
  return Object.assign({}, DEFAULT_CONFIG);
}

function saveConfig() {
  try {
    world.setDynamicProperty("rbd:config", JSON.stringify(CONFIG));
  } catch (e) {
    console.log("[RBD] Failed to save config:", e);
  }
}

// ============================ Save State Store ============================

const saves = new Map();
const namedSaves = new Map();
const pendingReturns = new Set();
const deathLocations = new Map();
const cooldownUntil = new Map();
const particleOverride = new Map();
const witchScentUntil = new Map();
const GLOBAL_REWIND_ACTIVE = { value: false };

// ============================ Helpers ============================

function log(...args) {
  console.log("[RBD]", ...args);
}

function warn(...args) {
  console.warn("[RBD WARNING]", ...args);
}

function announce(player, message) {
  try {
    player.sendMessage("\u00a7d\u00a7l[Return By Death]\u00a7r " + message);
  } catch (_) {}
}

function isOp(player) {
  try {
    return player.isOp();
  } catch (_) {
    return player.hasTag("rbdop") || player.hasTag("operator");
  }
}

// ============================ Setup gamerules at startup ============================

system.run(() => {
  try {
    const ov = world.getDimension("overworld");
    try { ov.runCommand("gamerule doimmediaterespawn true"); } catch (_) {}
    try { ov.runCommand("gamerule keepinventory true"); } catch (_) {}
    try { ov.runCommand("gamerule showdeathmessages false"); } catch (_) {}
    log("Startup: gamerules set (doimmediaterespawn=true, keepinventory=true, showdeathmessages=false)");
  } catch (e) {
    warn("Startup: failed to set gamerules:", e);
  }
});

// ============================ Capture / Restore ============================

function captureSave(player) {
  try {
    const loc = player.location;
    const rot = player.getRotation();
    const dim = player.dimension.id;

    // Inventory (36 slots)
    const inventory = [];
    try {
      const invComp = player.getComponent(EntityComponentTypes.Inventory);
      if (invComp && invComp.container) {
        const c = invComp.container;
        for (let i = 0; i < c.size; i++) {
          const it = c.getItem(i);
          if (it) inventory.push({ slot: i, item: it.clone() });
        }
      }
    } catch (e) { warn("captureSave: inventory failed:", e); }

    // Armor + offhand
    const equipment = {};
    try {
      const eqComp = player.getComponent(EntityComponentTypes.Equippable);
      if (eqComp) {
        for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) {
          const it = eqComp.getEquipment(slot);
          if (it) equipment[slot] = it.clone();
        }
      }
    } catch (_) {}

    // Vitals
    let health = 20, hunger = 20, xpLevel = 0, totalXp = 0;
    try { const h = player.getComponent("minecraft:health"); if (h) health = h.currentValue; } catch (_) {}
    try {
      const hungerCandidates = ["minecraft:player.hunger", "minecraft:hunger", "minecraft:food"];
      for (const c of hungerCandidates) {
        const comp = player.getComponent(c);
        if (comp) {
          if (typeof comp.currentValue === 'number') { hunger = comp.currentValue; break; }
          if (typeof comp.getCurrentValue === 'function') { hunger = comp.getCurrentValue(); break; }
        }
      }
    } catch (_) {}
    try { if (player.level !== undefined) xpLevel = player.level; } catch (_) {}
    try {
      if (typeof player.getTotalExperience === 'function') totalXp = player.getTotalExperience();
      else if (player.totalExperience !== undefined) totalXp = player.totalExperience;
    } catch (_) {}

    // Effects
    const effects = [];
    try {
      const activeEffects = player.getEffects();
      if (activeEffects && Array.isArray(activeEffects)) {
        for (const e of activeEffects) {
          effects.push({
            typeId: e.typeId,
            duration: e.duration,
            amplifier: e.amplifier,
            showParticles: e.showParticles,
          });
        }
      }
    } catch (_) {}

    let fireTicks = 0;
    try { if (player.isOnFire) fireTicks = 60; } catch (_) {}

    return {
      dimensionId: dim,
      x: loc.x, y: loc.y, z: loc.z,
      rx: rot.x, ry: rot.y,
      inventory,
      equipment,
      health, hunger, xpLevel, totalXp,
      effects,
      fireTicks,
      onFire: !!fireTicks,
      timestamp: Date.now(),
    };
  } catch (e) {
    warn("captureSave failed entirely:", e);
    return null;
  }
}

function restoreSave(player, save) {
  log("restoreSave: starting for", player.name);

  // v1.2.3 BUGFIX: Health safety check
  let safeHealth = save.health;
  if (safeHealth <= 0) {
    log("restoreSave: WARNING save.health was", safeHealth, "- falling back to 20");
    safeHealth = 20;
  }
  let safeHunger = save.hunger;
  if (safeHunger < 6) {
    log("restoreSave: WARNING save.hunger was", safeHunger, "- clamping to 6");
    safeHunger = 6;
  }

  // TELEPORT (attempt 1)
  try {
    const targetDim = world.getDimension(save.dimensionId);
    player.teleport({ x: save.x, y: save.y, z: save.z }, {
      dimension: targetDim,
      rotation: { x: save.rx, y: save.ry },
      keepVelocity: false,
    });
    log("restoreSave: teleport #1 OK");
  } catch (e) {
    log("restoreSave: teleport #1 FAILED:", e);
  }

  // Restore inventory
  try {
    const invComp = player.getComponent(EntityComponentTypes.Inventory);
    if (invComp && invComp.container) {
      const c = invComp.container;
      for (let i = 0; i < c.size; i++) c.setItem(i, undefined);
      let restoredCount = 0;
      for (const { slot, item } of save.inventory) {
        try { c.setItem(slot, item); restoredCount++; } catch (e) { log("set slot", slot, "failed:", e); }
      }
      log("restoreSave: restored", restoredCount, "of", save.inventory.length, "items");
    }
  } catch (e) {
    log("restoreSave: inventory failed:", e);
  }

  // Restore armor + offhand
  try {
    const eqComp = player.getComponent(EntityComponentTypes.Equippable);
    if (eqComp) {
      for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) {
        const saved = save.equipment[slot];
        try { eqComp.setEquipment(slot, saved || undefined); } catch (_) {}
      }
    }
  } catch (_) {}

  // Vitals (with safety clamps)
  try {
    const h = player.getComponent("minecraft:health");
    if (h) {
      h.setCurrentValue(safeHealth);
      log("restoreSave: health set to", safeHealth);
    }
  } catch (e) { log("restoreSave: health failed:", e); }

  try {
    const hungerCandidates = ["minecraft:player.hunger", "minecraft:hunger", "minecraft:food"];
    let hungerRestored = false;
    for (const c of hungerCandidates) {
      try {
        const comp = player.getComponent(c);
        if (comp) {
          if (typeof comp.setCurrentValue === 'function') { comp.setCurrentValue(safeHunger); hungerRestored = true; break; }
          if ('currentValue' in comp) { comp.currentValue = safeHunger; hungerRestored = true; break; }
        }
      } catch (_) {}
    }
    if (!hungerRestored) {
      try { player.runCommandAsync("effect @s saturation 1 255 true"); } catch (_) {}
    }
  } catch (_) {}

  // XP
  try {
    if (typeof player.resetLevel === 'function') {
      player.resetLevel();
    } else {
      try { player.runCommandAsync("xp -1000000L @s"); } catch (_) {}
      try { player.runCommandAsync("xp -1000000 @s"); } catch (_) {}
    }
    if (save.totalXp > 0) {
      if (typeof player.addExperience === 'function') player.addExperience(save.totalXp);
      else try { player.runCommandAsync(`xp ${save.totalXp} @s`); } catch (_) {}
    } else if (save.xpLevel > 0) {
      if (typeof player.addLevels === 'function') player.addLevels(save.xpLevel);
      else try { player.runCommandAsync(`xp ${save.xpLevel}L @s`); } catch (_) {}
    }
  } catch (_) {}

  // Effects
  try {
    const existing = player.getEffects();
    if (existing && Array.isArray(existing)) {
      for (const e of existing) {
        try { player.removeEffect(e.typeId); } catch (_) {}
      }
    }
    if (save.effects && Array.isArray(save.effects)) {
      for (const e of save.effects) {
        try {
          player.addEffect(e.typeId, e.duration, {
            amplifier: e.amplifier,
            showParticles: e.showParticles,
          });
        } catch (_) {}
      }
    }
  } catch (_) {}

  // Fire
  try {
    if (save.onFire && save.fireTicks > 0) player.setOnFire(save.fireTicks, true);
    else player.extinguishFire();
  } catch (_) {}

  // Invulnerability
  try {
    player.addEffect("minecraft:resistance", INVULN_TICKS_AFTER_RETURN, { amplifier: 4, showParticles: false });
    player.addEffect("minecraft:fire_resistance", INVULN_TICKS_AFTER_RETURN, { amplifier: 1, showParticles: false });
  } catch (_) {}

  log("restoreSave: completed for", player.name);
}

function reTeleportToSave(player, save) {
  try {
    const targetDim = world.getDimension(save.dimensionId);
    player.teleport({ x: save.x, y: save.y, z: save.z }, {
      dimension: targetDim,
      rotation: { x: save.rx, y: save.ry },
      keepVelocity: false,
    });
    log("reTeleportToSave: teleport #2 OK");
  } catch (e) {
    log("reTeleportToSave: teleport #2 FAILED:", e);
    announce(player, `\u00a7cAuto-teleport failed. Use \u00a7e!rbd forcerestore\u00a7c or go to ${Math.floor(save.x)}, ${Math.floor(save.y)}, ${Math.floor(save.z)}`);
  }
}

// ============================ Sound ============================
// v1.4.0: respects CONFIG.soundVolume / soundPitch (was hardcoded 1.0 in v1.3.0).
// The OGG file itself is already boosted to -14dB (broadcast standard) from v1.2.4.

function playReturnByDeathSound() {
  const volume = Math.max(0, Math.min(1, CONFIG.soundVolume / 100));
  const pitch = Math.max(0.5, Math.min(2, CONFIG.soundPitch / 100));
  if (volume <= 0) return;
  try {
    for (const p of world.getAllPlayers()) {
      try { p.playSound(SAVE_SOUND_ID, { volume, pitch }); } catch (_) {}
    }
    log("playReturnByDeathSound: played to all players (vol=" + volume + ")");
  } catch (e) {
    warn("playReturnByDeathSound failed:", e);
  }
}

function playReturnByDeathSoundToPlayer(player) {
  try {
    const volume = Math.max(0, Math.min(1, CONFIG.soundVolume / 100));
    const pitch = Math.max(0.5, Math.min(2, CONFIG.soundPitch / 100));
    if (volume <= 0) return;
    player.playSound(SAVE_SOUND_ID, { volume, pitch });
  } catch (_) {}
}

function clearDroppedItemsNear(deathLoc, dimensionId) {
  try {
    const dim = world.getDimension(dimensionId);
    const items = dim.getEntities({
      location: deathLoc,
      maxDistance: ITEM_DESPAWN_RADIUS,
      type: "minecraft:item",
    });
    for (const it of items) {
      try { it.remove(); } catch (_) {}
    }
  } catch (e) {
    log("clearDroppedItemsNear failed:", e);
  }
}

// ============================ Death counter + log ============================

function getDeathCount(player) {
  const v = player.getDynamicProperty("rbd:deathCount");
  return typeof v === "number" ? v : 0;
}

function incrementDeathCount(player) {
  const newCount = getDeathCount(player) + 1;
  player.setDynamicProperty("rbd:deathCount", newCount);
  return newCount;
}

function getDeathLog(player) {
  try {
    const raw = player.getDynamicProperty("rbd:deathLog");
    if (raw && typeof raw === "string") return JSON.parse(raw);
  } catch (_) {}
  return [];
}

function addDeathLog(player, record) {
  let log = getDeathLog(player);
  log.unshift(record);
  while (log.length > MAX_LOG_ENTRIES) log.pop();
  try { player.setDynamicProperty("rbd:deathLog", JSON.stringify(log)); } catch (_) {}
}

// ============================ Death Cause Naming ============================

function describeDeathCause(damageSource) {
  if (!damageSource) return "unknown";
  const cause = damageSource.cause;
  const entity = damageSource.damagingEntity;
  let causeStr = cause || "unknown";
  const causeMap = {
    "entityAttack": "entity attack",
    "entityExplosion": "explosion",
    "projectile": "projectile",
    "fire": "fire",
    "fireTick": "burning",
    "lava": "lava",
    "drowning": "drowning",
    "fall": "fall damage",
    "starve": "starvation",
    "suffocation": "suffocation",
    "void": "the void",
    "magic": "magic",
    "lightning": "lightning",
    "freezing": "freezing",
    "stalactite": "falling stalactite",
    "stalagmite": "stalagmite",
    "campfire": "campfire",
    "soulCampfire": "soul campfire",
    "magma": "magma block",
    "wither": "wither effect",
    "anvil": "falling anvil",
    "flyIntoWall": "kinetic energy",
    "override": "instant kill",
  };
  causeStr = causeMap[cause] || cause || "unknown";
  if (entity) {
    const t = entity.typeId ? entity.typeId.replace("minecraft:", "") : "unknown";
    causeStr += ` (${t})`;
  }
  return causeStr;
}

// ============================ Particle Beacon (restored from v1.2.5) ============================

function spawnBeaconParticles(player, save) {
  if (!CONFIG.particleBeaconEnabled) return;
  if (particleOverride.get(player.id) === false) return;
  if (player.dimension.id !== save.dimensionId) return;

  const dx = player.location.x - save.x;
  const dy = player.location.y - save.y;
  const dz = player.location.z - save.z;
  if (dx*dx + dy*dy + dz*dz > BEACON_MAX_DISTANCE * BEACON_MAX_DISTANCE) return;

  const dim = player.dimension;
  const base = { x: save.x, y: save.y, z: save.z };

  try {
    // Vertical column of crit particles
    for (let i = 0; i < 3; i++) {
      dim.spawnParticle("minecraft:basic_crit_particle", { x: base.x, y: base.y + 0.3 + i * 0.4, z: base.z });
    }
    // End rod beacon on top
    dim.spawnParticle("minecraft:endrod", { x: base.x, y: base.y + 1.5, z: base.z });
    // v1.4.0: 4-direction ring (restored from v1.2.5, was missing in v1.3.0)
    for (let angle = 0; angle < 360; angle += 90) {
      const rad = angle * Math.PI / 180;
      dim.spawnParticle("minecraft:basic_crit_particle", {
        x: base.x + Math.cos(rad) * 0.5,
        y: base.y + 0.05,
        z: base.z + Math.sin(rad) * 0.5,
      });
    }
  } catch (_) {}
}

// ============================ Witch Scent (Tier 1 flavor) ============================

function triggerWitchScent(player) {
  if (!CONFIG.witchScentEnabled) return;
  witchScentUntil.set(player.id, Date.now() + WITCH_SCENT_DURATION_MS);
  try { player.onScreenDisplay.setActionBar("\u00a78\u00a7oThe scent of the Witch clings to you..."); } catch (_) {}
}

function tickWitchScent() {
  if (!CONFIG.witchScentEnabled) return;
  const now = Date.now();
  for (const player of world.getAllPlayers()) {
    const until = witchScentUntil.get(player.id);
    if (!until || until <= now) {
      if (until) witchScentUntil.delete(player.id);
      continue;
    }
    spawnWitchScentParticles(player);
  }
}

function spawnWitchScentParticles(player) {
  const dim = player.dimension;
  const x = player.location.x;
  const y = player.location.y + 1.0;
  const z = player.location.z;
  try {
    // Ring of soul particles around the player
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2.0) / 8.0;
      const px = x + Math.cos(angle) * 0.8;
      const pz = z + Math.sin(angle) * 0.8;
      dim.spawnParticle("minecraft:soul_particle", { x: px, y, z: pz });
    }
    // v1.4.0: A few extra soul particles drifting up (restored from v1.2.5)
    for (let i = 0; i < 3; i++) {
      dim.spawnParticle("minecraft:soul_particle", {
        x: x + (Math.random() - 0.5) * 0.5,
        y: y - 0.5 + Math.random() * 1.5,
        z: z + (Math.random() - 0.5) * 0.5,
      });
    }
  } catch (_) {}
}

// ============================ Death Quotes ============================

const DEATH_QUOTES = [
  "I have to die again...",
  "From zero. I'll restart from zero.",
  "This time, I'll save them.",
  "Return... by death.",
  "I'll definitely save you. No matter how many times I have to die.",
  "The Witch is watching.",
  "Once more, from zero.",
  "I can't give up. Not yet.",
  "Even if it costs me my life...",
  "Just one more loop. I can do this.",
  "I died again. But that's fine. I can try again.",
  "If I die, I can start over. That's the only power I have.",
  "I'm not afraid of dying. I'm afraid of not being able to save anyone.",
  "The scent of the Witch grows stronger.",
  "This pain is just the price of going back.",
];

function sendDeathQuote(player) {
  if (!CONFIG.deathQuotesEnabled) return;
  const quote = DEATH_QUOTES[Math.floor(Math.random() * DEATH_QUOTES.length)];
  try { player.sendMessage("\u00a7d\u00a7o\"" + quote + "\"\u00a7r\u00a77 \u2014 Natsuki Subaru"); } catch (_) {}
}

// ============================ Heartbeat at low HP ============================

function tickHeartbeat() {
  if (!CONFIG.heartbeatEnabled) return;
  for (const player of world.getAllPlayers()) {
    try {
      if (player.getGameMode() === GameMode.creative || player.getGameMode() === GameMode.spectator) continue;
      const healthComp = player.getComponent("minecraft:health");
      if (!healthComp) continue;
      const hp = healthComp.currentValue;
      if (hp > 0 && hp <= HEARTBEAT_HP_THRESHOLD) {
        // v1.4.0: scale volume with proximity to death (restored from v1.2.5)
        const volume = 0.4 + (1.0 - hp / HEARTBEAT_HP_THRESHOLD) * 0.6;
        try {
          player.playSound("mob.warden.heartbeat", { volume, pitch: 1.0 });
        } catch (_) {
          try { player.playSound("note.bass", { volume, pitch: 0.6 }); } catch (_) {}
        }
      }
    } catch (_) {}
  }
}

// ============================ Death Title Overlay ============================

function showDeathTitle(player, loopCount) {
  try {
    const title = "\u00a7d\u00a7lReturned By Death";
    const subtitle = loopCount > 0
      ? `\u00a77Loop \u00a7e#${loopCount}`
      : "\u00a77The Witch smiles...";
    player.onScreenDisplay.setTitle(title, {
      stayDuration: 60,
      fadeInDuration: 10,
      fadeOutDuration: 20,
      subtitle: subtitle,
    });
  } catch (e) {
    log("showDeathTitle failed:", e);
  }
}

// ============================ TRIGGER RETURN ============================
// v1.4.0: now accepts damageSource so the death log can record the real cause.
// (v1.3.0 hardcoded "unknown" - that regression is fixed here.)

function triggerReturn(deadPlayer, damageSource) {
  if (GLOBAL_REWIND_ACTIVE.value) return;
  if (pendingReturns.has(deadPlayer.id)) return;
  if (!CONFIG.enabled) return;

  // Cooldown check
  const cdUntil = cooldownUntil.get(deadPlayer.id);
  const now = Date.now();
  if (cdUntil && cdUntil > now) {
    const secs = Math.ceil((cdUntil - now) / 1000);
    try { announce(deadPlayer, `\u00a7cCooldown active! Cannot rewind for ${secs} more second(s). Death is permanent this time.`); } catch (_) {}
    return;
  }

  if (!saves.has(deadPlayer.id)) {
    try { announce(deadPlayer, "\u00a7cNo save point exists \u2014 death is permanent!"); } catch (_) {}
    return;
  }

  GLOBAL_REWIND_ACTIVE.value = true;
  pendingReturns.add(deadPlayer.id);

  // v1.4.0: extract death cause (was hardcoded "unknown" in v1.3.0)
  const causeStr = describeDeathCause(damageSource);

  log(`triggerReturn: ${deadPlayer.name} died (cause: ${causeStr}). Marking for return.`);

  // 1. Play the iconic sound to everyone (respects CONFIG.soundVolume)
  playReturnByDeathSound();

  // 2. Increment death counter
  let loopCount = 0;
  if (CONFIG.deathCounterEnabled) {
    try { loopCount = incrementDeathCount(deadPlayer); } catch (_) {}
  }

  // 3. Add to death log
  try {
    const deathLoc = deadPlayer.location;
    if (deathLoc) {
      addDeathLog(deadPlayer, {
        time: now,
        dimension: deadPlayer.dimension.id,
        x: deathLoc.x, y: deathLoc.y, z: deathLoc.z,
        cause: causeStr,
      });
      deathLocations.set(deadPlayer.id, {
        x: deathLoc.x, y: deathLoc.y, z: deathLoc.z,
        dimensionId: deadPlayer.dimension.id,
      });
    }
  } catch (_) {}

  // 4. Death title overlay
  try { showDeathTitle(deadPlayer, loopCount); } catch (_) {}

  // 5. Tier 1 features
  try { sendDeathQuote(deadPlayer); } catch (_) {}
  try { triggerWitchScent(deadPlayer); } catch (_) {}
  if (loopCount > 0 && loopCount % WITCH_WATCHING_INTERVAL === 0 && CONFIG.witchWatchingEnabled) {
    try { deadPlayer.onScreenDisplay.setActionBar("\u00a78\u00a7l\u00a7oThe Witch of Envy is watching you..."); } catch (_) {}
  }

  // 6. Notify player
  try {
    announce(deadPlayer, "\u00a7dYou have died. Returning to your save point...");
    if (loopCount > 0) {
      announce(deadPlayer, `\u00a77  Loop count: \u00a7e${loopCount}\u00a77 (this is death #${loopCount})`);
      announce(deadPlayer, `\u00a77  Cause: \u00a7c${causeStr}`);
    }
  } catch (_) {}

  // 7. Broadcast (v1.4.0: respects broadcastRadius)
  if (CONFIG.broadcastDeaths) {
    try {
      for (const p of world.getAllPlayers()) {
        if (p.id === deadPlayer.id) continue;
        if (CONFIG.broadcastRadius > 0) {
          // Distance check
          try {
            const pDim = p.dimension.id;
            if (pDim !== deadPlayer.dimension.id) continue;
            const dx = p.location.x - deadPlayer.location.x;
            const dy = p.location.y - deadPlayer.location.y;
            const dz = p.location.z - deadPlayer.location.z;
            if (dx*dx + dy*dy + dz*dz > CONFIG.broadcastRadius * CONFIG.broadcastRadius) continue;
          } catch (_) { continue; }
        }
        p.sendMessage(`\u00a7d[Return By Death]\u00a7r \u00a77${deadPlayer.name} has died and rewound to their save point.`);
      }
    } catch (_) {}
  }

  // 8. Set cooldown
  if (CONFIG.cooldownSeconds > 0) {
    cooldownUntil.set(deadPlayer.id, now + CONFIG.cooldownSeconds * 1000);
  }

  // 9. Clear the mutex after 60 ticks (3 seconds)
  system.runTimeout(() => {
    GLOBAL_REWIND_ACTIVE.value = false;
  }, 60);
}

// ============================ Periodic save loop ============================

let saveTickCount = 0;
let saveIndicatorCounter = 0;
system.runInterval(() => {
  if (!CONFIG.enabled) return;
  saveTickCount++;
  if (saveTickCount < CONFIG.saveIntervalSeconds * 20) return;
  saveTickCount = 0;
  saveIndicatorCounter++;

  for (const player of world.getAllPlayers()) {
    try {
      if (player.getGameMode() === GameMode.spectator) continue;
      const save = captureSave(player);
      if (save) {
        saves.set(player.id, save);
        if (saveIndicatorCounter % 3 === 0) {
          try { player.onScreenDisplay.setActionBar("\u00a7d\u26a1 Save point recorded"); } catch (_) {}
        }
      }
    } catch (e) {
      log("Save failed for", player.name, ":", e);
    }
  }
}, 20);

// ============================ Particle beacon loop ============================

system.runInterval(() => {
  if (!CONFIG.enabled) return;
  for (const player of world.getAllPlayers()) {
    const save = saves.get(player.id);
    if (save) spawnBeaconParticles(player, save);
  }
}, BEACON_INTERVAL_TICKS);

// Witch scent loop
system.runInterval(() => {
  if (!CONFIG.enabled) return;
  tickWitchScent();
}, WITCH_SCENT_INTERVAL_TICKS);

// Heartbeat loop
system.runInterval(() => {
  if (!CONFIG.enabled) return;
  tickHeartbeat();
}, HEARTBEAT_CHECK_TICKS);

// Action bar cooldown display loop
system.runInterval(() => {
  if (!CONFIG.enabled || !CONFIG.actionBarCooldown) return;
  const now = Date.now();
  for (const player of world.getAllPlayers()) {
    const cdUntil = cooldownUntil.get(player.id);
    if (!cdUntil || cdUntil <= now) continue;
    const seconds = Math.ceil((cdUntil - now) / 1000);
    try { player.onScreenDisplay.setActionBar(`\u00a7c\u00a7l[RBD]\u00a7r \u00a7cCooldown: \u00a7e${seconds}s`); } catch (_) {}
  }
}, 10);

// ============================ DEATH DETECTION (3 methods) ============================

// Method 1: entityDie event (most reliable - matches reference pack)
// v1.4.0: pass ev.damageSource to triggerReturn so cause is recorded in death log
try {
  if (world.afterEvents && world.afterEvents.entityDie) {
    world.afterEvents.entityDie.subscribe((ev) => {
      try {
        if (ev.deadEntity && ev.deadEntity.typeId === "minecraft:player") {
          log("entityDie: player died:", ev.deadEntity.name);
          triggerReturn(ev.deadEntity, ev.damageSource);
        }
      } catch (e) {
        warn("entityDie handler failed:", e);
      }
    });
    log("Death detection Method 1 (entityDie): registered");
  } else {
    warn("Death detection Method 1 (entityDie): NOT AVAILABLE");
  }
} catch (e) {
  warn("entityDie subscription failed:", e);
}

// Method 2: Polling fallback - check every tick if any player's HP < 0.1
// Catches deaths that the event might miss (e.g. /kill from console).
system.runInterval(() => {
  if (!CONFIG.enabled) return;
  try {
    for (const player of world.getAllPlayers()) {
      try {
        if (player.getGameMode() === GameMode.spectator) continue;
        const h = player.getComponent("minecraft:health");
        if (h && h.currentValue < 0.1 && !GLOBAL_REWIND_ACTIVE.value && !pendingReturns.has(player.id)) {
          log("Polling: detected player death (HP < 0.1):", player.name);
          triggerReturn(player, undefined);  // cause unknown for polling path
        }
      } catch (_) {}
    }
  } catch (_) {}
}, 1);

// ============================ Respawn handler ============================

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (ev.initialSpawn) {
    // First spawn - create initial save + give RBD Notebook
    const player = ev.player;
    try {
      const save = captureSave(player);
      if (save) saves.set(player.id, save);
    } catch (e) { log("Initial save failed:", e); }

    try {
      announce(player, "\u00a7aA save point has been created. State is recorded every " + CONFIG.saveIntervalSeconds + "s.");
      announce(player, "\u00a77When you die, you rewind to your save point with everything you had then.");
      announce(player, "\u00a77Type \u00a7e!rbd help\u00a77 for chat commands, or use \u00a7e/rbd:help\u00a77 if on Bedrock 1.21.80+.");
      announce(player, "\u00a77Or right-click the \u00a7dRBD Notebook\u00a77 item for a menu.");
    } catch (_) {}

    try { giveRBDNotebook(player); } catch (_) {}
    return;
  }

  // Respawn (not initial) - check if we have a pending return
  const player = ev.player;
  if (!pendingReturns.has(player.id)) return;

  pendingReturns.delete(player.id);

  const save = saves.get(player.id);
  if (!save) {
    try { announce(player, "\u00a7cNo save point available. Could not restore."); } catch (_) {}
    return;
  }

  log("onRespawn: player", player.name, "respawned with pending return. Scheduling restore.");

  // Clear dropped items near death location (immediate)
  system.run(() => {
    try {
      const deathLoc = deathLocations.get(player.id);
      if (deathLoc) {
        clearDroppedItemsNear({ x: deathLoc.x, y: deathLoc.y, z: deathLoc.z }, deathLoc.dimensionId);
        deathLocations.delete(player.id);
      }
    } catch (e) {
      log("onRespawn: clear dropped items failed:", e);
    }
  });

  // FIRST restore attempt: after 5 ticks
  system.runTimeout(() => {
    try {
      log("onRespawn: running restoreSave (attempt 1)");
      restoreSave(player, save);
      playReturnByDeathSoundToPlayer(player);
      try {
        announce(player, `\u00a7aReturned to your save point at \u00a77${Math.floor(save.x)}, ${Math.floor(save.y)}, ${Math.floor(save.z)}\u00a7a in \u00a7b${save.dimensionId.replace("minecraft:", "")}\u00a7a.`);
      } catch (_) {}
    } catch (e) {
      log("onRespawn: restoreSave attempt 1 FAILED:", e);
      try { announce(player, "\u00a7cFirst restore attempt failed. Retrying..."); } catch (_) {}
    }
  }, 5);

  // SECOND teleport: after 15 ticks to confirm position sticks
  system.runTimeout(() => {
    try {
      if (player && player.isValid()) {
        reTeleportToSave(player, save);
      }
    } catch (e) {
      log("onRespawn: reTeleport failed:", e);
    }
  }, 15);
});

// ============================ Revert function ============================

function revertPlayer(player) {
  if (!CONFIG.enabled) return "Mod is disabled";
  const cdUntil = cooldownUntil.get(player.id);
  const now = Date.now();
  if (cdUntil && cdUntil > now) {
    const secs = Math.ceil((cdUntil - now) / 1000);
    return `Cooldown active: ${secs} more second(s)`;
  }
  const save = saves.get(player.id);
  if (!save) return "No save point exists";
  try {
    restoreSave(player, save);
    announce(player, `\u00a7aReverted to your save point at \u00a77${Math.floor(save.x)}, ${Math.floor(save.y)}, ${Math.floor(save.z)}\u00a7a in \u00a7b${save.dimensionId.replace("minecraft:", "")}\u00a7a.`);
    if (CONFIG.cooldownSeconds > 0) {
      cooldownUntil.set(player.id, now + CONFIG.cooldownSeconds * 1000);
    }
    return null;
  } catch (e) {
    return "Failed to restore: " + e;
  }
}

// ============================ LAYER 1: CustomCommandRegistry (Bedrock 1.21.80+) ============================

const PERM_ANY = CommandPermissionLevel?.Any ?? 0;
const PERM_GAME_DIRECTORS = CommandPermissionLevel?.GameDirectors ?? 1;
const PARAM_STRING = CustomCommandParamType?.String ?? "String";
const STATUS_SUCCESS = CustomCommandStatus?.Success ?? 0;
const STATUS_FAILURE = CustomCommandStatus?.Failure ?? 1;

try {
  if (system.beforeEvents && typeof system.beforeEvents.startup !== "undefined") {
    system.beforeEvents.startup.subscribe((event) => {
      try {
        const registry = event.customCommandRegistry;
        if (!registry || typeof registry.registerCommand !== "function") {
          warn("Layer 1: CustomCommandRegistry not available (need Bedrock 1.21.80+).");
          return;
        }

        function registerSimple(name, description, permLevel) {
          try {
            registry.registerCommand({
              name, description, permissionLevel: permLevel, cheatsRequired: false,
            }, (origin) => {
              try {
                const player = origin?.sourceEntity;
                if (!player || player.typeId !== "minecraft:player") {
                  return { status: STATUS_FAILURE, message: "Only players can use this command." };
                }
                const sub = name.substring("rbd:".length);
                let parts = [sub];
                if (sub === "named_list") parts = ["named", "list"];
                if (sub === "named_delete") parts = ["named", "delete"];
                if (sub === "debug_save") parts = ["debug_save"];
                system.run(() => {
                  try { handleCommand(player, parts[0], parts); } catch (e) { warn("Layer 1 cmd error:", e); }
                });
                return { status: STATUS_SUCCESS };
              } catch (e) {
                warn(`Layer 1: handler for ${name} failed:`, e);
                return { status: STATUS_FAILURE, message: String(e) };
              }
            });
            return true;
          } catch (e) {
            warn(`Layer 1: failed to register ${name}:`, e);
            return false;
          }
        }

        function registerWithStringParam(name, description, permLevel, paramName) {
          try {
            registry.registerCommand({
              name, description, permissionLevel: permLevel, cheatsRequired: false,
              mandatoryParameters: [{ name: paramName, type: PARAM_STRING }],
            }, (origin, value) => {
              try {
                const player = origin?.sourceEntity;
                if (!player || player.typeId !== "minecraft:player") {
                  return { status: STATUS_FAILURE, message: "Only players can use this command." };
                }
                const sub = name.substring("rbd:".length);
                const parts = [sub, undefined, String(value)];
                system.run(() => {
                  try { handleCommand(player, parts[0], parts); } catch (e) { warn("Layer 1 cmd error:", e); }
                });
                return { status: STATUS_SUCCESS };
              } catch (e) {
                warn(`Layer 1: handler for ${name} failed:`, e);
                return { status: STATUS_FAILURE, message: String(e) };
              }
            });
            return true;
          } catch (e) {
            warn(`Layer 1: failed to register ${name}:`, e);
            return false;
          }
        }

        // Player commands (no params)
        const playerSimple = ["save", "info", "status", "loops", "looplog", "lastdeath", "revert", "testsound", "reset", "debug", "forcerestore", "debug_save", "help"];
        let count = 0;
        for (const cmd of playerSimple) {
          if (registerSimple(`rbd:${cmd}`, `Return By Death - ${cmd}`, PERM_ANY)) count++;
        }
        // /rbd:named <name>
        if (registerWithStringParam("rbd:named", "Create a named save point", PERM_ANY, "name")) count++;
        if (registerSimple("rbd:named_list", "List named save points", PERM_ANY)) count++;
        if (registerWithStringParam("rbd:named_delete", "Delete a named save point", PERM_ANY, "name")) count++;
        if (registerWithStringParam("rbd:particles", "Toggle particles (on|off)", PERM_ANY, "state")) count++;

        // Op commands (with params)
        const opNumeric = [
          { name: "rbd:interval", desc: "Set save interval (1-600 sec)", param: "seconds" },
          { name: "rbd:cooldown", desc: "Set cooldown (0-3600 sec)", param: "seconds" },
          { name: "rbd:radius",   desc: "Set broadcast radius (-1 = global)", param: "blocks" },  // v1.4.0: restored
          { name: "rbd:volume",   desc: "Set sound volume (0-100%)", param: "percent" },
          { name: "rbd:pitch",    desc: "Set sound pitch (50-200%)", param: "percent" },
          { name: "rbd:maxnamed", desc: "Set max named save points (0-20)", param: "count" },
        ];
        for (const c of opNumeric) {
          if (registerWithStringParam(c.name, c.desc, PERM_GAME_DIRECTORS, c.param)) count++;
        }
        for (const cmd of ["broadcast", "mod"]) {
          if (registerWithStringParam(`rbd:${cmd}`, `Return By Death (op) - ${cmd} <on|off>`, PERM_GAME_DIRECTORS, "state")) count++;
        }

        LAYERS.customCommand = true;
        log(`Layer 1 (CustomCommandRegistry): registered ${count} commands`);
        log("Layer 1: Try /rbd:help or /rbd:save in chat (with autocomplete).");
      } catch (e) {
        warn("Layer 1 setup failed:", e);
      }
    });
  } else {
    warn("Layer 1 (CustomCommandRegistry): need Bedrock 1.21.80+. Falling back to chat handlers.");
  }
} catch (e) {
  warn("Layer 1 init failed:", e);
}

// ============================ LAYER 2: chatSend (fallback for older Bedrock) ============================

try {
  if (world.beforeEvents && typeof world.beforeEvents.chatSend !== "undefined") {
    world.beforeEvents.chatSend.subscribe((ev) => {
      try {
        const msg = ev.message.trim();
        if (!msg.toLowerCase().startsWith("!rbd")) return;
        ev.cancel = true;
        const sender = ev.sender;
        const parts = msg.split(/\s+/);
        const sub = (parts[1] || "help").toLowerCase();
        system.run(() => {
          try { handleCommand(sender, sub, parts); }
          catch (e) { warn("Chat cmd error:", e); announce(sender, "\u00a7cCommand error: " + e); }
        });
      } catch (e) {
        warn("chatSend handler failed:", e);
      }
    });
    LAYERS.chatSend = true;
    log("Layer 2 (chatSend): registered - !rbd chat commands active");
  } else {
    warn("Layer 2 (chatSend): not available. Use /rbd: commands or RBD Notebook.");
  }
} catch (e) {
  warn("Layer 2 init failed:", e);
}

// ============================ LAYER 3: RBD Notebook item UI ============================

const NOTEBOOK_ITEM_TYPE = "minecraft:writable_book";
const NOTEBOOK_ITEM_NAME = "\u00a7d\u00a7lRBD Notebook\u00a7r\u00a77\n\u00a77Right-click to open command menu";

function giveRBDNotebook(player) {
  try {
    const invComp = player.getComponent(EntityComponentTypes.Inventory);
    if (!invComp || !invComp.container) return;
    for (let i = 0; i < invComp.container.size; i++) {
      const it = invComp.container.getItem(i);
      if (it && it.typeId === NOTEBOOK_ITEM_TYPE && it.nameTag === NOTEBOOK_ITEM_NAME) {
        return;
      }
    }
    const { ItemStack } = require("@minecraft/server");
    const notebook = new ItemStack(NOTEBOOK_ITEM_TYPE, 1);
    notebook.nameTag = NOTEBOOK_ITEM_NAME;
    invComp.container.addItem(notebook);
  } catch (e) {
    log("giveRBDNotebook failed:", e);
  }
}

async function openRBDMenu(player) {
  try {
    const ui = await import("@minecraft/server-ui");
    const ActionFormData = ui.ActionFormData;
    const menu = new ActionFormData()
      .title("\u00a7d\u00a7lReturn By Death")
      .body("\u00a77Select a command:")
      .button("\u00a7aSave Point\n\u00a77Create a save point now")
      .button("\u00a7aInfo\n\u00a77Show save point details")
      .button("\u00a7aStatus\n\u00a77Show all mod settings")
      .button("\u00a7aLoops\n\u00a77Show your death count")
      .button("\u00a7aLoop Log\n\u00a77Show last 10 deaths")
      .button("\u00a7aLast Death\n\u00a77Show most recent death")
      .button("\u00a7aRevert\n\u00a77Teleport to save point (no death)")
      .button("\u00a7aTest Sound\n\u00a77Play RBD sound to verify")
      .button("\u00a7aForce Restore\n\u00a77Manually restore to save point")
      .button("\u00a7aReset Save\n\u00a77Clear save point (permadeath)")
      .button("\u00a7aNamed Saves\n\u00a77Manage named save points")
      .button("\u00a7aDebug\n\u00a77Show active command layers")
      .button("\u00a7aHelp\n\u00a77Show full help")
      .button("\u00a7cClose");
    const response = await menu.show(player);
    if (response.canceled) return;
    const parts = buttonSelectionToCommand(response.selection);
    if (parts) {
      system.run(() => {
        try { handleCommand(player, parts[0], parts); }
        catch (e) { announce(player, "\u00a7cCommand error: " + e); }
      });
    }
  } catch (e) {
    announce(player, "\u00a7cFailed to open menu: " + e);
    log("openRBDMenu failed:", e);
  }
}

function buttonSelectionToCommand(selection) {
  switch (selection) {
    case 0: return ["save"];
    case 1: return ["info"];
    case 2: return ["status"];
    case 3: return ["loops"];
    case 4: return ["looplog"];
    case 5: return ["lastdeath"];
    case 6: return ["revert"];
    case 7: return ["testsound"];
    case 8: return ["forcerestore"];
    case 9: return ["reset"];
    case 10: return ["named", "list"];
    case 11: return ["debug"];
    case 12: return ["help"];
    case 13: return null;
    default: return null;
  }
}

try {
  if (world.beforeEvents && typeof world.beforeEvents.itemUse !== "undefined") {
    world.beforeEvents.itemUse.subscribe((ev) => {
      try {
        const player = ev.source;
        if (!player) return;
        const item = ev.itemStack;
        if (!item || item.typeId !== NOTEBOOK_ITEM_TYPE) return;
        if (item.nameTag !== NOTEBOOK_ITEM_NAME) return;
        ev.cancel = true;
        system.run(() => {
          try { openRBDMenu(player); } catch (e) { warn("openRBDMenu failed:", e); }
        });
      } catch (e) {
        warn("itemUse handler failed:", e);
      }
    });
    LAYERS.itemUI = true;
    log("Layer 3 (RBD Notebook UI): registered");
  } else {
    warn("Layer 3 (itemUse): not available.");
  }
} catch (e) {
  warn("Layer 3 init failed:", e);
}

// ============================ Command Handler ============================

function handleCommand(player, sub, parts) {
  switch (sub) {
    case "save": {
      const save = captureSave(player);
      if (save) {
        saves.set(player.id, save);
        announce(player, `\u00a7aSave point set at \u00a77${Math.floor(save.x)}, ${Math.floor(save.y)}, ${Math.floor(save.z)}\u00a7a in \u00a7b${save.dimensionId.replace("minecraft:", "")}\u00a7a.`);
      }
      break;
    }
    case "info": {
      const s = saves.get(player.id);
      if (!s) { announce(player, "\u00a7cNo save point exists yet."); break; }
      announce(player, `\u00a7aSave point: \u00a77${Math.floor(s.x)}, ${Math.floor(s.y)}, ${Math.floor(s.z)}\u00a7a in \u00a7b${s.dimensionId.replace("minecraft:", "")}`);
      announce(player, `\u00a7a  HP: \u00a7c${Math.floor(s.health)}\u00a7a   Hunger: \u00a76${Math.floor(s.hunger)}\u00a7a   XP Lvl: \u00a7e${s.xpLevel}`);
      announce(player, `\u00a7a  Effects: \u00a77${(s.effects || []).length} active   Fire: \u00a77${s.onFire ? "yes" : "no"}`);
      const named = namedSaves.get(player.id) || new Map();
      announce(player, `\u00a7a  Named save points: \u00a77${named.size} / ${CONFIG.maxNamedSavePoints}`);
      break;
    }
    case "status": {
      announce(player, "\u00a7d\u00a7l=== Return By Death v1.4.0 Status ===");
      announce(player, `\u00a7aEnabled: \u00a77${CONFIG.enabled}`);
      announce(player, `\u00a7aSave interval (sec): \u00a77${CONFIG.saveIntervalSeconds}`);
      announce(player, `\u00a7aCooldown (sec): \u00a77${CONFIG.cooldownSeconds}`);
      announce(player, `\u00a7aBroadcast deaths: \u00a77${CONFIG.broadcastDeaths}`);
      announce(player, `\u00a7aBroadcast radius: \u00a77${CONFIG.broadcastRadius} (-1 = global)`);
      announce(player, `\u00a7aSound volume: \u00a77${CONFIG.soundVolume}%`);
      announce(player, `\u00a7aSound pitch: \u00a77${CONFIG.soundPitch}%`);
      announce(player, `\u00a7aParticle beacon: \u00a77${CONFIG.particleBeaconEnabled}`);
      announce(player, `\u00a7aDeath counter: \u00a77${CONFIG.deathCounterEnabled}`);
      announce(player, `\u00a7aMax named save points: \u00a77${CONFIG.maxNamedSavePoints}`);
      announce(player, `\u00a7aAction bar cooldown: \u00a77${CONFIG.actionBarCooldown}`);
      announce(player, "\u00a76Tier 1 features:");
      announce(player, `\u00a7a  Witch scent: \u00a77${CONFIG.witchScentEnabled}`);
      announce(player, `\u00a7a  Death quotes: \u00a77${CONFIG.deathQuotesEnabled}`);
      announce(player, `\u00a7a  Heartbeat: \u00a77${CONFIG.heartbeatEnabled}`);
      announce(player, `\u00a7a  Witch watching msg: \u00a77${CONFIG.witchWatchingEnabled}`);
      break;
    }
    case "loops": {
      if (!CONFIG.deathCounterEnabled) {
        announce(player, "\u00a7cDeath counter is disabled.");
        break;
      }
      const count = getDeathCount(player);
      announce(player, `\u00a7aYou have died \u00a7e${count}\u00a7a time(s). Loop count: \u00a7e${count}`);
      break;
    }
    case "looplog": {
      const dl = getDeathLog(player);
      if (dl.length === 0) { announce(player, "\u00a77No deaths recorded yet."); break; }
      announce(player, `\u00a7d\u00a7l[RBD] Last ${dl.length} death(s):`);
      dl.forEach((r, i) => {
        const dt = new Date(r.time);
        const ts = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
        const dim = (r.dimension || "").replace("minecraft:", "");
        announce(player, `\u00a7e#${i+1} \u00a77${ts} \u00a7ain \u00a7b${dim} \u00a77@ ${Math.floor(r.x)}, ${Math.floor(r.y)}, ${Math.floor(r.z)} \u00a77cause: \u00a7c${r.cause}`);
      });
      break;
    }
    case "lastdeath": {
      const dl = getDeathLog(player);
      if (dl.length === 0) { announce(player, "\u00a77You have no recorded deaths."); break; }
      const r = dl[0];
      const dt = new Date(r.time);
      const ts = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
      const dim = (r.dimension || "").replace("minecraft:", "");
      const agoSec = Math.floor((Date.now() - r.time) / 1000);
      announce(player, "\u00a7d\u00a7l[RBD] Last death:");
      announce(player, `\u00a7a  Time: \u00a77${ts}`);
      announce(player, `\u00a7a  Location: \u00a77${Math.floor(r.x)}, ${Math.floor(r.y)}, ${Math.floor(r.z)} \u00a7ain \u00a7b${dim}`);
      announce(player, `\u00a7a  Cause: \u00a7c${r.cause}`);
      announce(player, `\u00a77  (${agoSec} second(s) ago)`);
      break;
    }
    case "revert": {
      const err = revertPlayer(player);
      if (err) announce(player, "\u00a7c" + err);
      break;
    }
    case "testsound": {
      try {
        const vol = Math.max(0, Math.min(1, CONFIG.soundVolume / 100));
        const pitch = Math.max(0.5, Math.min(2, CONFIG.soundPitch / 100));
        player.playSound(SAVE_SOUND_ID, { volume: vol, pitch });
        announce(player, `\u00a7aPlaying Return By Death sound (vol=${CONFIG.soundVolume}%, pitch=${CONFIG.soundPitch}%).`);
        announce(player, "\u00a77  If you don't hear it: (1) ensure the resource pack is active, (2) restart MC client completely, (3) reinstall both packs.");
      } catch (e) {
        announce(player, "\u00a7cFailed to play sound: " + e);
      }
      break;
    }
    case "reset": {
      if (saves.delete(player.id)) {
        announce(player, "\u00a7cYour save point has been cleared. Your next death will be permanent.");
        announce(player, `\u00a77  A new save point will be created within ${CONFIG.saveIntervalSeconds} seconds.`);
      } else {
        announce(player, "\u00a7cYou had no save point to clear.");
      }
      break;
    }
    case "named": {
      const action = parts[2]?.toLowerCase();
      if (action === "list") {
        const named = namedSaves.get(player.id) || new Map();
        if (named.size === 0) { announce(player, "\u00a77You have no named save points."); }
        else {
          announce(player, "\u00a7d\u00a7l[RBD] Named save points:");
          for (const [n, s] of named) {
            announce(player, `\u00a7a  ${n} \u00a77@ ${Math.floor(s.x)}, ${Math.floor(s.y)}, ${Math.floor(s.z)} in ${s.dimensionId.replace("minecraft:", "")}`);
          }
        }
        break;
      }
      if (action === "delete") {
        const name = parts[3];
        if (!name) { announce(player, "\u00a7cUsage: !rbd named delete <name>"); break; }
        const named = namedSaves.get(player.id) || new Map();
        if (named.delete(name)) announce(player, `\u00a7aDeleted named save point '\u00a7e${name}\u00a7a'.`);
        else announce(player, `\u00a7cNo named save point called '${name}'.`);
        break;
      }
      const name = parts[2];
      if (!name) { announce(player, "\u00a7cUsage: !rbd named <name> | !rbd named list | !rbd named delete <name>"); break; }
      if (name.length > 32) { announce(player, "\u00a7cName too long (max 32 chars)."); break; }
      let named = namedSaves.get(player.id);
      if (!named) { named = new Map(); namedSaves.set(player.id, named); }
      if (!named.has(name) && named.size >= CONFIG.maxNamedSavePoints) {
        announce(player, `\u00a7cMaximum named save points reached (${CONFIG.maxNamedSavePoints}). Delete one first.`);
        break;
      }
      const save = captureSave(player);
      if (save) {
        named.set(name, save);
        announce(player, `\u00a7aNamed save point '\u00a7e${name}\u00a7a' created at your current location.`);
      }
      break;
    }
    case "particles": {
      const arg = parts[2]?.toLowerCase();
      if (arg === "on") { particleOverride.set(player.id, true); announce(player, "\u00a7aSave point particles: \u00a7eON"); }
      else if (arg === "off") { particleOverride.set(player.id, false); announce(player, "\u00a7aSave point particles: \u00a7eOFF"); }
      else { announce(player, "\u00a7cUsage: !rbd particles <on|off>"); }
      break;
    }
    case "debug": {
      announce(player, "\u00a7d\u00a7l=== RBD v1.4.0 Command Layers ===");
      announce(player, `\u00a7aLayer 1 - CustomCommandRegistry (/rbd:*): \u00a77${LAYERS.customCommand ? "\u00a7aACTIVE" : "\u00a7cINACTIVE (need Bedrock 1.21.80+)"}`);
      announce(player, `\u00a7aLayer 2 - chatSend (!rbd chat): \u00a77${LAYERS.chatSend ? "\u00a7aACTIVE" : "\u00a7cINACTIVE (may need Beta APIs toggle)"}`);
      announce(player, `\u00a7aLayer 3 - RBD Notebook item UI: \u00a77${LAYERS.itemUI ? "\u00a7aACTIVE" : "\u00a7cINACTIVE"}`);
      announce(player, "\u00a77If commands aren't working, check which layers are active.");
      announce(player, "\u00a77Layer 3 (RBD Notebook) should ALWAYS work - check your inventory for the notebook.");
      break;
    }
    case "debug_save": {
      const s = saves.get(player.id);
      if (!s) { announce(player, "\u00a7cNo save point in memory. Auto-save runs every " + CONFIG.saveIntervalSeconds + "s."); }
      else {
        announce(player, "\u00a7d\u00a7l=== RBD Save Debug ===");
        announce(player, `\u00a7aPosition: \u00a77${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)}`);
        announce(player, `\u00a7aRotation: \u00a77${s.rx.toFixed(1)}, ${s.ry.toFixed(1)}`);
        announce(player, `\u00a7aDimension: \u00a7b${s.dimensionId}`);
        announce(player, `\u00a7aHealth: \u00a7c${s.health}\u00a7a  Hunger: \u00a76${s.hunger}\u00a7a  XP: \u00a7e${s.xpLevel}`);
        announce(player, `\u00a7aInventory items: \u00a77${s.inventory.length}`);
        announce(player, `\u00a7aEffects: \u00a77${(s.effects || []).length}`);
        announce(player, `\u00a7aFire: \u00a77${s.onFire ? "yes (" + s.fireTicks + " ticks)" : "no"}`);
        const agoSec = Math.floor((Date.now() - s.timestamp) / 1000);
        announce(player, `\u00a7aSaved: \u00a77${agoSec}s ago`);
        try {
          announce(player, `\u00a7aYour current pos: \u00a77${player.location.x.toFixed(2)}, ${player.location.y.toFixed(2)}, ${player.location.z.toFixed(2)}`);
          const dist = Math.sqrt(
            Math.pow(player.location.x - s.x, 2) +
            Math.pow(player.location.y - s.y, 2) +
            Math.pow(player.location.z - s.z, 2)
          );
          announce(player, `\u00a7aDistance from save: \u00a77${dist.toFixed(1)} blocks`);
        } catch (_) {}
      }
      break;
    }
    case "forcerestore": {
      const s = saves.get(player.id);
      if (!s) { announce(player, "\u00a7cNo save point exists. Use !rbd save first."); break; }
      announce(player, "\u00a7dForce-restoring to save point...");
      try {
        restoreSave(player, s);
        system.runTimeout(() => { try { reTeleportToSave(player, s); } catch (_) {} }, 10);
        announce(player, `\u00a7aForce-restored to \u00a77${Math.floor(s.x)}, ${Math.floor(s.y)}, ${Math.floor(s.z)}\u00a7a.`);
      } catch (e) {
        announce(player, "\u00a7cForce restore failed: " + e);
        log("forcerestore failed:", e);
      }
      break;
    }
    case "help":
    default: {
      announce(player, "\u00a7d\u00a7l=== Return By Death v1.4.0 Help ===");
      announce(player, "\u00a76Three ways to run commands:");
      announce(player, "\u00a7a  1. Slash commands: \u00a77/rbd:save, /rbd:info, etc. (Bedrock 1.21.80+)");
      announce(player, "\u00a7a  2. Chat commands: \u00a77!rbd save, !rbd info, etc. (older Bedrock)");
      announce(player, "\u00a7a  3. RBD Notebook: \u00a77right-click the notebook in your inventory for a menu");
      announce(player, "\u00a76Player commands:");
      announce(player, "\u00a7a  save, info, status, loops, looplog, lastdeath");
      announce(player, "\u00a7a  revert, testsound, reset, particles, debug");
      announce(player, "\u00a7a  forcerestore, debug_save");
      announce(player, "\u00a7a  named <name> | named list | named delete <name>");
      announce(player, "\u00a76Op commands:");
      announce(player, "\u00a7a  interval <sec>, cooldown <sec>, broadcast <on|off>");
      announce(player, "\u00a7a  radius <blocks>, volume <0-100>, pitch <50-200>");
      announce(player, "\u00a7a  maxnamed <0-20>, mod <on|off>");
      break;
    }
    // Op commands
    case "interval": {
      if (!isOp(player)) { announce(player, "\u00a7cOperator permission required."); break; }
      const s = parseInt(parts[2]);
      if (isNaN(s) || s < 1 || s > 600) { announce(player, "\u00a7cUsage: !rbd interval <1-600>"); break; }
      CONFIG.saveIntervalSeconds = s;
      saveConfig();
      announce(player, `\u00a7aSave interval set to \u00a7e${s} seconds\u00a7a.`);
      break;
    }
    case "cooldown": {
      if (!isOp(player)) { announce(player, "\u00a7cOperator permission required."); break; }
      const s = parseInt(parts[2]);
      if (isNaN(s) || s < 0 || s > 3600) { announce(player, "\u00a7cUsage: !rbd cooldown <0-3600>"); break; }
      CONFIG.cooldownSeconds = s;
      saveConfig();
      announce(player, `\u00a7aCooldown set to \u00a7e${s} seconds\u00a7a.`);
      break;
    }
    case "broadcast": {
      if (!isOp(player)) { announce(player, "\u00a7cOperator permission required."); break; }
      const arg = parts[2]?.toLowerCase();
      if (arg === "on") { CONFIG.broadcastDeaths = true; saveConfig(); announce(player, "\u00a7aDeath broadcast: \u00a7eON"); }
      else if (arg === "off") { CONFIG.broadcastDeaths = false; saveConfig(); announce(player, "\u00a7aDeath broadcast: \u00a7eOFF"); }
      else { announce(player, "\u00a7cUsage: !rbd broadcast <on|off>"); }
      break;
    }
    case "radius": {
      // v1.4.0: restored from v1.2.5 (was missing in v1.3.0)
      if (!isOp(player)) { announce(player, "\u00a7cOperator permission required."); break; }
      const r = parseInt(parts[2]);
      if (isNaN(r) || r < -1) { announce(player, "\u00a7cUsage: !rbd radius <blocks> (-1 = global)"); break; }
      CONFIG.broadcastRadius = r;
      saveConfig();
      announce(player, `\u00a7aBroadcast radius set to \u00a7e${r}\u00a7a blocks (-1 = global).`);
      break;
    }
    case "volume": {
      if (!isOp(player)) { announce(player, "\u00a7cOperator permission required."); break; }
      const v = parseInt(parts[2]);
      if (isNaN(v) || v < 0 || v > 100) { announce(player, "\u00a7cUsage: !rbd volume <0-100>"); break; }
      CONFIG.soundVolume = v;
      saveConfig();
      announce(player, `\u00a7aSound volume set to \u00a7e${v}%\u00a7a.`);
      break;
    }
    case "pitch": {
      if (!isOp(player)) { announce(player, "\u00a7cOperator permission required."); break; }
      const p = parseInt(parts[2]);
      if (isNaN(p) || p < 50 || p > 200) { announce(player, "\u00a7cUsage: !rbd pitch <50-200>"); break; }
      CONFIG.soundPitch = p;
      saveConfig();
      announce(player, `\u00a7aSound pitch set to \u00a7e${p}%\u00a7a.`);
      break;
    }
    case "maxnamed": {
      if (!isOp(player)) { announce(player, "\u00a7cOperator permission required."); break; }
      const n = parseInt(parts[2]);
      if (isNaN(n) || n < 0 || n > 20) { announce(player, "\u00a7cUsage: !rbd maxnamed <0-20>"); break; }
      CONFIG.maxNamedSavePoints = n;
      saveConfig();
      announce(player, `\u00a7aMax named save points per player set to \u00a7e${n}\u00a7a.`);
      break;
    }
    case "mod": {
      if (!isOp(player)) { announce(player, "\u00a7cOperator permission required."); break; }
      const arg = parts[2]?.toLowerCase();
      if (arg === "on") { CONFIG.enabled = true; saveConfig(); announce(player, "\u00a7aMod: \u00a7eENABLED"); }
      else if (arg === "off") { CONFIG.enabled = false; saveConfig(); announce(player, "\u00a7aMod: \u00a7eDISABLED"); }
      else { announce(player, "\u00a7cUsage: !rbd mod <on|off>"); }
      break;
    }
  }
}

function pad(n) { return n < 10 ? "0" + n : String(n); }

// ============================ Init Log ============================

log("Return By Death v1.4.0 (Bedrock Edition) loaded.");
log(`Save interval: ${CONFIG.saveIntervalSeconds}s. Inspired by Subaru Natsuki from Re:Zero.`);
log("v1.4.0: merges v1.3.0 foundation + complete v1.2.5 feature set.");
log("Death detection: entityDie event + 1-tick polling fallback");
log("Sound is in resource pack (NOT behavior pack).");
log("Command layers - Layer 1 (CustomCommandRegistry): " + (LAYERS.customCommand ? "ACTIVE" : "inactive"));
log("Command layers - Layer 2 (chatSend): " + (LAYERS.chatSend ? "ACTIVE" : "inactive"));
log("Command layers - Layer 3 (RBD Notebook UI): " + (LAYERS.itemUI ? "ACTIVE" : "inactive"));
log("If !rbd commands don't work, check /rbd:debug or !rbd debug, and try the RBD Notebook in your inventory.");
