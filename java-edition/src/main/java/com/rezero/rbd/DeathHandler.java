package com.rezero.rbd;

import net.minecraft.entity.damage.DamageSource;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.math.Vec3d;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * DeathHandler - intercepts player death and rewinds them to their save point.
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
        ReturnByDeathMod.LOGGER.info("[Return By Death] {} died (cause: {}). Triggering rewind.",
                player.getName().getString(), source.getName());

        // 1. Play the iconic sound to all players (configurable volume / pitch / radius)
        playReturnByDeathSound(server, player);

        // 2. Increment death counter ("loops")
        RBDState state = RBDState.get(server);
        int newLoopCount = 0;
        if (RBDGameRules.deathCounterEnabled(server)) {
            newLoopCount = state.incrementDeathCount(player.getUuid());
        }

        // 3. Add to death log
        Vec3d pos = player.getPos();
        state.addDeathLog(player.getUuid(), new RBDState.DeathRecord(
                now,
                player.getWorld().getRegistryKey().getValue().toString(),
                pos.x, pos.y, pos.z,
                source.getName()
        ));

        // 4. Notify the dying player and broadcast
        player.sendMessage(Text.literal("\u00a7d\u00a7l[Return By Death] \u00a7r\u00a7dYou have died. Returning to your save point..."), false);
        if (newLoopCount > 0) {
            player.sendMessage(Text.literal("\u00a77  Loop count: \u00a7e" + newLoopCount + "\u00a77  (this is death #" + newLoopCount + ")"), false);
        }
        if (RBDGameRules.broadcastDeath(server)) {
            Text msg = Text.literal("\u00a7d\u00a7l[Return By Death] \u00a7r\u00a77" + player.getName().getString() + " has died and rewound to their save point.");
            broadcastToPlayers(server, player, msg, false);
        }

        // 5. Restore state
        boolean restored = SaveManager.restore(player);
        if (!restored) {
            return false;
        }

        // 6. Brief invulnerability (3 seconds)
        player.setInvulnerabilityTicks(60);

        // 7. Set cooldown
        int cooldownSeconds = RBDGameRules.cooldownSeconds(server);
        if (cooldownSeconds > 0) {
            COOLDOWN_UNTIL.put(player.getUuid(), now + (cooldownSeconds * 1000L));
        }

        return true; // cancel vanilla death handling
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
