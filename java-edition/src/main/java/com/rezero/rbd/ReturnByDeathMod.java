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
 * When a player dies, they are rewound to their last save point (recorded every 5 seconds)
 * with the inventory they had at that moment, and the iconic Return By Death sound plays.
 *
 * Inspired by Subaru Natsuki's ability from Re:Zero.
 */
public class ReturnByDeathMod implements ModInitializer {
    public static final String MOD_ID = "rbd";
    public static final Logger LOGGER = LoggerFactory.getLogger("Return By Death");

    /** Save interval in ticks (5 seconds = 100 ticks). */
    public static final int SAVE_INTERVAL_TICKS = 100;

    /** Sound identifier for the Return By Death trigger. */
    public static final Identifier RETURN_BY_DEATH_SOUND = new Identifier(MOD_ID, "return_by_death");

    /** Whether to enable verbose logging for debugging. */
    public static final boolean DEBUG = Boolean.getBoolean("rbd.debug");

    @Override
    public void onInitialize() {
        LOGGER.info("[Return By Death] Initializing - 'I will save you, no matter how many times I have to die.'");
        LOGGER.info("[Return By Death] Save interval: {} ticks (5 seconds)", SAVE_INTERVAL_TICKS);

        // Register custom gamerules
        RBDGameRules.register();

        // Hook the per-tick save logic
        ServerTickEvents.END_SERVER_TICK.register(this::onServerTick);

        // Greet players on join and ensure instant respawn is enabled
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
            ServerPlayerEntity player = handler.getPlayer();
            ensureInstantRespawn(server);
            SaveManager.touch(player);
            player.sendMessage(Text.literal("\u00a7d\u00a7l[Return By Death] \u00a7r\u00a77A save point will be created every 5 seconds. Die, and rewind."), false);
        });

        // Register commands
        RBDCommands.register();

        LOGGER.info("[Return By Death] Initialization complete. May the Witch of Envy have mercy.");
    }

    private void onServerTick(MinecraftServer server) {
        // Auto-enable instant respawn if disabled
        ensureInstantRespawn(server);

        for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
            // Periodically save the player's state (every 5 seconds)
            if (player.age > 0 && player.age % SAVE_INTERVAL_TICKS == 0) {
                SaveManager.autoSave(player);
            }
            // Drive the death cooldown timer
            DeathHandler.tick(player);
        }
    }

    private void ensureInstantRespawn(MinecraftServer server) {
        GameRules.BooleanRule rule = server.getGameRules().get(GameRules.DO_IMMEDIATE_RESPAWN);
        if (rule != null && !rule.get()) {
            rule.set(true, server);
            LOGGER.info("[Return By Death] Auto-enabled doImmediateRespawn (required by mod).");
        }
    }
}
