package com.rezero.rbd;

import net.minecraft.entity.damage.DamageSource;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.math.Vec3d;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * DeathHandler - intercepts player death and rewinds them to their save point.
 *
 * v1.2.0 enhancements:
 *   - Death title overlay ("Returned By Death") with subtitle ("Loop #X")
 *   - Better death cause reporting (uses source.getDeathMessage for nice text)
 *   - Added revert() method for the /rbd revert command
 *
 * v1.1.0 enhancements:
 *   - Configurable sound volume / pitch (gamerules)
 *   - Configurable broadcast radius (-1 = whole server)
 *   - Increments death counter ("loops") via RBDState
 *   - Adds entry to death log (timestamp, dim, coords, cause)
 *   - Shows remaining cooldown as action bar text (configurable)
 */
public final class DeathHandler {

    /** Cooldown end time per player (epoch millis). */
    private static final Map<UUID, Long> COOLDOWN_UNTIL = new HashMap<>();

    private DeathHandler() {}

    /**
     * Called from ServerPlayerEntityMixin.onDeath() — BEFORE the vanilla drop logic runs.
     * Returns true if we handled the death (and the mixin should cancel the rest),
     * false if the death should proceed normally.
     */
    public static boolean onPlayerDeath(ServerPlayerEntity player, DamageSource source) {
        MinecraftServer server = player.getServer();
        if (server == null) return false;

        // Master toggle
        if (!RBDGameRules.enabled(server)) {
            return false;
        }

        // Cooldown check
        Long cdUntil = COOLDOWN_UNTIL.get(player.getUuid());
        long now = System.currentTimeMillis();
        if (cdUntil != null && cdUntil > now) {
            long seconds = (cdUntil - now) / 1000;
            player.sendMessage(Text.literal("\u00a7c\u00a7l[Return By Death] \u00a7r\u00a7cCooldown active! Cannot rewind for " + seconds + " more second(s). Death is permanent this time."), false);
            return false;
        }

        // No save? Death is permanent.
        if (!SaveManager.hasSave(player.getUuid())) {
            player.sendMessage(Text.literal("\u00a74\u00a7l[Return By Death] \u00a7r\u00a7cNo save point exists \u2014 death is permanent!"), false);
            return false;
        }

        // === RETURN BY DEATH TRIGGERS ===
        // Build a readable cause string for the death log
        String causeStr;
        try {
            Text deathMsg = source.getDeathMessage(player);
            causeStr = deathMsg != null ? deathMsg.getString() : source.getName();
            // Strip the player name from the start of the message if present
            String pName = player.getName().getString();
            if (causeStr.startsWith(pName)) {
                causeStr = causeStr.substring(pName.length()).trim();
            }
        } catch (Throwable t) {
            causeStr = source.getName();
        }

        ReturnByDeathMod.LOGGER.info("[Return By Death] {} died (cause: {}). Triggering rewind.",
                player.getName().getString(), causeStr);

        // 1. Play the iconic sound to all players (configurable volume / pitch / radius)
        playReturnByDeathSound(server, player);

        // 2. Increment death counter ("loops")
        RBDState state = RBDState.get(server);
        int newLoopCount = 0;
        if (RBDGameRules.deathCounterEnabled(server)) {
            newLoopCount = state.incrementDeathCount(player.getUuid());
        }

        // 3. Add to death log (with nice cause string)
        Vec3d pos = player.getPos();
        state.addDeathLog(player.getUuid(), new RBDState.DeathRecord(
                now,
                player.getWorld().getRegistryKey().getValue().toString(),
                pos.x, pos.y, pos.z,
                causeStr
        ));

        // 4. Show death title + subtitle overlay
        showDeathTitle(player, newLoopCount);

        // 4b. v1.2.1: Send a random Subaru-style death quote
        DeathQuotes.sendRandomQuote(player);

        // 4c. v1.2.1: Mark the player with Witch scent for 60 seconds
        WitchScentHandler.trigger(player);

        // 4d. v1.2.1: Every 5th death, show a special "Witch is watching" action bar message
        if (newLoopCount > 0 && newLoopCount % 5 == 0) {
            player.sendMessage(Text.literal("\u00a78\u00a7l\u00a7oThe Witch of Envy is watching you..."), true);
        }

        // 5. Notify the dying player and broadcast
        player.sendMessage(Text.literal("\u00a7d\u00a7l[Return By Death] \u00a7r\u00a7dYou have died. Returning to your save point..."), false);
        if (newLoopCount > 0) {
            player.sendMessage(Text.literal("\u00a77  Loop count: \u00a7e" + newLoopCount + "\u00a77  (this is death #" + newLoopCount + ")"), false);
            player.sendMessage(Text.literal("\u00a77  Cause: \u00a7c" + causeStr), false);
        }
        if (RBDGameRules.broadcastDeath(server)) {
            Text msg = Text.literal("\u00a7d\u00a7l[Return By Death] \u00a7r\u00a77" + player.getName().getString() + " has died and rewound to their save point.");
            broadcastToPlayers(server, player, msg, false);
        }

        // 6. Restore state
        boolean restored = SaveManager.restore(player);
        if (!restored) {
            return false;
        }

        // 7. Brief invulnerability (3 seconds)
        player.setInvulnerabilityTicks(60);

        // 8. Set cooldown
        int cooldownSeconds = RBDGameRules.cooldownSeconds(server);
        if (cooldownSeconds > 0) {
            COOLDOWN_UNTIL.put(player.getUuid(), now + (cooldownSeconds * 1000L));
        }

        return true; // cancel vanilla death handling
    }

