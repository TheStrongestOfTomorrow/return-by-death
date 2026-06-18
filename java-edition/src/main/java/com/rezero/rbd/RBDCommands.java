package com.rezero.rbd;

import com.mojang.brigadier.CommandDispatcher;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;

import static net.minecraft.server.command.CommandManager.literal;

/**
 * /rbd commands:
 *   /rbd save     — manually create a save point right now
 *   /rbd info     — show info about your current save point
 *   /rbd status   — show mod status (enabled, cooldown, etc.)
 *   /rbd help     — show help
 */
public final class RBDCommands {

    private RBDCommands() {}

    public static void register() {
        // Hook into command registration via Fabric API event
        net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback.EVENT.register(
                (CommandDispatcher<ServerCommandSource> dispatcher, net.minecraft.command.CommandRegistryAccess registry, net.minecraft.server.command.CommandManager.RegistrationEnvironment env) -> {
                    dispatcher.register(literal("rbd")
                            .requires(source -> source.hasPermissionLevel(0))
                            .then(literal("save").executes(ctx -> save(ctx.getSource())))
                            .then(literal("info").executes(ctx -> info(ctx.getSource())))
                            .then(literal("status").executes(ctx -> status(ctx.getSource())))
                            .then(literal("help").executes(ctx -> help(ctx.getSource())))
                    );
                });
    }

    private static int save(ServerCommandSource source) {
        ServerPlayerEntity player = source.getPlayer();
        if (player == null) {
            source.sendFeedback(() -> Text.literal("§cOnly players can use this command."), false);
            return 0;
        }
        SaveManager.manualSave(player);
        var s = SaveManager.getSave(player.getUuid());
        if (s != null) {
            source.sendFeedback(() -> Text.literal(
                    String.format("§d§l[Return By Death] §r§aSave point set at §7%.1f, %.1f, %.1f §ain §b%s§a.",
                            s.x, s.y, s.z, s.worldKey.getValue())), false);
        }
        return 1;
    }

    private static int info(ServerCommandSource source) {
        ServerPlayerEntity player = source.getPlayer();
        if (player == null) {
            source.sendFeedback(() -> Text.literal("§cOnly players can use this command."), false);
            return 0;
        }
        var s = SaveManager.getSave(player.getUuid());
        if (s == null) {
            source.sendFeedback(() -> Text.literal("§cNo save point exists yet. One will be created automatically within 5 seconds."), false);
        } else {
            source.sendFeedback(() -> Text.literal(
                    String.format("§d[RBD] §aSave point: §7%.1f, %.1f, %.1f §ain §b%s",
                            s.x, s.y, s.z, s.worldKey.getValue())), false);
            source.sendFeedback(() -> Text.literal(
                    String.format("§a  HP: §c%.1f§a / %.1f   §aHunger: §6%d§a   XP Lvl: §e%d",
                            s.health, s.maxHealth, s.hunger, s.xpLevel)), false);
        }
        return 1;
    }

    private static int status(ServerCommandSource source) {
        var server = source.getServer();
        source.sendFeedback(() -> Text.literal("§d§l=== Return By Death Status ==="), false);
        source.sendFeedback(() -> Text.literal("§aEnabled: §7" + RBDGameRules.enabled(server)), false);
        source.sendFeedback(() -> Text.literal("§aCooldown (seconds): §7" + RBDGameRules.cooldownSeconds(server)), false);
        source.sendFeedback(() -> Text.literal("§aBroadcast deaths: §7" + RBDGameRules.broadcastDeath(server)), false);
        source.sendFeedback(() -> Text.literal("§aKeep items on death: §7" + RBDGameRules.keepInventoryOnDeath(server)), false);
        source.sendFeedback(() -> Text.literal("§aSave interval: §75 seconds (100 ticks)"), false);
        source.sendFeedback(() -> Text.literal("§aInstant Respawn: §7" + server.getGameRules().getBoolean(net.minecraft.world.GameRules.DO_IMMEDIATE_RESPAWN)), false);
        return 1;
    }

    private static int help(ServerCommandSource source) {
        source.sendFeedback(() -> Text.literal("§d§l=== Return By Death Help ==="), false);
        source.sendFeedback(() -> Text.literal("§a/rbd save §7— Manually create a save point at your current location"), false);
        source.sendFeedback(() -> Text.literal("§a/rbd info §7— Show your current save point details"), false);
        source.sendFeedback(() -> Text.literal("§a/rbd status §7— Show mod status and gamerules"), false);
        source.sendFeedback(() -> Text.literal("§a/rbd help §7— Show this help"), false);
        source.sendFeedback(() -> Text.literal("§7A save point is automatically created every 5 seconds."), false);
        source.sendFeedback(() -> Text.literal("§7When you die, you rewind to your last save point with the inventory you had then."), false);
        return 1;
    }
}
