/**
 * Return By Death - Bedrock Edition - v1.3.1 (MINIMAL)
 * =====================================================
 *
 * THIS IS A LITERAL MINIMAL PORT of the working open-source RBD reference pack.
 * No extra features. No commands. No save points. No UI.
 *
 * WHAT IT DOES:
 *   - When any player dies, plays the iconic "Return By Death" sound to everyone.
 *
 * THAT'S IT.
 *
 * The v1.3.0 version was over-engineered and broke. This version is the absolute
 * minimum that can possibly work - it's basically the reference pack with the
 * sound file swapped.
 *
 * Inspired by Subaru Natsuki's ability from Re:Zero.
 */

import { world, system } from "@minecraft/server";

const SAVE_SOUND_ID = "rbd.return_by_death";

// Mutex to prevent double-trigger
let RETURN_ACTIVE = false;

/**
 * Called when a player dies. Plays the RBD sound to all players.
 * That's all this does. Nothing else.
 */
function onPlayerDeath(deadPlayer) {
    if (RETURN_ACTIVE) return;
    RETURN_ACTIVE = true;

    try {
        // Play the sound to ALL players
        const allPlayers = world.getAllPlayers();
        for (let i = 0; i < allPlayers.length; i++) {
            try {
                allPlayers[i].playSound(SAVE_SOUND_ID);
            } catch (e) {}
        }
        console.log("[RBD] Player died: " + (deadPlayer.name || "unknown") + ". Sound played to " + allPlayers.length + " players.");
    } catch (e) {
        console.warn("[RBD] onPlayerDeath failed: " + e);
    }

    // Clear mutex after 60 ticks (3 seconds)
    system.runTimeout(() => {
        RETURN_ACTIVE = false;
    }, 60);
}

// ============================================================
// DEATH DETECTION - 2 methods (matches reference pack pattern)
// ============================================================

// Method 1: entityDie event (most reliable)
try {
    world.afterEvents.entityDie.subscribe((ev) => {
        try {
            if (ev.deadEntity && ev.deadEntity.typeId === "minecraft:player") {
                onPlayerDeath(ev.deadEntity);
            }
        } catch (e) {
            console.warn("[RBD] entityDie handler failed: " + e);
        }
    });
    console.log("[RBD] Death detection Method 1 (entityDie): registered");
} catch (e) {
    console.warn("[RBD] entityDie subscription failed: " + e);
}

// Method 2: Polling fallback - check every tick if any player's HP < 0.1
// This catches deaths that the event might miss.
system.runInterval(() => {
    try {
        const players = world.getAllPlayers();
        for (let i = 0; i < players.length; i++) {
            try {
                const p = players[i];
                const h = p.getComponent("minecraft:health");
                if (h && h.currentValue < 0.1 && !RETURN_ACTIVE) {
                    console.log("[RBD] Polling detected death: " + p.name);
                    onPlayerDeath(p);
                }
            } catch (e) {}
        }
    } catch (e) {}
}, 1);

// ============================================================
// STARTUP - set required gamerules
// ============================================================

system.run(() => {
    try {
        const ov = world.getDimension("overworld");
        try { ov.runCommand("gamerule doimmediaterespawn true"); } catch (e) {}
        try { ov.runCommand("gamerule showdeathmessages false"); } catch (e) {}
        console.log("[RBD] Startup: gamerules set");
    } catch (e) {
        console.warn("[RBD] Startup failed: " + e);
    }
});

console.log("[RBD] Return By Death v1.3.1 (MINIMAL) loaded.");
console.log("[RBD] This is a minimal port - just plays the sound on death. No save points, no commands.");
