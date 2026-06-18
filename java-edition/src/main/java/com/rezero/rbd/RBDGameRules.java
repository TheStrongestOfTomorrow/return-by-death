package com.rezero.rbd;

import net.fabricmc.fabric.api.gamerule.v1.CustomGameRuleCategory;
import net.fabricmc.fabric.api.gamerule.v1.GameRuleFactory;
import net.fabricmc.fabric.api.gamerule.v1.GameRuleRegistry;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.GameRules;

/**
 * Central registry for all Return By Death gamerules.
 *
 * Registered rules:
 *   rbdEnabled               (bool,  default true)   — master toggle for the mod
 *   rbdCooldownSeconds       (int,   default 0)      — cooldown before the next Return By Death can trigger
 *   rbdBroadcastDeath        (bool,  default false)  — broadcast a message when a player Returns By Death
 *   rbdKeepInventoryOnDeath  (bool,  default true)   — keep items in inventory even though vanilla keepInventory is off
 */
public final class RBDGameRules {

    public static GameRules.Key<GameRules.BooleanRule> ENABLED;
    public static GameRules.Key<GameRules.IntRule> COOLDOWN_SECONDS;
    public static GameRules.Key<GameRules.BooleanRule> BROADCAST_DEATH;
    public static GameRules.Key<GameRules.BooleanRule> KEEP_INVENTORY_ON_DEATH;

    private RBDGameRules() {}

    public static void register() {
        ENABLED = GameRuleRegistry.register("rbdEnabled",
                GameRules.Category.PLAYER, GameRuleFactory.createBooleanRule(true));
        COOLDOWN_SECONDS = GameRuleRegistry.register("rbdCooldownSeconds",
                GameRules.Category.PLAYER, GameRuleFactory.createIntRule(0, 0, 3600));
        BROADCAST_DEATH = GameRuleRegistry.register("rbdBroadcastDeath",
                GameRules.Category.PLAYER, GameRuleFactory.createBooleanRule(false));
        KEEP_INVENTORY_ON_DEATH = GameRuleRegistry.register("rbdKeepInventoryOnDeath",
                GameRules.Category.PLAYER, GameRuleFactory.createBooleanRule(true));
    }

    public static boolean enabled(MinecraftServer server) {
        return server.getGameRules().getBoolean(ENABLED);
    }

    public static int cooldownSeconds(MinecraftServer server) {
        return server.getGameRules().getInt(COOLDOWN_SECONDS);
    }

    public static boolean broadcastDeath(MinecraftServer server) {
        return server.getGameRules().getBoolean(BROADCAST_DEATH);
    }

    public static boolean keepInventoryOnDeath(MinecraftServer server) {
        return server.getGameRules().getBoolean(KEEP_INVENTORY_ON_DEATH);
    }
}
