/**
 * Return By Death - Bedrock Edition (incl. Pocket Edition) - v1.2.2 HOTFIX
 * =======================================================================
 *
 * Inspired by Subaru Natsuki's ability from Re:Zero.
 *
 * v1.2.2 HOTFIX: Layer 1 (CustomCommandRegistry) was broken in v1.2.1 because it
 *   registered commands but used a non-existent 'system.afterEvents.customCommand'
 *   event for execution. Fixed by passing the execution callback directly to
 *   registerCommand() as the second argument (per Bedrock Wiki / MS Learn docs).
 *   Also added: cheatsRequired: false so commands work without cheats enabled,
 *   CommandPermissionLevel enum import, mandatoryParameters support for /rbd:named <name>,
 *   /rbd:interval <sec>, etc.
 *
 * v1.2.1 PATCH NOTES:
 *
 *   BUG FIX - Bedrock chat commands now work via 3 layers (with graceful fallback):
 *     Layer 1: CustomCommandRegistry via system.beforeEvents.startup (Bedrock 1.21.80+)
 *              -> Real /rbd slash commands with autocomplete, work in command blocks,
 *                 NO Beta APIs needed.
 *     Layer 2: world.beforeEvents.chatSend fallback (older Bedrock versions)
 *              -> The classic !rbd chat handler. Wrapped in try/catch with logging.
 *     Layer 3: RBD Notebook item UI menu (universal fallback)
 *              -> Player gets a "RBD Notebook" item on join. Right-click opens
 *                 an ActionFormData with all commands as buttons.
 *                 Works on console, mobile, no chat needed.
 *
 *     All event subscriptions are now wrapped in try/catch with console.warn() logging
 *     so the script never silently dies. Use !rbd debug or /rbd debug to see which
 *     layers are active.
 *
 *   NEW FEATURES (Tier 1 RBD flavor):
 *     - Witch scent: dark soul particles drift around you for 60s after each death
 *     - Death quotes: random Subaru-style quote appears in chat on death
 *     - Heartbeat: deep heartbeat sound plays when your HP is below 6 (3 hearts)
 *     - Witch watching: every 5th death, action bar shows "The Witch of Envy is watching..."
 *
 * v1.2.0 / v1.1.0 / v1.0.0: All previous features retained.
 *
 * CHAT COMMANDS (Layer 2 - older Bedrock, requires Beta APIs toggle):
 *   Player: !rbd save, info, status, loops, looplog, lastdeath, revert, testsound,
 *           reset, named <name>, named list, named delete <name>, particles on|off,
 *           debug, help
 *   Op:     !rbd interval, cooldown, broadcast, radius, volume, pitch, maxnamed, mod
 *
 * SLASH COMMANDS (Layer 1 - Bedrock 1.21.80+, no Beta APIs needed):
 *   Same as above but typed as /rbd:save, /rbd:info, etc.
 *
 * ITEM UI (Layer 3 - universal):
 *   Right-click the "RBD Notebook" item to open the command menu.
 *
 * IMPORTANT SOUND NOTE:
 *   - Sound is in the RESOURCE pack (not behavior pack) - Bedrock only loads
 *     custom sounds from resource packs.
 *   - If sound doesn't play: restart MC client completely, ensure both packs active.
 */

import {
  world,
  system,
  EquipmentSlot,
  GameMode,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
} from "@minecraft/server";

// ============================ Configuration ============================

const SAVE_SOUND_ID = "rbd.return_by_death";
const INVULN_TICKS_AFTER_RETURN = 60;
const ITEM_DESPAWN_RADIUS = 8;
const BEACON_INTERVAL_TICKS = 20;
const BEACON_MAX_DISTANCE = 64;
const MAX_LOG_ENTRIES = 10;

// v1.2.1 Tier 1 config
const WITCH_SCENT_DURATION_MS = 60_000;     // 60 seconds
const WITCH_SCENT_INTERVAL_TICKS = 40;       // 2 seconds
const HEARTBEAT_HP_THRESHOLD = 6;            // HP at/below which heartbeat plays
const HEARTBEAT_CHECK_TICKS = 20;            // every 1 second
const WITCH_WATCHING_INTERVAL = 5;           // every 5th death

// Track which command layers are active (for /rbd debug)
const LAYERS = {
  customCommand: false,
  chatSend: false,
  itemUI: false,
};

