package com.rezero.rbd.globalrp;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.FloatArgumentType;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;

import static net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.literal;
import static net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.argument;

/**
 * Client-side commands for RBD Global RP.
 *
 * Commands:
 *   /rbdglobal              - show status
 *   /rbdglobal on           - enable the mod
 *   /rbdglobal off          - disable the mod
 *   /rbdglobal test         - play the RBD sound
 *   /rbdglobal volume <0-1> - set volume (0.0 to 1.0)
 *   /rbdglobal pitch <0.5-2> - set pitch (0.5 to 2.0)
 *   /rbdglobal count        - show session death count
 *   /rbdglobal help         - show help
 *
 * These are CLIENT commands (registered via ClientCommandRegistrationCallback) - they
 * run on the client only, never sent to the server. Safe to use on any server.
 */
public final class RBDGlobalCommands {

    private RBDGlobalCommands() {}

    public static void register() {
        ClientCommandRegistrationCallback.EVENT.register((CommandDispatcher dispatcher, net.minecraft.command.CommandRegistryAccess registry) -> {
            dispatcher.register(literal("rbdglobal")
                    .executes(ctx -> status(ctx.getSource()))

                    .then(literal("on").executes(ctx -> {
                        ReturnByDeathGlobalRP.setEnabled(true);
                        ctx.getSource().sendFeedback(Text.literal("\u00a7d\u00a7l[RBD Global RP] \u00a7r\u00a7aEnabled."));
                        return 1;
                    }))
                    .then(literal("off").executes(ctx -> {
                        ReturnByDeathGlobalRP.setEnabled(false);
                        ctx.getSource().sendFeedback(Text.literal("\u00a7d\u00a7l[RBD Global RP] \u00a7r\u00a7aDisabled."));
                        return 1;
                    }))
                    .then(literal("test").executes(ctx -> {
                        ReturnByDeathGlobalRP.testSound(MinecraftClient.getInstance());
                        ctx.getSource().sendFeedback(Text.literal("\u00a7d\u00a7l[RBD Global RP] \u00a7r\u00a7aPlaying Return By Death sound."));
                        return 1;
                    }))
                    .then(literal("count").executes(ctx -> {
                        ctx.getSource().sendFeedback(Text.literal(
                                "\u00a7d\u00a7l[RBD Global RP] \u00a7r\u00a7aSession death count: \u00a7e" + ReturnByDeathGlobalRP.getSessionDeathCount()));
                        return 1;
                    }))
                    .then(literal("volume")
                            .then(argument("value", FloatArgumentType.floatArg(0.0f, 1.0f)).executes(ctx -> {
                                float v = FloatArgumentType.getFloat(ctx, "value");
                                ReturnByDeathGlobalRP.setVolume(v);
                                ctx.getSource().sendFeedback(Text.literal(
                                        "\u00a7d\u00a7l[RBD Global RP] \u00a7r\u00a7aVolume set to \u00a7e" + v));
                                return 1;
                            })))
                    .then(literal("pitch")
                            .then(argument("value", FloatArgumentType.floatArg(0.5f, 2.0f)).executes(ctx -> {
                                float v = FloatArgumentType.getFloat(ctx, "value");
                                ReturnByDeathGlobalRP.setPitch(v);
                                ctx.getSource().sendFeedback(Text.literal(
                                        "\u00a7d\u00a7l[RBD Global RP] \u00a7r\u00a7aPitch set to \u00a7e" + v));
                                return 1;
                            })))
                    .then(literal("help").executes(ctx -> help(ctx.getSource())))
            );
        });
    }

    private static int status(net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource source) {
        source.sendFeedback(Text.literal("\u00a7d\u00a7l=== Return By Death Global RP v1.0.0 ==="));
        source.sendFeedback(Text.literal("\u00a7aEnabled: \u00a77" + ReturnByDeathGlobalRP.isEnabled()));
        source.sendFeedback(Text.literal("\u00a7aVolume: \u00a77" + ReturnByDeathGlobalRP.getVolume()));
        source.sendFeedback(Text.literal("\u00a7aPitch: \u00a77" + ReturnByDeathGlobalRP.getPitch()));
        source.sendFeedback(Text.literal("\u00a7aSession deaths: \u00a77" + ReturnByDeathGlobalRP.getSessionDeathCount()));
        source.sendFeedback(Text.literal("\u00a77Client-side only. Works on any server."));
        return 1;
    }

    private static int help(net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource source) {
        source.sendFeedback(Text.literal("\u00a7d\u00a7l=== Return By Death Global RP Help ==="));
        source.sendFeedback(Text.literal("\u00a7a/rbdglobal \u00a77- show status"));
        source.sendFeedback(Text.literal("\u00a7a/rbdglobal on \u00a77- enable the mod"));
        source.sendFeedback(Text.literal("\u00a7a/rbdglobal off \u00a77- disable the mod"));
        source.sendFeedback(Text.literal("\u00a7a/rbdglobal test \u00a77- play the RBD sound"));
        source.sendFeedback(Text.literal("\u00a7a/rbdglobal volume <0-1> \u00a77- set volume (0.0 to 1.0)"));
        source.sendFeedback(Text.literal("\u00a7a/rbdglobal pitch <0.5-2> \u00a77- set pitch (0.5 to 2.0)"));
        source.sendFeedback(Text.literal("\u00a7a/rbdglobal count \u00a77- show session death count"));
        source.sendFeedback(Text.literal("\u00a77Keys: F8 = test sound, F9 = toggle"));
        return 1;
    }
}
