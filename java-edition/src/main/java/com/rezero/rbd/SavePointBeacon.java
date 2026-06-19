package com.rezero.rbd;

import net.minecraft.particle.DustParticleEffect;
import net.minecraft.particle.ParticleEffect;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.Vec3d;
import net.minecraft.registry.RegistryKey;
import net.minecraft.world.World;

import java.util.Map;
import java.util.UUID;

/**
 * SavePointBeacon - spawns purple witch-themed particles at each player's save point
 * so they can see where they'll respawn if they die.
 *
 * Particles are spawned only in the world that matches the save point's dimension,
 * and only the save-point owner sees them (using ServerPlayerEntity.networkHandler.send()
 * would be the strict way; here we just spawn them globally — they'll only be visible
 * if the player is in the same dimension and within render distance).
 *
 * Triggered every 20 ticks (1 second) from ReturnByDeathMod.
 */
public final class SavePointBeacon {

    private SavePointBeacon() {}

    public static void tick(MinecraftServer server) {
        if (!RBDGameRules.particleBeaconEnabled(server)) return;

        for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
            SaveManager.PlayerSave save = SaveManager.getSave(player.getUuid());
            if (save == null) continue;

            // Only show particles if the player is in the same dimension as their save
            if (!player.getWorld().getRegistryKey().equals(save.worldKey)) continue;

            ServerWorld world = (ServerWorld) player.getWorld();
            Vec3d pos = new Vec3d(save.x, save.y, save.z);

            // Skip if too far away (beyond 64 blocks) to save particle bandwidth
            if (player.squaredDistanceTo(pos) > 64 * 64) continue;

            spawnBeacon(world, pos);
        }
    }

    /**
     * Spawn a small beacon of purple particles at the save point.
     * Pattern: a vertical column of dust particles + a single end rod particle on top.
     */
    private static void spawnBeacon(ServerWorld world, Vec3d pos) {
        // Witch-of-Envy purple dust (RGB 0.4, 0.1, 0.6)
        DustParticleEffect dust = new DustParticleEffect(
                net.minecraft.util.math.Vector3f.XP, 1.0f
        );
        // Use purple dust: rgb(102, 26, 153) = 0.4, 0.1, 0.6
        DustParticleEffect purpleDust = new DustParticleEffect(
                new net.minecraft.util.math.Vector3f(0.4f, 0.1f, 0.6f), 1.5f
        );

        // Vertical column (3 particles)
        for (int i = 0; i < 3; i++) {
            world.spawnParticles(purpleDust,
                    pos.x, pos.y + 0.3 + i * 0.4, pos.z,
                    1, 0.05, 0.05, 0.05, 0.0);
        }

        // Top spark (end rod - looks like a tiny glowing dot)
        world.spawnParticles(ParticleTypes.END_ROD,
                pos.x, pos.y + 1.5, pos.z,
                1, 0.02, 0.02, 0.02, 0.0);

        // Ground ring (4 particles in a small circle)
        for (int angle = 0; angle < 360; angle += 90) {
            double rad = Math.toRadians(angle);
            world.spawnParticles(purpleDust,
                    pos.x + Math.cos(rad) * 0.5, pos.y + 0.05, pos.z + Math.sin(rad) * 0.5,
                    1, 0.0, 0.0, 0.0, 0.0);
        }
    }
}
