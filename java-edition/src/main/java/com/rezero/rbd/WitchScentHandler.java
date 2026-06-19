package com.rezero.rbd;

import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * WitchScentHandler - spawns dark "Witch miasma" particles around a player for ~60 seconds
 * after they die. Other players nearby can briefly see them.
 *
 * In Re:Zero, the Witch of Envy is drawn to Subaru's scent after each death, and the scent
 * grows stronger the more he dies. This is a visual flavor representation of that.
 *
 * Mechanics:
 *   - After a death, the player is "marked" for 60 seconds (1200 ticks).
 *   - Every 2 seconds (40 ticks), spawn a small burst of soul particles around them.
 *   - The scent is purely visual - no gameplay effect.
 */
public final class WitchScentHandler {

    /** Scent duration in milliseconds after a death. */
    private static final long SCENT_DURATION_MS = 60_000L; // 60 seconds

    /** Tick interval for spawning particles. */
    private static final int PARTICLE_TICK_INTERVAL = 40; // 2 seconds

    /** Per-player scent end time (epoch millis). */
    private static final Map<UUID, Long> SCENT_UNTIL = new HashMap<>();

    private WitchScentHandler() {}

    /** Mark a player as smelling of the Witch for 60 seconds. */
    public static void trigger(ServerPlayerEntity player) {
        SCENT_UNTIL.put(player.getUuid(), System.currentTimeMillis() + SCENT_DURATION_MS);
        player.sendMessage(net.minecraft.text.Text.literal(
                "\u00a78\u00a7oThe scent of the Witch clings to you..."), true);
    }

    /** Called every 2 seconds (40 ticks) from the main tick loop. */
    public static void tick(MinecraftServer server) {
        long now = System.currentTimeMillis();
        for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
            Long until = SCENT_UNTIL.get(player.getUuid());
            if (until == null || until <= now) {
                if (until != null) SCENT_UNTIL.remove(player.getUuid());
                continue;
            }
            spawnScentParticles(player);
        }
    }

    private static void spawnScentParticles(ServerPlayerEntity player) {
        ServerWorld world = (ServerWorld) player.getWorld();
        double x = player.getX();
        double y = player.getY() + 1.0; // chest height
        double z = player.getZ();

        // Ring of soul particles around the player (8 particles in a circle)
        for (int i = 0; i < 8; i++) {
            double angle = (i * Math.PI * 2.0) / 8.0;
            double px = x + Math.cos(angle) * 0.8;
            double pz = z + Math.sin(angle) * 0.8;
            world.spawnParticles(ParticleTypes.SOUL,
                    px, y, pz,
                    1, 0.05, 0.2, 0.05, 0.0);
        }

        // A few particles directly on the player (drifting up)
        for (int i = 0; i < 3; i++) {
            world.spawnParticles(ParticleTypes.SOUL_FIRE_FLAME,
                    x + (Math.random() - 0.5) * 0.5,
                    y - 0.5 + Math.random() * 1.5,
                    z + (Math.random() - 0.5) * 0.5,
                    1, 0.0, 0.05, 0.0, 0.0);
        }
    }

    /** Returns true if the player currently smells of the Witch. */
    public static boolean isMarked(UUID uuid) {
        Long until = SCENT_UNTIL.get(uuid);
        return until != null && until > System.currentTimeMillis();
    }
}