// Default config
const DEFAULT_CONFIG = {
  enabled: true,
  saveIntervalSeconds: 20,
  cooldownSeconds: 0,
  broadcastDeaths: false,
  broadcastRadius: -1,
  soundVolume: 100,
  soundPitch: 100,
  particleBeaconEnabled: true,
  deathCounterEnabled: true,
  maxNamedSavePoints: 3,
  actionBarCooldown: true,
  // v1.2.1 Tier 1 toggles
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

// v1.2.1: Witch scent tracking
/** @type {Map<string, number>} player.id -> scent end time (ms epoch) */
const witchScentUntil = new Map();

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

// ============================ Capture / Restore ============================

function captureSave(player) {
  const loc = player.location;
  const rot = player.getRotation();
  const dim = player.dimension.id;

  const invComp = player.getComponent("minecraft:inventory");
  const inventory = [];
  if (invComp && invComp.container) {
    const c = invComp.container;
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it) inventory.push({ slot: i, item: it.clone() });
    }
  }

  const equipment = {};
  try {
    const eqComp = player.getComponent("minecraft:equippable");
    if (eqComp) {
      for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet]) {
        const it = eqComp.getEquipment(slot);
        if (it) equipment[slot] = it.clone();
      }
    }
  } catch (_) {}

  let health = 20, hunger = 20, xpLevel = 0;
  try { const h = player.getComponent("minecraft:health"); if (h) health = h.currentValue; } catch (_) {}
  try { const hu = player.getComponent("minecraft:hunger"); if (hu) hunger = hu.currentValue; } catch (_) {}
  try { const xp = player.getComponent("minecraft:experience"); if (xp) xpLevel = xp.level; } catch (_) {}

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
  } catch (e) {
    log("getEffects failed:", e);
  }

  let fireTicks = 0;
  try {
    if (player.isOnFire) {
      fireTicks = 60;
    }
  } catch (_) {}

  return {
    dimensionId: dim,
    x: loc.x, y: loc.y, z: loc.z,
    rx: rot.x, ry: rot.y,
    inventory,
    equipment,
    health, hunger, xpLevel,
    effects,
    fireTicks,
    onFire: !!fireTicks,
    timestamp: Date.now(),
  };
}

function restoreSave(player, save) {
  try {
    const targetDim = world.getDimension(save.dimensionId);
    player.teleport({ x: save.x, y: save.y, z: save.z }, {
      dimension: targetDim,
      rotation: { x: save.rx, y: save.ry },
      keepVelocity: false,
    });
  } catch (e) {
    log("Teleport failed:", e);
  }

  const invComp = player.getComponent("minecraft:inventory");
  if (invComp && invComp.container) {
    const c = invComp.container;
    for (let i = 0; i < c.size; i++) c.setItem(i, undefined);
    for (const { slot, item } of save.inventory) {
      try { c.setItem(slot, item); } catch (e) { log("set slot failed:", e); }
    }
  }

  try {
    const eqComp = player.getComponent("minecraft:equippable");
    if (eqComp) {
      for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet]) {
        const saved = save.equipment[slot];
        try { eqComp.setEquipment(slot, saved || undefined); } catch (_) {}
      }
    }
  } catch (_) {}

  try { const h = player.getComponent("minecraft:health"); if (h) h.setCurrentValue(save.health); } catch (_) {}
  try { const hu = player.getComponent("minecraft:hunger"); if (hu) hu.setCurrentValue(save.hunger); } catch (_) {}
  try {
    const xp = player.getComponent("minecraft:experience");
    if (xp) {
      const current = xp.level;
      xp.addLevels(-current);
      xp.addLevels(save.xpLevel);
    }
  } catch (_) {}

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
        } catch (err) {
          log("Failed to restore effect:", e.typeId, err);
        }
      }
    }
  } catch (e) {
    log("Effects restore failed:", e);
  }

  try {
    if (save.onFire && save.fireTicks > 0) {
      player.setOnFire(save.fireTicks, true);
    } else {
      player.extinguishFire();
    }
  } catch (_) {}

  try {
    player.addEffect("minecraft:resistance", INVULN_TICKS_AFTER_RETURN, { amplifier: 4, showParticles: false });
    player.addEffect("minecraft:fire_resistance", INVULN_TICKS_AFTER_RETURN, { amplifier: 1, showParticles: false });
  } catch (_) {}
}

