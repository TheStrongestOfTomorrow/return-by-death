package com.rezero.rbd;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.util.Identifier;

/**
 * HeartbeatHandler - plays a subtle heartbeat sound when the player's HP is below 6 (3 hearts).
 *
 * In the Re:Zero anime, a heartbeat sound effect plays during tense moments before Subaru's
 * deaths. This recreates that feeling.
 *
 * Mechanics:
 *   - Every 1 second (20 ticks), check all players.
 *   - If HP <= 6 AND player is not creative/spectator, play a warden heartbeat sound locally.
 *   - The sound is only audible to that player (player.playSound).
 *
 * Uses the vanilla warden heartbeat sound (entity.warden.heartbeat), which is a deep,
 * slow, ominous heartbeat - perfect for this.
 */
public final class HeartbeatHandler {

    /** HP threshold below which the heartbeat plays. */
    private static final float HP_THRESHOLD = 6.0f;

    /** Tick interval between heartbeat checks. */
    private static final int CHECK_INTERVAL_TICKS = 20; // 1 second

    /** Warden heartbeat sound - deep and ominous. */
    private static final Identifier HEARTBEAT_SOUND = new Identifier("minecraft", "entity.warden.heartbeat");

    private HeartbeatHandler() {}

    /** Called every tick from the main loop; checks HP and plays heartbeat if needed. */
    public static void tick(MinecraftServer server) {
        // Only run on the 1-second boundary
        if (server.getTicks() % CHECK_INTERVAL_TICKS != 0) return;

        for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
            // Skip creative/spectator
            if (player.isCreative() || player.isSpectator()) continue;

            float hp = player.getHealth();
            if (hp > 0 && hp <= HP_THRESHOLD) {
                try {
                    SoundEvent event = net.minecraft.registry.Registries.SOUND_EVENT.get(HEARTBEAT_SOUND);
                    if (event != null) {
                        // Volume scales with how close to death the player is - louder at lower HP
                        float volume = 0.4f + (1.0f - hp / HP_THRESHOLD) * 0.6f; // 0.4 to 1.0
                        player.playSound(event, SoundCategory.AMBIENT, volume, 1.0f);
                    }
                } catch (Throwable t) {
                    // Sound may not exist on some modpacks - silently ignore
                }
            }
        }
    }
}
