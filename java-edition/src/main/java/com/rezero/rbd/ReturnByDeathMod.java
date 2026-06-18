package com.rezero.rbd;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.world.GameRules;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Return By Death - A Re:Zero-inspired mod.
 *
 * v1.2.0:
 *   - Default save interval changed from 5s to 20s (still configurable 1-600s)
 *   - New commands: /rbd revert (instant teleport to save), /rbd lastdeath, /rbd testsound
 *   - Death subtitle: "Returned By Death - Loop #X" displayed as a title overlay
 *   - Action bar save indicator: brief flash when a save point is created
 *   - Better death cause reporting in death log
 *
 * v1.1.0:
 *   - Configurable save interval, death counter ("loops"), death log, particle beacon,
 *     named save points, configurable sound volume/pitch/broadcast radius,
 *     action bar cooldown, save-point reset.
 *
 * v1.0.0:
 *   - Core mechanic: auto-save every 5s, death rewind, sound trigger
 */
public class ReturnByDeathMod implements ModInitializer {
    public static final String MOD_ID = "rbd";
    public static final Logger LOGGER = LoggerFactory.getLogger("Return By Death");

    /** Legacy constant — kept for compatibility. Actual interval is now configurable. */
    public static final int SAVE_INTERVAL_TICKS = 100;

    /** Sound identifier for the Return By Death trigger. */
    public static final Identifier RETURN_BY_DEATH_SOUND = new Identifier(MOD_ID, "return_by_death");

    /** Whether to enable verbose logging for debugging. */
    public static final boolean DEBUG = Boolean.getBoolean("rbd.debug");

    @Override
    public void onInitialize() {
        LOGGER.info("[Return By Death v1.2.1] Initializing - 'I will save you, no matter how many times I have to die.'");

        // Register custom gamerules
        RBDGameRules.register();

        // Hook the per-tick save logic
        ServerTickEvents.END_SERVER_TICK.register(this::onServerTick);

        // Greet players on join
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
            ServerPlayerEntity player = handler.getPlayer();
            ensureInstantRespawn(server);
            SaveManager.touch(player);
            int interval = RBDGameRules.saveIntervalSeconds(server);
            player.sendMessage(Text.literal("\u00a7d\u00a7l[Return By Death v1.2.1] \u00a7r\u00a77A save point is created every \u00a7e" + interval + "s\u00a77. Die, and rewind."), false);
            player.sendMessage(Text.literal("\u00a77  Type \u00a7e/rbd help\u00a77 for commands. Particles mark your save point."), false);
        });

        // Register commands
        RBDCommands.register();

        LOGGER.info("[Return By Death v1.2.1] Initialization complete. May the Witch of Envy have mercy.");
    }

    private void onServerTick(MinecraftServer server) {
        ensureInstantRespawn(server);

        int intervalSeconds = RBDGameRules.saveIntervalSeconds(server);
        int intervalTicks = intervalSeconds * 20;
        if (intervalTicks < 20) intervalTicks = 20; // sanity floor

        for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
            // Auto-save on the configured interval
            if (player.age > 0 && player.age % intervalTicks == 0) {
                SaveManager.autoSave(player);
                // Brief action bar indicator that a save was just made
                if (player.age % (intervalTicks * 3) == 0) {
                    // Show every 3rd save to avoid spam (i.e. every 60s with default 20s interval)
                    player.sendMessage(Text.literal("\u00a7d\u26a1 Save point recorded"), true);
                }
            }
            // Per-player tick (cooldown action bar)
            DeathHandler.tick(player);
        }

        // Particle beacon - tick once per second (every 20 ticks)
        if (server.getTicks() % 20 == 0) {
            SavePointBeacon.tick(server);
        }

        // v1.2.1: Witch scent particles - tick every 2 seconds (every 40 ticks)
        if (server.getTicks() % 40 == 0) {
            WitchScentHandler.tick(server);
        }

        // v1.2.1: Heartbeat sound at low HP - ticked every tick (the handler checks internally)
        HeartbeatHandler.tick(server);
    }

    private void ensureInstantRespawn(MinecraftServer server) {
        GameRules.BooleanRule rule = server.getGameRules().get(GameRules.DO_IMMEDIATE_RESPAWN);
        if (rule != null && !rule.get()) {
            rule.set(true, server);
            LOGGER.info("[Return By Death] Auto-enabled doImmediateRespawn (required by mod).");
        }
    }
}