function playReturnByDeathSound(deathLoc, deathDimId) {
  const volume = Math.max(0, Math.min(1, CONFIG.soundVolume / 100));
  const pitch = Math.max(0.5, Math.min(2, CONFIG.soundPitch / 100));
  if (volume <= 0) return;

  if (CONFIG.broadcastRadius < 0) {
    for (const p of world.getAllPlayers()) {
      try { p.playSound(SAVE_SOUND_ID, { volume, pitch }); } catch (_) {}
    }
  } else {
    const r = CONFIG.broadcastRadius;
    try {
      const dim = world.getDimension(deathDimId);
      dim.playSound(SAVE_SOUND_ID, deathLoc, { volume, pitch });
    } catch (e) {
      log("dimension.playSound failed, falling back to per-player:", e);
      for (const p of world.getAllPlayers()) {
        try {
          if (p.dimension.id !== deathDimId) continue;
          const dx = p.location.x - deathLoc.x;
          const dy = p.location.y - deathLoc.y;
          const dz = p.location.z - deathLoc.z;
          const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
          if (d <= r) {
            const distVol = Math.max(0.05, volume * (1 - d / Math.max(1, r)));
            p.playSound(SAVE_SOUND_ID, { volume: distVol, pitch });
          }
        } catch (_) {}
      }
    }
  }
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
  try {
    player.setDynamicProperty("rbd:deathLog", JSON.stringify(log));
  } catch (e) {
    log("Failed to persist death log:", e);
  }
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

// ============================ Particle Beacon ============================

function spawnBeaconParticles(player, save) {
  if (!CONFIG.particleBeaconEnabled) return;
  if (particleOverride.get(player.id) === false) return;
  if (player.dimension.id !== save.dimensionId) return;

  const dx = player.location.x - save.x;
  const dy = player.location.y - save.y;
  const dz = player.location.z - save.z;
  const d2 = dx*dx + dy*dy + dz*dz;
  if (d2 > BEACON_MAX_DISTANCE * BEACON_MAX_DISTANCE) return;

  const dim = player.dimension;
  const base = { x: save.x, y: save.y, z: save.z };

  try {
    for (let i = 0; i < 3; i++) {
      dim.spawnParticle("minecraft:basic_crit_particle", { x: base.x, y: base.y + 0.3 + i * 0.4, z: base.z });
    }
    dim.spawnParticle("minecraft:endrod", { x: base.x, y: base.y + 1.5, z: base.z });
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

// ============================ v1.2.1: Witch Scent ============================

function triggerWitchScent(player) {
  if (!CONFIG.witchScentEnabled) return;
  witchScentUntil.set(player.id, Date.now() + WITCH_SCENT_DURATION_MS);
  try {
    player.onScreenDisplay.setActionBar("\u00a78\u00a7oThe scent of the Witch clings to you...");
  } catch (_) {}
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
  const y = player.location.y + 1.0; // chest height
  const z = player.location.z;

  try {
    // Ring of soul particles around the player (8 particles in a circle)
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2.0) / 8.0;
      const px = x + Math.cos(angle) * 0.8;
      const pz = z + Math.sin(angle) * 0.8;
      dim.spawnParticle("minecraft:soul_particle", { x: px, y: y, z: pz });
    }
    // A few soul fire flames drifting up
    for (let i = 0; i < 3; i++) {
      dim.spawnParticle("minecraft:soul_particle", {
        x: x + (Math.random() - 0.5) * 0.5,
        y: y - 0.5 + Math.random() * 1.5,
        z: z + (Math.random() - 0.5) * 0.5,
      });
    }
  } catch (_) {}
}

// ============================ v1.2.1: Death Quotes ============================

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
  try {
    player.sendMessage("\u00a7d\u00a7o\"" + quote + "\"\u00a7r\u00a77 \u2014 Natsuki Subaru");
  } catch (_) {}
}

// ============================ v1.2.1: Heartbeat at low HP ============================

