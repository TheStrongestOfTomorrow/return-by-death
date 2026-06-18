/**
 * Return By Death - Bedrock Edition (incl. Pocket Edition)
 * ========================================================
 *
 * Inspired by Subaru Natsuki's ability from Re:Zero.
 *
 * Mechanics:
 *   - Every 5 seconds (100 ticks), the player's state is silently captured:
 *       * Position (x, y, z), dimension, rotation
 *       * Full inventory (36 slots: 27 main + 9 hotbar)
 *       * Armor (4 slots: head, chest, legs, feet)
 *       * Health, hunger
 *       * XP level
 *   - On player death:
 *       * The iconic "Return By Death" sound is played to every player on the server
 *       * Dropped items near the death location are despawned (so they don't dupe)
 *       * The player is marked for "return"
 *   - On respawn:
 *       * The player is teleported back to their save point
 *       * Inventory, armor, vitals, and XP are restored from the save
 *       * A brief invulnerability window is granted (3 seconds of Resistance V)
 *
 * Chat commands:
 *   !rbd save    - manually create a save point right now
 *   !rbd info    - show your current save point
 *   !rbd status  - show mod status
 *   !rbd help    - show help
 *
 * Notes:
 *   - Requires "Immediate Respawn" toggle to be ON in world settings.
 *   - Compatible with Minecraft Bedrock 1.21+ on all platforms including Pocket Edition.
 */

import {
  world,
  system,
  EquipmentSlot,
  GameMode,
} from "@minecraft/server";

// ============================ Configuration ============================

const SAVE_INTERVAL_TICKS = 100; // 5 seconds at 20 TPS
const SAVE_SOUND_ID = "rbd.return_by_death";
const INVULN_TICKS_AFTER_RETURN = 60; // 3 seconds
const ITEM_DESPAWN_RADIUS = 8;

const CONFIG = {
  enabled: true,
  broadcastDeaths: false,
  cooldownSeconds: 0,
};

// ============================ Save State Store ============================

/** @type {Map<string, object>} player.id -> save snapshot */
const saves = new Map();

/** @type {Set<string>} player.id of players marked for return on next respawn */
const pendingReturns = new Set();

/** @type {Map<string, {x:number,y:number,z:number,dimensionId:string}>} */
const deathLocations = new Map();

/** @type {Map<string, number>} cooldown end times (ms since epoch) */
const cooldownUntil = new Map();

// ============================ Helpers ============================

function log(...args) {
  console.log("[RBD]", ...args);
}

function announce(player, message) {
  try {
    player.sendMessage("\u00a7d\u00a7l[Return By Death]\u00a7r " + message);
  } catch (_) {}
}

function broadcast(message) {
  for (const p of world.getAllPlayers()) {
    try { p.sendMessage(message); } catch (_) {}
  }
}

/**
 * Captures a deep snapshot of the player's state.
 * @param {import("@minecraft/server").Player} player
 */
function captureSave(player) {
  const loc = player.location;
  const rot = player.getRotation();
  const dim = player.dimension.id;

  // Inventory (36 slots)
  const invComp = player.getComponent("minecraft:inventory");
  const inventory = [];
  if (invComp && invComp.container) {
    const c = invComp.container;
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it) inventory.push({ slot: i, item: it.clone() });
    }
  }

  // Armor
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

  // Vitals
  let health = 20, hunger = 20, xpLevel = 0;
  try {
    const h = player.getComponent("minecraft:health");
    if (h) health = h.currentValue;
  } catch (_) {}
  try {
    const hu = player.getComponent("minecraft:hunger");
    if (hu) hunger = hu.currentValue;
  } catch (_) {}
  try {
    const xp = player.getComponent("minecraft:experience");
    if (xp) xpLevel = xp.level;
  } catch (_) {}

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

/**
 * Restores the player's state from a save snapshot.
 * @param {import("@minecraft/server").Player} player
 * @param {object} save
 */
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
  try {
    const h = player.getComponent("minecraft:health");
    if (h) h.setCurrentValue(save.health);
  } catch (_) {}
  try {
    const hu = player.getComponent("minecraft:hunger");
    if (hu) hu.setCurrentValue(save.hunger);
  } catch (_) {}
  try {
    const xp = player.getComponent("minecraft:experience");
    if (xp) {
      // Reset to 0 then add the saved level
      const current = xp.level;
      xp.addLevels(-current);
      xp.addLevels(save.xpLevel);
    }
  } catch (_) {}

  // Brief invulnerability (3 seconds of Resistance V + Fire Resistance)
  try {
    player.addEffect("minecraft:resistance", INVULN_TICKS_AFTER_RETURN, { amplifier: 4, showParticles: false });
    player.addEffect("minecraft:fire_resistance", INVULN_TICKS_AFTER_RETURN, { amplifier: 1, showParticles: false });
  } catch (_) {}
}

