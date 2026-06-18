/**
 * Return By Death - Bedrock Edition (incl. Pocket Edition) - v1.1.0
 * =================================================================
 *
 * Inspired by Subaru Natsuki's ability from Re:Zero.
 *
 * v1.1.0 NEW FEATURES:
 *   - Configurable save interval (default 5s, change with !rbd interval <sec>)
 *   - Death counter ("loops") - persists across restarts via dynamic properties
 *   - Death log (last 10 deaths: timestamp, dim, coords, cause)
 *   - Save point particle beacon - purple particles at your save point (visible to owner)
 *   - Named save points (max 3 by default, change with !rbd maxnamed <count>)
 *   - Configurable sound volume / pitch (!rbd volume 0-100, !rbd pitch 50-200)
 *   - Configurable broadcast radius (!rbd radius <blocks>, -1 = global)
 *   - Action bar cooldown display
 *   - Reset command (permadeath mode): !rbd reset
 *
 * CORE MECHANIC (v1.0.0):
 *   - Every 5 seconds (configurable), the player's state is silently captured.
 *   - On death: iconic "Return By Death" sound plays to all (or within radius),
 *     dropped items near death location are despawned (anti-dupe),
 *     the player is teleported back to their save point,
 *     inventory/armor/vitals/XP are restored, and 3s invulnerability is granted.
 *
 * CHAT COMMANDS:
 *   Player:
 *     !rbd save              - Manually create a save point now
 *     !rbd info              - Show your current save point details
 *     !rbd status            - Show all mod settings
 *     !rbd loops             - Show your death count
 *     !rbd looplog           - Show your last 10 deaths
 *     !rbd reset             - Clear your save point (permadeath mode)
 *     !rbd named <name>      - Create a named save point
 *     !rbd named list        - List your named save points
 *     !rbd named delete <n>  - Delete a named save point
 *     !rbd particles on|off  - Toggle save point particles
 *     !rbd help              - Show help
 *
 *   Op only (require operator status):
 *     !rbd interval <sec>    - Change save interval (1-600)
 *     !rbd cooldown <sec>    - Change cooldown (0-3600)
 *     !rbd broadcast on|off  - Toggle death broadcast
 *     !rbd radius <blocks>   - Change broadcast radius (-1 = global)
 *     !rbd volume <0-100>    - Change sound volume %
 *     !rbd pitch <50-200>    - Change sound pitch %
 *     !rbd maxnamed <0-20>   - Change max named save points per player
 *     !rbd mod on|off        - Master enable/disable
 *
 * Notes:
 *   - Requires "Immediate Respawn" toggle to be ON in world settings.
 *   - Compatible with Minecraft Bedrock 1.21+ on all platforms including Pocket Edition.
 *   - Uses @minecraft/server 1.14.0 (compatible with 1.21.x through 1.26.x).
 */

import {
  world,
  system,
  EquipmentSlot,
  GameMode,
  ParticleEffect,
} from "@minecraft/server";

// ============================ Configuration ============================

const SAVE_SOUND_ID = "rbd.return_by_death";
const INVULN_TICKS_AFTER_RETURN = 60; // 3 seconds
const ITEM_DESPAWN_RADIUS = 8;
const BEACON_INTERVAL_TICKS = 20; // particles spawned every 1 second
const BEACON_MAX_DISTANCE = 64; // don't show particles if player is too far
const MAX_LOG_ENTRIES = 10;

// Default config (overridable via !rbd commands - persisted in world dynamic property)
const DEFAULT_CONFIG = {
  enabled: true,
  saveIntervalSeconds: 5,
  cooldownSeconds: 0,
  broadcastDeaths: false,
  broadcastRadius: -1, // -1 = global
  soundVolume: 100,    // percent
  soundPitch: 100,     // percent
  particleBeaconEnabled: true,
  deathCounterEnabled: true,
  maxNamedSavePoints: 3,
  actionBarCooldown: true,
};

// Load config from world dynamic property (persists across restarts)
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

/** @type {Map<string, object>} player.id -> save snapshot (auto save) */
const saves = new Map();

/** @type {Map<string, Map<string, object>>} player.id -> (name -> save) */
const namedSaves = new Map();

/** @type {Set<string>} player.id of players marked for return on next respawn */
const pendingReturns = new Set();

/** @type {Map<string, {x:number,y:number,z:number,dimensionId:string}>} */
const deathLocations = new Map();

/** @type {Map<string, number>} cooldown end times (ms since epoch) */
const cooldownUntil = new Map();

/** @type {Map<string, boolean>} per-player particle override */
const particleOverride = new Map();

// ============================ Helpers ============================