function tickHeartbeat() {
  if (!CONFIG.heartbeatEnabled) return;
  const now = Date.now();
  for (const player of world.getAllPlayers()) {
    try {
      if (player.getGameMode() === GameMode.creative || player.getGameMode() === GameMode.spectator) continue;
      const healthComp = player.getComponent("minecraft:health");
      if (!healthComp) continue;
      const hp = healthComp.currentValue;
      if (hp > 0 && hp <= HEARTBEAT_HP_THRESHOLD) {
        // Volume scales with how close to death the player is
        const volume = 0.4 + (1.0 - hp / HEARTBEAT_HP_THRESHOLD) * 0.6; // 0.4 to 1.0
        try {
          player.playSound("mob.warden.heartbeat", { volume, pitch: 1.0 });
        } catch (_) {
          // Fallback: try a deep bass note
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

// ============================ Event Handlers ============================

// Periodic save loop
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
      saves.set(player.id, save);
      if (saveIndicatorCounter % 3 === 0) {
        try {
          player.onScreenDisplay.setActionBar("\u00a7d\u26a1 Save point recorded");
        } catch (_) {}
      }
    } catch (e) {
      log("Save failed for", player.name, ":", e);
    }
  }
}, 20);

// Particle beacon loop
system.runInterval(() => {
  if (!CONFIG.enabled) return;
  for (const player of world.getAllPlayers()) {
    const save = saves.get(player.id);
    if (save) spawnBeaconParticles(player, save);
  }
}, BEACON_INTERVAL_TICKS);

// v1.2.1: Witch scent loop (every 2 seconds)
system.runInterval(() => {
  if (!CONFIG.enabled) return;
  tickWitchScent();
}, WITCH_SCENT_INTERVAL_TICKS);

// v1.2.1: Heartbeat loop (every 1 second)
system.runInterval(() => {
  if (!CONFIG.enabled) return;
  tickHeartbeat();
}, HEARTBEAT_CHECK_TICKS);

// Action bar cooldown display
system.runInterval(() => {
  if (!CONFIG.enabled || !CONFIG.actionBarCooldown) return;
  const now = Date.now();
  for (const player of world.getAllPlayers()) {
    const cdUntil = cooldownUntil.get(player.id);
    if (!cdUntil || cdUntil <= now) continue;
    const seconds = Math.ceil((cdUntil - now) / 1000);
    try {
      player.onScreenDisplay.setActionBar(`\u00a7c\u00a7l[RBD]\u00a7r \u00a7cCooldown: \u00a7e${seconds}s`);
    } catch (_) {}
  }
}, 10);

// Initial spawn - greet + give RBD Notebook (Layer 3 UI)
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const player = ev.player;
  try {
    const save = captureSave(player);
    saves.set(player.id, save);
  } catch (e) {
    log("Initial save failed:", e);
  }
  announce(player, "\u00a7aA save point has been created. State is recorded every " + CONFIG.saveIntervalSeconds + "s.");
  announce(player, "\u00a77When you die, you rewind to your save point with everything you had then.");
  announce(player, "\u00a77Type \u00a7e!rbd help\u00a77 for chat commands, or use \u00a7e/rbd:help\u00a77 if on Bedrock 1.21.80+.");
  announce(player, "\u00a77Or right-click the \u00a7dRBD Notebook\u00a77 item for a menu.");

  // Give RBD Notebook item (Layer 3 UI menu)
  giveRBDNotebook(player);
});

// On death
world.afterEvents.playerDie.subscribe((ev) => {
  if (!CONFIG.enabled) return;
  const player = ev.player;
  if (!player) return;

  const cdUntil = cooldownUntil.get(player.id);
  const now = Date.now();
  if (cdUntil && cdUntil > now) {
    const secs = Math.ceil((cdUntil - now) / 1000);
    announce(player, `\u00a7cCooldown active! Cannot rewind for ${secs} more second(s). Death is permanent this time.`);
    return;
  }

  if (!saves.has(player.id)) {
    announce(player, "\u00a7cNo save point exists \u2014 death is permanent!");
    return;
  }

  const causeStr = describeDeathCause(ev.damageSource);
  log(`${player.name} died (cause: ${causeStr}). Triggering Return By Death.`);

  const deathLoc = player.location ? { x: player.location.x, y: player.location.y, z: player.location.z } : null;
  const deathDimId = player.dimension.id;

  playReturnByDeathSound(deathLoc || { x: 0, y: 0, z: 0 }, deathDimId);

  let loopCount = 0;
  if (CONFIG.deathCounterEnabled) {
    loopCount = incrementDeathCount(player);
  }

  addDeathLog(player, {
    time: now,
    dimension: deathDimId,
    x: deathLoc ? deathLoc.x : 0,
    y: deathLoc ? deathLoc.y : 0,
    z: deathLoc ? deathLoc.z : 0,
    cause: causeStr,
  });

  showDeathTitle(player, loopCount);

  // v1.2.1 Tier 1 features
  sendDeathQuote(player);
  triggerWitchScent(player);
  if (loopCount > 0 && loopCount % WITCH_WATCHING_INTERVAL === 0 && CONFIG.witchWatchingEnabled) {
    try {
      player.onScreenDisplay.setActionBar("\u00a78\u00a7l\u00a7oThe Witch of Envy is watching you...");
    } catch (_) {}
  }

  announce(player, "\u00a7dYou have died. Returning to your save point...");
  if (loopCount > 0) {
    announce(player, `\u00a77  Loop count: \u00a7e${loopCount}\u00a77 (this is death #${loopCount})`);
    announce(player, `\u00a77  Cause: \u00a7c${causeStr}`);
  }
  if (CONFIG.broadcastDeaths) {
    for (const p of world.getAllPlayers()) {
      if (p.id !== player.id) {
        p.sendMessage(`\u00a7d[Return By Death]\u00a7r \u00a77${player.name} has died and rewound to their save point.`);
      }
    }
  }

  pendingReturns.add(player.id);

  if (deathLoc) {
    deathLocations.set(player.id, { x: deathLoc.x, y: deathLoc.y, z: deathLoc.z, dimensionId: deathDimId });
  }

  if (CONFIG.cooldownSeconds > 0) {
    cooldownUntil.set(player.id, now + CONFIG.cooldownSeconds * 1000);
  }
});

