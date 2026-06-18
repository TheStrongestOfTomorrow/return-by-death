package com.rezero.rbd;

import net.fabricmc.fabric.api.gamerule.v1.GameRuleFactory;
import net.fabricmc.fabric.api.gamerule.v1.GameRuleRegistry;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.GameRules;

/**
 * Central registry for all Return By Death gamerules.
 *
 * Registered rules (v1.1.0):
 *   rbdEnabled                  (bool,  default true)   — master toggle for the mod
 *   rbdSaveIntervalSeconds      (int,   default 5)      — seconds between auto-saves (was hardcoded to 5 in v1.0.0)
 *   rbdCooldownSeconds          (int,   default 0)      — cooldown before the next Return By Death can trigger
 *   rbdBroadcastDeath           (bool,  default false)  — broadcast a message when a player Returns By Death
 *   rbdBroadcastRadius          (int,   default -1)     — radius (blocks) for sound + message broadcast (-1 = whole server)
 *   rbdKeepInventoryOnDeath     (bool,  default true)   — keep items in inventory even though vanilla keepInventory is off
 *   rbdSoundVolume              (int,   default 100)    — sound volume as percentage (0-100)
 *   rbdSoundPitch               (int,   default 100)    — sound pitch as percentage (50-200)
 *   rbdParticleBeaconEnabled    (bool,  default true)   — show purple particles at your save point (visible only to you)
 *   rbdDeathCounterEnabled      (bool,  default true)   — track each player's death count ("loops")
 *   rbdMaxNamedSavePoints       (int,   default 3)      — max named save points per player (besides the auto one)
 *   rbdActionBarCooldown        (bool,  default true)   — show remaining cooldown as action bar text
 */
public final class RBDGameRules {

    public static GameRules.Key<GameRules.BooleanRule> ENABLED;
    public static GameRules.Key<GameRules.IntRule> SAVE_INTERVAL_SECONDS;
    public static GameRules.Key<GameRules.IntRule> COOLDOWN_SECONDS;
    public static GameRules.Key<GameRules.BooleanRule> BROADCAST_DEATH;
    public static GameRules.Key<GameRules.IntRule> BROADCAST_RADIUS;
    public static GameRules.Key<GameRules.BooleanRule> KEEP_INVENTORY_ON_DEATH;
    public static GameRules.Key<GameRules.IntRule> SOUND_VOLUME;
    public static GameRules.Key<GameRules.IntRule> SOUND_PITCH;
    public static GameRules.Key<GameRules.BooleanRule> PARTICLE_BEACON_ENABLED;
    public static GameRules.Key<GameRules.BooleanRule> DEATH_COUNTER_ENABLED;
    public static GameRules.Key<GameRules.IntRule> MAX_NAMED_SAVE_POINTS;
    public static GameRules.Key<GameRules.BooleanRule> ACTION_BAR_COOLDOWN;

    private RBDGameRules() {}

    public static void register() {
        ENABLED = GameRuleRegistry.register("rbdEnabled",
                GameRules.Category.PLAYER, GameRuleFactory.createBooleanRule(true));
        SAVE_INTERVAL_SECONDS = GameRuleRegistry.register("rbdSaveIntervalSeconds",
                GameRules.Category.PLAYER, GameRuleFactory.createIntRule(20, 1, 600));
        COOLDOWN_SECONDS = GameRuleRegistry.register("rbdCooldownSeconds",
                GameRules.Category.PLAYER, GameRuleFactory.createIntRule(0, 0, 3600));
        BROADCAST_DEATH = GameRuleRegistry.register("rbdBroadcastDeath",
                GameRules.Category.PLAYER, GameRuleFactory.createBooleanRule(false));
        BROADCAST_RADIUS = GameRuleRegistry.register("rbdBroadcastRadius",
                GameRules.Category.PLAYER, GameRuleFactory.createIntRule(-1, -1, 100000));
        KEEP_INVENTORY_ON_DEATH = GameRuleRegistry.register("rbdKeepInventoryOnDeath",
                GameRules.Category.PLAYER, GameRuleFactory.createBooleanRule(true));
        SOUND_VOLUME = GameRuleRegistry.register("rbdSoundVolume",
                GameRules.Category.PLAYER, GameRuleFactory.createIntRule(100, 0, 100));
        SOUND_PITCH = GameRuleRegistry.register("rbdSoundPitch",
                GameRules.Category.PLAYER, GameRuleFactory.createIntRule(100, 50, 200));
        PARTICLE_BEACON_ENABLED = GameRuleRegistry.register("rbdParticleBeaconEnabled",
                GameRules.Category.PLAYER, GameRuleFactory.createBooleanRule(true));
        DEATH_COUNTER_ENABLED = GameRuleRegistry.register("rbdDeathCounterEnabled",
                GameRules.Category.PLAYER, GameRuleFactory.createBooleanRule(true));
        MAX_NAMED_SAVE_POINTS = GameRuleRegistry.register("rbdMaxNamedSavePoints",
                GameRules.Category.PLAYER, GameRuleFactory.createIntRule(3, 0, 20));
        ACTION_BAR_COOLDOWN = GameRuleRegistry.register("rbdActionBarCooldown",
                GameRules.Category.PLAYER, GameRuleFactory.createBooleanRule(true));
    }

    public static boolean enabled(MinecraftServer server) {
        return server.getGameRules().getBoolean(ENABLED);
    }

    public static int saveIntervalSeconds(MinecraftServer server) {
        return Math.max(1, server.getGameRules().getInt(SAVE_INTERVAL_SECONDS));
    }

    public static int cooldownSeconds(MinecraftServer server) {
        return server.getGameRules().getInt(COOLDOWN_SECONDS);
    }

    public static boolean broadcastDeath(MinecraftServer server) {
        return server.getGameRules().getBoolean(BROADCAST_DEATH);
    }

    /** Returns -1 for global broadcast, otherwise a positive block radius. */
    public static int broadcastRadius(MinecraftServer server) {
        return server.getGameRules().getInt(BROADCAST_RADIUS);
    }

    public static boolean keepInventoryOnDeath(MinecraftServer server) {
        return server.getGameRules().getBoolean(KEEP_INVENTORY_ON_DEATH);
    }

    /** Sound volume as a float 0.0-1.0. */
    public static float soundVolume(MinecraftServer server) {
        return server.getGameRules().getInt(SOUND_VOLUME) / 100.0f;
    }

    /** Sound pitch as a float 0.5-2.0. */
    public static float soundPitch(MinecraftServer server) {
        return server.getGameRules().getInt(SOUND_PITCH) / 100.0f;
    }

    public static boolean particleBeaconEnabled(MinecraftServer server) {
        return server.getGameRules().getBoolean(PARTICLE_BEACON_ENABLED);
    }

    public static boolean deathCounterEnabled(MinecraftServer server) {
        return server.getGameRules().getBoolean(DEATH_COUNTER_ENABLED);
    }

    public static int maxNamedSavePoints(MinecraftServer server) {
        return Math.max(0, server.getGameRules().getInt(MAX_NAMED_SAVE_POINTS));
    }

    public static boolean actionBarCooldown(MinecraftServer server) {
        return server.getGameRules().getBoolean(ACTION_BAR_COOLDOWN);
    }
}
