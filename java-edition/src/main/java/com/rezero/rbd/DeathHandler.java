package com.rezero.rbd;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.world.GameRules;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * DeathHandler - intercepts player death and rewinds them to their save point.
 *
 * Flow:
 *   1. ServerPlayerEntityMixin intercepts onDeath() BEFORE items drop.
 *   2. We cancel the drop (if rbdKeepInventoryOnDeath is true) and mark the player
 *      as "returning".
 *   3. We immediately play the Return By Death sound to all players on the server.
 *   4. We restore the player from SaveManager — teleport, inventory, vitals, XP, effects.
 *   5. We set a short cooldown (configurable) before the next Return By Death can trigger.
 */
public final class DeathHandler {

    /** Players currently in the "returning" state (death was intercepted). */
    private static final Map<UUID, Long> RETURNING = new HashMap<>();

    /** Cooldown end time per player (epoch millis). */
    private static final Map<UUID, Long> COOLDOWN_UNTIL = new HashMap<>();

    private DeathHandler() {}

    /**
     * Called from ServerPlayerEntityMixin.onDeath() — BEFORE the vanilla drop logic runs.
     * Returns true if we handled the death (and the mixin should cancel the rest),
     * false if the death should proceed normally.
     */
    public static boolean onPlayerDeath(ServerPlayerEntity player) {
        MinecraftServer server = player.getServer();
        if (server == null) return false;

        // Master toggle check
        if (!RBDGameRules.enabled(server)) {
            return false;
        }

        // Cooldown check
        Long cdUntil = COOLDOWN_UNTIL.get(player.getUuid());
        long now = System.currentTimeMillis();
        if (cdUntil != null && cdUntil > now) {
            // Cooldown active — let the death proceed normally (player dies for real)
            long seconds = (cdUntil - now) / 1000;
            player.sendMessage(Text.literal("\u00a7c\u00a7l[Return By Death] \u00a7r\u00a7cCooldown active! Cannot rewind for " + seconds + " more second(s)."), false);
            return false;
        }

        // No save point? Death is permanent.
        if (!SaveManager.hasSave(player.getUuid())) {
            player.sendMessage(Text.literal("\u00a74\u00a7l[Return By Death] \u00a7r\u00a7cNo save point exists \u2014 death is permanent!"), false);
            return false;
        }

        // === RETURN BY DEATH TRIGGERS ===

        // 1. Play the iconic sound to everyone on the server
        playReturnByDeathSound(server, player);

        // 2. Notify the dying player and broadcast
        player.sendMessage(Text.literal("\u00a7d\u00a7l[Return By Death] \u00a7r\u00a7dYou have died. Returning to your save point..."), false);
        if (RBDGameRules.broadcastDeath(server)) {
            Text msg = Text.literal("\u00a7d\u00a7l[Return By Death] \u00a7r\u00a77" + player.getName().getString() + " has died and rewound to their save point.");
            for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
                if (p != player) p.sendMessage(msg, false);
            }
        }

        // 3. Mark the player as returning (used by respawn flow if any)
        RETURNING.put(player.getUuid(), now);

        // 4. Restore state
        boolean restored = SaveManager.restore(player);
        if (!restored) {
            // Shouldn't happen — hasSave() returned true above
            return false;
        }

        // 5. Apply a brief invulnerability window (3 seconds) so the player doesn't instantly re-die
        player.setInvulnerabilityTicks(60);

        // 6. Set cooldown
        int cooldownSeconds = RBDGameRules.cooldownSeconds(server);
        if (cooldownSeconds > 0) {
            COOLDOWN_UNTIL.put(player.getUuid(), now + (cooldownSeconds * 1000L));
        }

        // 7. Clear "returning" flag
        RETURNING.remove(player.getUuid());

        // Cancel vanilla death handling (item drops, death message, scoreboard updates)
        return true;
    }

    /** Per-tick update for cooldown timers. */
    public static void tick(ServerPlayerEntity player) {
        // Currently just a stub — cooldowns are checked on death.
        // Could be used to display a cooldown timer in the action bar.
    }

    private static void playReturnByDeathSound(MinecraftServer server, ServerPlayerEntity source) {
        for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
            // Play centered on each player (so everyone hears it at full volume regardless of distance)
            p.playSound(ReturnByDeathMod.RETURN_BY_DEATH_SOUND, SoundCategory.PLAYERS, 1.0f, 1.0f);
        }
        ReturnByDeathMod.LOGGER.info("[Return By Death] Sound played for {} player(s) \u2014 {} died.",
                server.getPlayerManager().getPlayerList().size(), source.getName().getString());
    }
}