// On respawn
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (ev.initialSpawn) return;
  const player = ev.player;
  if (!pendingReturns.has(player.id)) return;

  pendingReturns.delete(player.id);

  const save = saves.get(player.id);
  if (!save) {
    announce(player, "\u00a7cNo save point available. Could not restore.");
    return;
  }

  system.run(() => {
    try {
      const deathLoc = deathLocations.get(player.id);
      if (deathLoc) {
        clearDroppedItemsNear({ x: deathLoc.x, y: deathLoc.y, z: deathLoc.z }, deathLoc.dimensionId);
        deathLocations.delete(player.id);
      }
      restoreSave(player, save);
      announce(player, `\u00a7aReturned to your save point at \u00a77${Math.floor(save.x)}, ${Math.floor(save.y)}, ${Math.floor(save.z)}\u00a7a in \u00a7b${save.dimensionId.replace("minecraft:", "")}\u00a7a.`);
    } catch (e) {
      log("Restore on respawn failed:", e);
      announce(player, "\u00a7cFailed to restore state. Check console for details.");
    }
  });
});

// Revert function
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

// ============================ v1.2.1 LAYER 1: CustomCommandRegistry (Bedrock 1.21.80+) ============================
// v1.2.2 HOTFIX: previous version registered commands but used a non-existent
// 'system.afterEvents.customCommand' event to handle execution. The correct pattern
// is to pass the execution callback AS THE SECOND ARGUMENT to registerCommand().
//
// CustomCommand enums (CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus)
// are imported at the top of the file via the static `import { ... } from "@minecraft/server"`.
// If those imports fail (older @minecraft/server version), we fall back to numeric values
// that match the official enum values for @minecraft/server 1.14.0.