/**
 * Plays the Return By Death sound to every player on the server.
 */
function playReturnByDeathSound() {
  for (const p of world.getAllPlayers()) {
    try {
      p.playSound(SAVE_SOUND_ID, { volume: 1.0, pitch: 1.0 });
    } catch (e) {
      log("Failed to play sound for", p.name, ":", e);
    }
  }
}

/**
 * Despawns all item entities within ITEM_DESPAWN_RADIUS of the given location.
 */
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

// ============================ Event Handlers ============================

// Periodic save (every 5 seconds)
system.runInterval(() => {
  if (!CONFIG.enabled) return;
  for (const player of world.getAllPlayers()) {
    try {
      if (player.getGameMode() === GameMode.spectator) continue;
      const save = captureSave(player);
      saves.set(player.id, save);
    } catch (e) {
      log("Save failed for", player.name, ":", e);
    }
  }
}, SAVE_INTERVAL_TICKS);

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
  announce(player, "\u00a7aA save point has been created. Your state is recorded every 5 seconds.");
  announce(player, "\u00a77When you die, you will rewind to your last save point with everything you had then.");
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

  playReturnByDeathSound();

  announce(player, "\u00a7dYou have died. Returning to your save point...");
  if (CONFIG.broadcastDeaths) {
    for (const p of world.getAllPlayers()) {
      if (p.id !== player.id) {
        p.sendMessage(`\u00a7d[Return By Death]\u00a7r \u00a77${player.name} has died and rewound to their save point.`);
      }
    }
  }

  pendingReturns.add(player.id);

  if (player.location) {
    deathLocations.set(player.id, {
      x: player.location.x,
      y: player.location.y,
      z: player.location.z,
      dimensionId: player.dimension.id,
    });
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

  // Wait one tick so the player is fully spawned, then teleport back
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

// Chat commands
world.beforeEvents.chatSend.subscribe((ev) => {
  const msg = ev.message.trim();
  if (!msg.toLowerCase().startsWith("!rbd")) return;

  ev.cancel = true;
  const sender = ev.sender;
  const parts = msg.split(/\s+/);
  const sub = (parts[1] || "help").toLowerCase();

  system.run(() => {
    switch (sub) {
      case "save": {
        try {
          const save = captureSave(sender);
          saves.set(sender.id, save);
          announce(sender, `\u00a7aSave point set at \u00a77${Math.floor(save.x)}, ${Math.floor(save.y)}, ${Math.floor(save.z)}\u00a7a in \u00a7b${save.dimensionId.replace("minecraft:", "")}\u00a7a.`);
        } catch (e) {
          announce(sender, "\u00a7cFailed to create save point: " + e);
        }
        break;
      }
      case "info": {
        const s = saves.get(sender.id);
        if (!s) {
          announce(sender, "\u00a7cNo save point exists yet. One will be created automatically within 5 seconds.");
        } else {
          announce(sender, `\u00a7aSave point: \u00a77${Math.floor(s.x)}, ${Math.floor(s.y)}, ${Math.floor(s.z)}\u00a7a in \u00a7b${s.dimensionId.replace("minecraft:", "")}`);
          announce(sender, `\u00a7a  HP: \u00a7c${Math.floor(s.health)}\u00a7a   Hunger: \u00a76${Math.floor(s.hunger)}\u00a7a   XP Lvl: \u00a7e${s.xpLevel}`);
          announce(sender, `\u00a77  Saved ${Math.floor((Date.now() - s.timestamp) / 1000)} second(s) ago.`);
        }
        break;
      }
      case "status": {
        announce(sender, `\u00a7aEnabled: \u00a77${CONFIG.enabled}`);
        announce(sender, `\u00a7aCooldown (sec): \u00a77${CONFIG.cooldownSeconds}`);
        announce(sender, `\u00a7aBroadcast deaths: \u00a77${CONFIG.broadcastDeaths}`);
        announce(sender, `\u00a7aSave interval: \u00a775 seconds`);
        break;
      }
      case "help":
      default: {
        announce(sender, "\u00a7d\u00a7l=== Return By Death Help ===");
        announce(sender, "\u00a7a!rbd save \u00a77- Manually create a save point now");
        announce(sender, "\u00a7a!rbd info \u00a77- Show your save point details");
        announce(sender, "\u00a7a!rbd status \u00a77- Show mod status");
        announce(sender, "\u00a7a!rbd help \u00a77- Show this help");
        announce(sender, "\u00a77A save point is automatically created every 5 seconds.");
        announce(sender, "\u00a77On death, you rewind to your last save point with the inventory you had then.");
        break;
      }
    }
  });
});

log("Return By Death (Bedrock Edition) loaded.");
log("Save interval: 5 seconds. Inspired by Subaru Natsuki from Re:Zero.");