function log(...args) {
  console.log("[RBD]", ...args);
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
    // Fallback: check tag
    return player.hasTag("rbdop") || player.hasTag("operator");
  }
}

/**
 * Captures a deep snapshot of the player's state.
 */
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

  return {
    dimensionId: dim,
    x: loc.x, y: loc.y, z: loc.z,
    rx: rot.x, ry: rot.y,
    inventory,
    equipment,
    health, hunger, xpLevel,
    timestamp: Date.now(),
  };
}

function restoreSave(player, save) {
  // Teleport
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

  // Restore inventory
  const invComp = player.getComponent("minecraft:inventory");
  if (invComp && invComp.container) {
    const c = invComp.container;
    for (let i = 0; i < c.size; i++) c.setItem(i, undefined);
    for (const { slot, item } of save.inventory) {
      try { c.setItem(slot, item); } catch (e) { log("set slot failed:", e); }
    }
  }

  // Restore armor
  try {
    const eqComp = player.getComponent("minecraft:equippable");
    if (eqComp) {
      for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet]) {
        const saved = save.equipment[slot];
        try { eqComp.setEquipment(slot, saved || undefined); } catch (_) {}
      }
    }
  } catch (_) {}

  // Vitals
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

  // Brief invulnerability
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
    // Global
    for (const p of world.getAllPlayers()) {
      try { p.playSound(SAVE_SOUND_ID, { volume, pitch }); } catch (_) {}
    }
  } else {
    // Radius from death location
    const r = CONFIG.broadcastRadius;
    for (const p of world.getAllPlayers()) {
      try {
        if (p.dimension.id !== deathDimId) continue;
        const dx = p.location.x - deathLoc.x;
        const dy = p.location.y - deathLoc.y;
        const dz = p.location.z - deathLoc.z;
        const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (d <= r) {
          // Volume scales with distance (linear)
          const distVol = Math.max(0.05, volume * (1 - d / Math.max(1, r)));
          p.playSound(SAVE_SOUND_ID, { volume: distVol, pitch });
        }
      } catch (_) {}
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
    log(`Cleared ${items.length} dropped item(s) near death location.`);
  } catch (e) {
    log("clearDroppedItemsNear failed:", e);
  }
}

// ============================ Death counter + log (persistent) ============================

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
    // Vertical column of purple particles (3 high)
    for (let i = 0; i < 3; i++) {
      dim.spawnParticle("minecraft:basic_crit_particle", { x: base.x, y: base.y + 0.3 + i * 0.4, z: base.z });
    }
    // Top spark
    dim.spawnParticle("minecraft:endrod", { x: base.x, y: base.y + 1.5, z: base.z });
    // Ground ring
    for (let angle = 0; angle < 360; angle += 90) {
      const rad = angle * Math.PI / 180;
      dim.spawnParticle("minecraft:basic_crit_particle", {
        x: base.x + Math.cos(rad) * 0.5,
        y: base.y + 0.05,
        z: base.z + Math.sin(rad) * 0.5,
      });
    }
  } catch (e) {
    // Some particle IDs may differ across versions - silently ignore
  }
}

// ============================ Event Handlers ============================

// Periodic save loop (uses configurable interval)
let saveTickCount = 0;
system.runInterval(() => {
  if (!CONFIG.enabled) return;
  saveTickCount++;
  if (saveTickCount < CONFIG.saveIntervalSeconds * 20) return;
  saveTickCount = 0;

  for (const player of world.getAllPlayers()) {
    try {
      if (player.getGameMode() === GameMode.spectator) continue;
      const save = captureSave(player);
      saves.set(player.id, save);
    } catch (e) {
      log("Save failed for", player.name, ":", e);
    }
  }
}, 20); // check every 1 second, save on interval

// Particle beacon loop (every 1 second)
system.runInterval(() => {
  if (!CONFIG.enabled) return;
  for (const player of world.getAllPlayers()) {
    const save = saves.get(player.id);
    if (save) spawnBeaconParticles(player, save);
  }
}, BEACON_INTERVAL_TICKS);

// Action bar cooldown display (every 10 ticks = 0.5s)
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

// Initial spawn
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
  announce(player, "\u00a77Type \u00a7e!rbd help\u00a77 for commands.");
});