// Fallback enum values if static import didn't expose them (shouldn't happen on 1.14.0+)
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
          warn("Layer 1: CustomCommandRegistry.registerCommand is not a function. Need Bedrock 1.21.80+.");
          return;
        }

        // Helper to register a no-parameter command with an execution callback
        function registerSimple(name, description, permLevel, cheatsRequired) {
          try {
            registry.registerCommand({
              name: name,
              description: description,
              permissionLevel: permLevel,
              cheatsRequired: cheatsRequired,
            }, (origin) => {
              try {
                const player = origin?.sourceEntity;
                if (!player || !player.typeId || player.typeId !== "minecraft:player") {
                  return { status: STATUS_FAILURE, message: "Only players can use this command." };
                }
                const sub = name.substring("rbd:".length); // strip "rbd:"
                let parts = [sub];
                if (sub === "named_list") parts = ["named", "list"];
                if (sub === "named_delete") parts = ["named", "delete"];
                system.run(() => {
                  try { handleCommand(player, parts[0], parts); }
                  catch (e) { warn("Layer 1 command handler error:", e); announce(player, "\u00a7cCommand error: " + e); }
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

        // Helper to register a command with one string parameter
        function registerWithStringParam(name, description, permLevel, cheatsRequired, paramName) {
          try {
            registry.registerCommand({
              name: name,
              description: description,
              permissionLevel: permLevel,
              cheatsRequired: cheatsRequired,
              mandatoryParameters: [
                { name: paramName, type: PARAM_STRING },
              ],
            }, (origin, value) => {
              try {
                const player = origin?.sourceEntity;
                if (!player || player.typeId !== "minecraft:player") {
                  return { status: STATUS_FAILURE, message: "Only players can use this command." };
                }
                const sub = name.substring("rbd:".length);
                // All parametric commands just pass the value as parts[2]
                const parts = [sub, undefined, String(value)];
                system.run(() => {
                  try { handleCommand(player, parts[0], parts); }
                  catch (e) { warn("Layer 1 command handler error:", e); announce(player, "\u00a7cCommand error: " + e); }
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

        // Player commands (no params): permissionLevel Any, cheatsRequired false
        const playerSimple = ["save", "info", "status", "loops", "looplog", "lastdeath", "revert", "testsound", "reset", "debug", "help"];
        let playerRegistered = 0;
        for (const cmd of playerSimple) {
          if (registerSimple(`rbd:${cmd}`, `Return By Death - ${cmd}`, PERM_ANY, false)) playerRegistered++;
        }

        // /rbd:named <name> - takes a string parameter
        let namedRegistered = 0;
        if (registerWithStringParam("rbd:named", "Create a named save point", PERM_ANY, false, "name")) namedRegistered++;
        // /rbd:named_list - simple (no params)
        if (registerSimple("rbd:named_list", "List your named save points", PERM_ANY, false)) namedRegistered++;
        // /rbd:named_delete <name>
        if (registerWithStringParam("rbd:named_delete", "Delete a named save point", PERM_ANY, false, "name")) namedRegistered++;

        // /rbd:particles <on|off> - string param
        let particlesRegistered = 0;
        if (registerWithStringParam("rbd:particles", "Toggle save point particles (on|off)", PERM_ANY, false, "state")) particlesRegistered++;

        // Op commands: permissionLevel GameDirectors (== 1, requires op), cheatsRequired false
        const opNumeric = [
          { name: "rbd:interval", desc: "Set save interval (1-600 sec)", param: "seconds" },
          { name: "rbd:cooldown", desc: "Set cooldown (0-3600 sec)", param: "seconds" },
          { name: "rbd:radius", desc: "Set broadcast radius (-1 = global)", param: "blocks" },
          { name: "rbd:volume", desc: "Set sound volume (0-100%)", param: "percent" },
          { name: "rbd:pitch", desc: "Set sound pitch (50-200%)", param: "percent" },
          { name: "rbd:maxnamed", desc: "Set max named save points (0-20)", param: "count" },
        ];
        let opNumericRegistered = 0;
        for (const c of opNumeric) {
          if (registerWithStringParam(c.name, c.desc, PERM_GAME_DIRECTORS, false, c.param)) opNumericRegistered++;
        }

        // Op toggle commands (on|off)
        const opToggle = ["broadcast", "mod"];
        let opToggleRegistered = 0;
        for (const cmd of opToggle) {
          if (registerWithStringParam(`rbd:${cmd}`, `Return By Death (op) - ${cmd} <on|off>`, PERM_GAME_DIRECTORS, false, "state")) opToggleRegistered++;
        }

        LAYERS.customCommand = true;
        const total = playerRegistered + namedRegistered + particlesRegistered + opNumericRegistered + opToggleRegistered;
        log(`Layer 1 (CustomCommandRegistry): registered ${total} commands (${playerRegistered} player, ${namedRegistered} named, ${particlesRegistered} particles, ${opNumericRegistered + opToggleRegistered} op).`);
        log("Layer 1: Try /rbd:help or /rbd:save in chat (with autocomplete).");
      } catch (e) {
        warn("Layer 1 CustomCommandRegistry setup failed:", e);
      }
    });
  } else {
    warn("Layer 1 (CustomCommandRegistry): system.beforeEvents.startup is undefined. Need Bedrock 1.21.80+. Falling back to chat handlers.");
  }
} catch (e) {
  warn("Layer 1 init failed:", e);
}

// ============================ v1.2.1 LAYER 2: chatSend (fallback for older Bedrock) ============================

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
          catch (e) { warn("Chat command handler error:", e); announce(sender, "\u00a7cCommand error: " + e); }
        });
      } catch (e) {
        warn("chatSend subscription handler failed:", e);
      }
    });
    LAYERS.chatSend = true;
    log("Layer 2 (chatSend): registered - !rbd chat commands active");
  } else {
    warn("Layer 2 (chatSend): world.beforeEvents.chatSend is undefined. !rbd chat commands will NOT work. Use /rbd: (Layer 1) or RBD Notebook (Layer 3) instead.");
  }
} catch (e) {
  warn("Layer 2 init failed:", e);
}

// ============================ v1.2.1 LAYER 3: Item-based UI menu (universal fallback) ============================

const NOTEBOOK_ITEM_TYPE = "minecraft:writable_book";
const NOTEBOOK_ITEM_NAME = "\u00a7d\u00a7lRBD Notebook\u00a7r\u00a77\n\u00a77Right-click to open command menu";

function giveRBDNotebook(player) {
  try {
    // Check if player already has the notebook
    const invComp = player.getComponent("minecraft:inventory");
    if (!invComp || !invComp.container) return;
    for (let i = 0; i < invComp.size; i++) {
      const it = invComp.container.getItem(i);
      if (it && it.typeId === NOTEBOOK_ITEM_TYPE && it.nameTag === NOTEBOOK_ITEM_NAME) {
        return; // already has one
      }
    }
    // Give a new one
    const notebook = new (require("@minecraft/server").ItemStack)(NOTEBOOK_ITEM_TYPE, 1);
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
      .button("\u00a7aSave Point\n\u00a77Create a save point now", "textures/ui/icon_book_writable")
      .button("\u00a7aInfo\n\u00a77Show save point details", "textures/ui/icon_map")
      .button("\u00a7aStatus\n\u00a77Show all mod settings", "textures/ui/icon_settings")
      .button("\u00a7aLoops\n\u00a77Show your death count", "textures/ui/icon_count")
      .button("\u00a7aLoop Log\n\u00a77Show last 10 deaths", "textures/ui/icon_book")
      .button("\u00a7aLast Death\n\u00a77Show most recent death", "textures/ui/icon_clock")
      .button("\u00a7aRevert\n\u00a77Teleport to save point (no death)", "textures/ui/icon_teleport")
      .button("\u00a7aTest Sound\n\u00a77Play RBD sound to verify", "textures/ui/icon_sound")
      .button("\u00a7aReset Save\n\u00a77Clear save point (permadeath)", "textures/ui/icon_trash")
      .button("\u00a7aNamed Saves\n\u00a77Manage named save points", "textures/ui/icon_book_enchanted")
      .button("\u00a7aParticles\n\u00a77Toggle save point particles", "textures/ui/icon_particles")
      .button("\u00a7aDebug\n\u00a77Show active command layers", "textures/ui/icon_debug")
      .button("\u00a7aHelp\n\u00a77Show full help", "textures/ui/icon_help")
      .button("\u00a7cClose", "textures/ui/cancel");

    const response = await menu.show(player);
    if (response.canceled) return;

    const selection = response.selection;
    const parts = buttonSelectionToCommand(selection);
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
  // Maps button index (in openRBDMenu order) to [sub, ...args]
  switch (selection) {
    case 0: return ["save"];
    case 1: return ["info"];
    case 2: return ["status"];
    case 3: return ["loops"];
    case 4: return ["looplog"];
    case 5: return ["lastdeath"];
    case 6: return ["revert"];
    case 7: return ["testsound"];
    case 8: return ["reset"];
    case 9: return ["named", "list"];
    case 10: return ["particles", "toggle"];
    case 11: return ["debug"];
    case 12: return ["help"];
    case 13: return null; // Close
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
        if (!item) return;
        if (item.typeId !== NOTEBOOK_ITEM_TYPE) return;
        if (item.nameTag !== NOTEBOOK_ITEM_NAME) return;
        // Cancel the default book-opening behavior
        ev.cancel = true;
        system.run(() => {
          try { openRBDMenu(player); }
          catch (e) { warn("openRBDMenu failed:", e); }
        });
      } catch (e) {
        warn("itemUse handler failed:", e);
      }
    });
    LAYERS.itemUI = true;
    log("Layer 3 (itemUse / RBD Notebook): registered - right-click the notebook for a menu");
  } else {
    warn("Layer 3 (itemUse): world.beforeEvents.itemUse is undefined. RBD Notebook UI menu will NOT work.");
  }
} catch (e) {
  warn("Layer 3 init failed:", e);
}