    /**
     * Revert - instantly teleport the player back to their save point without dying.
     * Used by the /rbd revert command. Respects cooldown and save-point existence.
     *
     * Returns null on success, or an error message on failure.
     */
    public static String revert(ServerPlayerEntity player) {
        MinecraftServer server = player.getServer();
        if (server == null) return "No server";
        if (!RBDGameRules.enabled(server)) return "Mod is disabled";

        Long cdUntil = COOLDOWN_UNTIL.get(player.getUuid());
        long now = System.currentTimeMillis();
        if (cdUntil != null && cdUntil > now) {
            long seconds = (cdUntil - now) / 1000;
            return "Cooldown active: " + seconds + " more second(s)";
        }

        if (!SaveManager.hasSave(player.getUuid())) {
            return "No save point exists";
        }

        boolean restored = SaveManager.restore(player);
        if (!restored) return "Failed to restore save point";

        player.setInvulnerabilityTicks(40); // 2 seconds for voluntary revert
        player.sendMessage(Text.literal("\u00a7d\u00a7l[Return By Death] \u00a7r\u00a7aReverted to your save point."), false);

        // Set cooldown on revert too (so players can't spam it)
        int cooldownSeconds = RBDGameRules.cooldownSeconds(server);
        if (cooldownSeconds > 0) {
            COOLDOWN_UNTIL.put(player.getUuid(), now + (cooldownSeconds * 1000L));
        }

        return null; // success
    }

    /** Per-tick update. Currently only used to display action bar cooldown. */
    public static void tick(ServerPlayerEntity player) {
        MinecraftServer server = player.getServer();
        if (server == null) return;
        if (!RBDGameRules.actionBarCooldown(server)) return;

        Long cdUntil = COOLDOWN_UNTIL.get(player.getUuid());
        if (cdUntil == null) return;
        long now = System.currentTimeMillis();
        if (cdUntil <= now) {
            COOLDOWN_UNTIL.remove(player.getUuid());
            return;
        }
        long seconds = (cdUntil - now + 999) / 1000;
        Text msg = Text.literal("\u00a7c\u00a7l[Return By Death] \u00a7r\u00a7cCooldown: \u00a7e" + seconds + "s");
        player.sendMessage(msg, true); // overlay = action bar
    }

    private static void showDeathTitle(ServerPlayerEntity player, int loopCount) {
        // Title: "Returned By Death"
        // Subtitle: "Loop #X"
        try {
            Text title = Text.literal("\u00a7d\u00a7lReturned By Death");
            Text subtitle;
            if (loopCount > 0) {
                subtitle = Text.literal("\u00a77Loop \u00a7e#" + loopCount);
            } else {
                subtitle = Text.literal("\u00a77The Witch smiles...");
            }
            // Fade in 10 ticks, stay 60 ticks, fade out 20 ticks
            player.getServer().execute(() -> {
                // 1.20.1 API: networkHandler.sendPacket with TitleS2CPacket
                var network = player.networkHandler;
                var titlePacket = new net.minecraft.network.packet.s2c.play.TitleS2CPacket(
                        net.minecraft.network.packet.s2c.play.TitleS2CPacket.Action.TITLE, title);
                var subtitlePacket = new net.minecraft.network.packet.s2c.play.TitleS2CPacket(
                        net.minecraft.network.packet.s2c.play.TitleS2CPacket.Action.SUBTITLE, subtitle);
                var timesPacket = new net.minecraft.network.packet.s2c.play.TitleS2CPacket(
                        10, 60, 20);
                network.sendPacket(titlePacket);
                network.sendPacket(subtitlePacket);
                network.sendPacket(timesPacket);
            });
        } catch (Throwable t) {
            ReturnByDeathMod.LOGGER.warn("[RBD] Failed to show death title: {}", t.getMessage());
        }
    }

    private static void playReturnByDeathSound(MinecraftServer server, ServerPlayerEntity source) {
        float volume = RBDGameRules.soundVolume(server);
        float pitch = RBDGameRules.soundPitch(server);
        int radius = RBDGameRules.broadcastRadius(server);

        if (radius < 0) {
            // Global: play centered on each player
            for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
                p.playSound(ReturnByDeathMod.RETURN_BY_DEATH_SOUND, SoundCategory.PLAYERS, volume, pitch);
            }
        } else {
            // Radius: play at death location, audible within radius
            Vec3d pos = source.getPos();
            double r2 = (double) radius * radius;
            for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
                double d2 = p.squaredDistanceTo(pos);
                if (d2 <= r2) {
                    // Volume scales with distance (linear)
                    float distVol = (float) (volume * (1.0 - Math.sqrt(d2) / Math.max(1.0, (double) radius)));
                    distVol = Math.max(0.05f, distVol);
                    p.playSound(ReturnByDeathMod.RETURN_BY_DEATH_SOUND, SoundCategory.PLAYERS, distVol, pitch);
                }
            }
        }
        ReturnByDeathMod.LOGGER.info("[Return By Death] Sound played (vol={}, pitch={}, radius={}).", volume, pitch, radius);
    }

    private static void broadcastToPlayers(MinecraftServer server, ServerPlayerEntity source, Text msg, boolean actionBar) {
        int radius = RBDGameRules.broadcastRadius(server);
        if (radius < 0) {
            for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
                if (p != source) p.sendMessage(msg, actionBar);
            }
        } else {
            Vec3d pos = source.getPos();
            double r2 = (double) radius * radius;
            for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
                if (p == source) continue;
                if (p.squaredDistanceTo(pos) <= r2) {
                    p.sendMessage(msg, actionBar);
                }
            }
        }
    }
}