// On death - trigger Return By Death
world.afterEvents.playerDie.subscribe((ev) => {
  if (!CONFIG.enabled) return;
  const player = ev.player;
  if (!player) return;

  // Cooldown
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

  // === RETURN BY DEATH TRIGGERS ===
  log(`${player.name} died - triggering Return By Death.`);

  const deathLoc = player.location ? { x: player.location.x, y: player.location.y, z: player.location.z } : null;
  const deathDimId = player.dimension.id;

  playReturnByDeathSound(deathLoc || { x: 0, y: 0, z: 0 }, deathDimId);

  // Increment death counter
  let loopCount = 0;
  if (CONFIG.deathCounterEnabled) {
    loopCount = incrementDeathCount(player);
  }

  // Add to death log
  addDeathLog(player, {
    time: now,
    dimension: deathDimId,
    x: deathLoc ? deathLoc.x : 0,
    y: deathLoc ? deathLoc.y : 0,
    z: deathLoc ? deathLoc.z : 0,
    cause: ev.damageSource?.cause ?? "unknown",
  });

  announce(player, "\u00a7dYou have died. Returning to your save point...");
  if (loopCount > 0) {
    announce(player, `\u00a77  Loop count: \u00a7e${loopCount}\u00a77 (this is death #${loopCount})`);
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

// On respawn - restore state
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

// ============================ Chat Commands ============================

world.beforeEvents.chatSend.subscribe((ev) => {
  const msg = ev.message.trim();
  if (!msg.toLowerCase().startsWith("!rbd")) return;

  ev.cancel = true;
  const sender = ev.sender;
  const parts = msg.split(/\s+/);
  const sub = (parts[1] || "help").toLowerCase();

  system.run(() => {
    try {
      handleCommand(sender, sub, parts);
    } catch (e) {
      announce(sender, "\u00a7cCommand error: " + e);
      log("Command error:", e);
    }
  });
});

function handleCommand(player, sub, parts) {
  switch (sub) {
    // ----- Player commands -----
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
      const named = namedSaves.get(player.id) || new Map();
      announce(player, `\u00a7a  Named save points: \u00a77${named.size} / ${CONFIG.maxNamedSavePoints}`);
      break;
    }
    case "status": {
      announce(player, "\u00a7d\u00a7l=== Return By Death v1.1.0 Status ===");
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
      break;
    }
    case "loops": {
      if (!CONFIG.deathCounterEnabled) {
        announce(player, "\u00a7cDeath counter is disabled. Enable with \u00a7e!rbd ... deathcounter on");
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
      // create: !rbd named <name>
      const name = parts[2];
      if (!name) { announce(player, "\u00a7cUsage: !rbd named <name>"); break; }
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
      else { announce(player, "\u00a7cUsage: !rbd particles <on|off>"); }
      break;
    }
    case "help":
    default: {
      announce(player, "\u00a7d\u00a7l=== Return By Death v1.1.0 Help ===");
      announce(player, "\u00a76Player commands:");
      announce(player, "\u00a7a!rbd save \u00a77- Manually create a save point now");
      announce(player, "\u00a7a!rbd info \u00a77- Show your save point details");
      announce(player, "\u00a7a!rbd status \u00a77- Show all mod settings");
      announce(player, "\u00a7a!rbd loops \u00a77- Show your death count");
      announce(player, "\u00a7a!rbd looplog \u00a77- Show your last 10 deaths");
      announce(player, "\u00a7a!rbd reset \u00a77- Clear your save point (permadeath mode)");
      announce(player, "\u00a7a!rbd named <name> \u00a77- Create a named save point");
      announce(player, "\u00a7a!rbd named list \u00a77- List named save points");
      announce(player, "\u00a7a!rbd named delete <name> \u00a77- Delete a named save point");
      announce(player, "\u00a7a!rbd particles <on|off> \u00a77- Toggle save point particles");
      announce(player, "\u00a76Op commands:");
      announce(player, "\u00a7a!rbd interval <sec> \u00a77- Change save interval (1-600)");
      announce(player, "\u00a7a!rbd cooldown <sec> \u00a77- Change cooldown (0-3600)");
      announce(player, "\u00a7a!rbd broadcast <on|off> \u00a77- Toggle death broadcast");
      announce(player, "\u00a7a!rbd radius <blocks> \u00a77- Change broadcast radius (-1 = global)");
      announce(player, "\u00a7a!rbd volume <0-100> \u00a77- Change sound volume %");
      announce(player, "\u00a7a!rbd pitch <50-200> \u00a77- Change sound pitch %");
      announce(player, "\u00a7a!rbd maxnamed <0-20> \u00a77- Change max named save points");
      announce(player, "\u00a7a!rbd mod <on|off> \u00a77- Master enable/disable");
      break;
    }

    // ----- Op commands -----
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

log("Return By Death v1.1.0 (Bedrock Edition) loaded.");
log(`Save interval: ${CONFIG.saveIntervalSeconds}s. Inspired by Subaru Natsuki from Re:Zero.`);