// ============================ Command Handler (shared by all 3 layers) ============================

function handleCommand(player, sub, parts) {
  switch (sub) {
    case "save": {
      const save = captureSave(player);
      saves.set(player.id, save);
      announce(player, `\u00a7aSave point set at \u00a77${Math.floor(save.x)}, ${Math.floor(save.y)}, ${Math.floor(save.z)}\u00a7a in \u00a7b${save.dimensionId.replace("minecraft:", "")}\u00a7a.`);
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
      announce(player, "\u00a7d\u00a7l=== Return By Death v1.2.2 Status ===");
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
      announce(player, "\u00a76v1.2.1 Tier 1 features:");
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
      const log = getDeathLog(player);
      if (log.length === 0) {
        announce(player, "\u00a77No deaths recorded yet.");
        break;
      }
      announce(player, `\u00a7d\u00a7l[RBD] Last ${log.length} death(s):`);
      log.forEach((r, i) => {
        const dt = new Date(r.time);
        const ts = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
        const dim = (r.dimension || "").replace("minecraft:", "");
        announce(player, `\u00a7e#${i+1} \u00a77${ts} \u00a7ain \u00a7b${dim} \u00a77@ ${Math.floor(r.x)}, ${Math.floor(r.y)}, ${Math.floor(r.z)} \u00a77cause: \u00a7c${r.cause}`);
      });
      break;
    }
    case "lastdeath": {
      const log = getDeathLog(player);
      if (log.length === 0) {
        announce(player, "\u00a77You have no recorded deaths.");
        break;
      }
      const r = log[0];
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
        player.playSound(SAVE_SOUND_ID, { volume: CONFIG.soundVolume / 100, pitch: CONFIG.soundPitch / 100 });
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
        if (named.size === 0) {
          announce(player, "\u00a77You have no named save points.");
        } else {
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
        if (named.delete(name)) {
          announce(player, `\u00a7aDeleted named save point '\u00a7e${name}\u00a7a'.`);
        } else {
          announce(player, `\u00a7cNo named save point called '${name}'.`);
        }
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
      named.set(name, captureSave(player));
      announce(player, `\u00a7aNamed save point '\u00a7e${name}\u00a7a' created at your current location.`);
      break;
    }
    case "particles": {
      const arg = parts[2]?.toLowerCase();
      if (arg === "on") { particleOverride.set(player.id, true); announce(player, "\u00a7aSave point particles: \u00a7eON"); }
      else if (arg === "off") { particleOverride.set(player.id, false); announce(player, "\u00a7aSave point particles: \u00a7eOFF"); }
      else if (arg === "toggle") {
        const cur = particleOverride.get(player.id);
        const next = cur !== false; // if undefined or true -> false; if false -> true
        // Actually let's flip it
        const newVal = cur === false;
        particleOverride.set(player.id, newVal);
        announce(player, "\u00a7aSave point particles: \u00a7e" + (newVal ? "ON" : "OFF"));
      }
      else { announce(player, "\u00a7cUsage: !rbd particles <on|off>"); }
      break;
    }
    case "debug": {
      announce(player, "\u00a7d\u00a7l=== RBD v1.2.2 Command Layers ===");
      announce(player, `\u00a7aLayer 1 - CustomCommandRegistry (/rbd:*): \u00a77${LAYERS.customCommand ? "\u00a7aACTIVE" : "\u00a7cINACTIVE (need Bedrock 1.21.80+)"}`);
      announce(player, `\u00a7aLayer 2 - chatSend (!rbd chat): \u00a77${LAYERS.chatSend ? "\u00a7aACTIVE" : "\u00a7cINACTIVE (may need Beta APIs toggle)"}`);
      announce(player, `\u00a7aLayer 3 - RBD Notebook item UI: \u00a77${LAYERS.itemUI ? "\u00a7aACTIVE" : "\u00a7cINACTIVE"}`);
      announce(player, "\u00a77If commands aren't working, check which layers are active.");
      announce(player, "\u00a77Layer 3 (RBD Notebook) should ALWAYS work - check your inventory for the notebook.");
      break;
    }
    case "help":
    default: {
      announce(player, "\u00a7d\u00a7l=== Return By Death v1.2.2 Help ===");
      announce(player, "\u00a76Three ways to run commands:");
      announce(player, "\u00a7a  1. Slash commands: \u00a77/rbd:save, /rbd:info, etc. (Bedrock 1.21.80+)");
      announce(player, "\u00a7a  2. Chat commands: \u00a77!rbd save, !rbd info, etc. (older Bedrock)");
      announce(player, "\u00a7a  3. RBD Notebook: \u00a77right-click the notebook in your inventory for a menu");
      announce(player, "\u00a76Player commands:");
      announce(player, "\u00a7a  save, info, status, loops, looplog, lastdeath");
      announce(player, "\u00a7a  revert, testsound, reset, particles, debug");
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

log("Return By Death v1.2.2 (Bedrock Edition) loaded.");
log(`Save interval: ${CONFIG.saveIntervalSeconds}s. Inspired by Subaru Natsuki from Re:Zero.`);
log("Sound is in resource_pack_RBD (NOT behavior pack).");
log("Command layers - Layer 1 (CustomCommandRegistry): " + (LAYERS.customCommand ? "ACTIVE" : "inactive"));
log("Command layers - Layer 2 (chatSend): " + (LAYERS.chatSend ? "ACTIVE" : "inactive"));
log("Command layers - Layer 3 (RBD Notebook UI): " + (LAYERS.itemUI ? "ACTIVE" : "inactive"));
log("If !rbd commands don't work, check /rbd:debug or !rbd debug, and try the RBD Notebook in your inventory.");
