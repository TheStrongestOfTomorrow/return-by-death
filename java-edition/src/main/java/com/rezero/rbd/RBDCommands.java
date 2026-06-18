package com.rezero.rbd;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.world.GameRules;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Map;

import static net.minecraft.server.command.CommandManager.argument;
import static net.minecraft.server.command.CommandManager.literal;

/**
 * All Return By Death commands.
 *
 * Available to all players:
 *   /rbd save                       - Manually create a save point right now
 *   /rbd info                       - Show your current save point details
 *   /rbd status                     - Show mod status (gamerules)
 *   /rbd loops                      - Show your death count ("loops")
 *   /rbd looplog                    - Show your last 10 deaths
 *   /rbd reset                      - Clear your save point (next death is permanent)
 *   /rbd named <name>               - Create a named save point (counts toward max)
 *   /rbd named list                 - List your named save points
 *   /rbd named delete <name>        - Delete a named save point
 *   /rbd particles <on|off>         - Toggle save point particles (per-player override)
 *   /rbd help                       - Show help
 *
 * Op-only (require permission level 2):
 *   /rbd interval <seconds>         - Change save interval (1-600)
 *   /rbd cooldown <seconds>         - Change cooldown (0-3600)
 *   /rbd broadcast <on|off>         - Toggle death broadcast
 *   /rbd radius <blocks>            - Change broadcast radius (-1 = global)
 *   /rbd volume <0-100>             - Change sound volume percentage
 *   /rbd pitch <50-200>             - Change sound pitch percentage
 *   /rbd maxnamed <0-20>            - Change max named save points per player
 *   /rbd mod <on|off>               - Master enable/disable
 */
public final class RBDCommands {

    // Per-player particle override (true = enabled, false = disabled, null = use gamerule)
    private static final java.util.Map<java.util.UUID, Boolean> PARTICLE_OVERRIDE = new java.util.HashMap<>();

    private RBDCommands() {}

    public static void register() {
        net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback.EVENT.register(
                (CommandDispatcher<ServerCommandSource> dispatcher, net.minecraft.command.CommandRegistryAccess registry, net.minecraft.server.command.CommandManager.RegistrationEnvironment env) -> {
                    dispatcher.register(literal("rbd")
                            .requires(source -> source.hasPermissionLevel(0))

                            // Player commands
                            .then(literal("save").executes(RBDCommands::save))
                            .then(literal("info").executes(RBDCommands::info))
                            .then(literal("status").executes(RBDCommands::status))
                            .then(literal("loops").executes(RBDCommands::loops))
                            .then(literal("looplog").executes(RBDCommands::looplog))
                            .then(literal("lastdeath").executes(RBDCommands::lastdeath))
                            .then(literal("reset").executes(RBDCommands::reset))
                            .then(literal("revert").executes(RBDCommands::revert))
                            .then(literal("testsound").executes(RBDCommands::testsound))

                            .then(literal("named")
                                    .then(argument("name", StringArgumentType.word()).executes(RBDCommands::namedCreate))
                                    .then(literal("list").executes(RBDCommands::namedList))
                                    .then(literal("delete").then(argument("name", StringArgumentType.word()).executes(RBDCommands::namedDelete))))

                            .then(literal("particles")
                                    .then(literal("on").executes(ctx -> setParticles(ctx.getSource(), true)))
                                    .then(literal("off").executes(ctx -> setParticles(ctx.getSource(), false))))

                            .then(literal("help").executes(RBDCommands::help))

                            // Op-only config commands
                            .then(literal("interval").requires(s -> s.hasPermissionLevel(2))
                                    .then(argument("seconds", IntegerArgumentType.integer(1, 600)).executes(RBDCommands::setInterval)))
                            .then(literal("cooldown").requires(s -> s.hasPermissionLevel(2))
                                    .then(argument("seconds", IntegerArgumentType.integer(0, 3600)).executes(RBDCommands::setCooldown)))
                            .then(literal("broadcast").requires(s -> s.hasPermissionLevel(2))
                                    .then(literal("on").executes(RBDCommands::broadcastOn))
                                    .then(literal("off").executes(RBDCommands::broadcastOff)))
                            .then(literal("radius").requires(s -> s.hasPermissionLevel(2))
                                    .then(argument("blocks", IntegerArgumentType.integer(-1, 100000)).executes(RBDCommands::setRadius)))
                            .then(literal("volume").requires(s -> s.hasPermissionLevel(2))
                                    .then(argument("percent", IntegerArgumentType.integer(0, 100)).executes(RBDCommands::setVolume)))
                            .then(literal("pitch").requires(s -> s.hasPermissionLevel(2))
                                    .then(argument("percent", IntegerArgumentType.integer(50, 200)).executes(RBDCommands::setPitch)))
                            .then(literal("maxnamed").requires(s -> s.hasPermissionLevel(2))
                                    .then(argument("count", IntegerArgumentType.integer(0, 20)).executes(RBDCommands::setMaxNamed)))
                            .then(literal("mod").requires(s -> s.hasPermissionLevel(2))
                                    .then(literal("on").executes(RBDCommands::modOn))
                                    .then(literal("off").executes(RBDCommands::modOff)))
                    );
                });
    }

    // ===================== Player commands =====================

    private static int save(CommandContext<ServerCommandSource> ctx) {
        ServerPlayerEntity player = ctx.getSource().getPlayer();
        if (player == null) { ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cOnly players can use this command."), false); return 0; }
        SaveManager.manualSave(player);
        var s = SaveManager.getSave(player.getUuid());
        if (s != null) {
            ctx.getSource().sendFeedback(() -> Text.literal(
                    String.format("\u00a7d\u00a7l[Return By Death] \u00a7r\u00a7aSave point set at \u00a77%.1f, %.1f, %.1f \u00a7ain \u00a7b%s\u00a7a.",
                            s.x, s.y, s.z, s.worldKey.getValue())), false);
        }
        return 1;
    }

    private static int info(CommandContext<ServerCommandSource> ctx) {
        ServerPlayerEntity player = ctx.getSource().getPlayer();
        if (player == null) { ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cOnly players can use this command."), false); return 0; }
        var s = SaveManager.getSave(player.getUuid());
        if (s == null) {
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cNo save point exists yet."), false);
        } else {
            ctx.getSource().sendFeedback(() -> Text.literal(
                    String.format("\u00a7d[RBD] \u00a7aSave point: \u00a77%.1f, %.1f, %.1f \u00a7ain \u00a7b%s",
                            s.x, s.y, s.z, s.worldKey.getValue())), false);
            ctx.getSource().sendFeedback(() -> Text.literal(
                    String.format("\u00a7a  HP: \u00a7c%.1f\u00a7a / %.1f   \u00a7aHunger: \u00a76%d\u00a7a   XP Lvl: \u00a7e%d",
                            s.health, s.maxHealth, s.hunger, s.xpLevel)), false);
            int named = SaveManager.getNamedSaves(player.getUuid()).size();
            int max = RBDGameRules.maxNamedSavePoints(player.getServer());
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a  Named save points: \u00a77" + named + " / " + max), false);
        }
        return 1;
    }

    private static int status(CommandContext<ServerCommandSource> ctx) {
        var server = ctx.getSource().getServer();
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d\u00a7l=== Return By Death v1.2.2 Status ==="), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aEnabled: \u00a77" + RBDGameRules.enabled(server)), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aSave interval (sec): \u00a77" + RBDGameRules.saveIntervalSeconds(server)), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aCooldown (sec): \u00a77" + RBDGameRules.cooldownSeconds(server)), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aBroadcast deaths: \u00a77" + RBDGameRules.broadcastDeath(server)), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aBroadcast radius: \u00a77" + RBDGameRules.broadcastRadius(server) + " (-1 = global)"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aKeep items on death: \u00a77" + RBDGameRules.keepInventoryOnDeath(server)), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aSound volume: \u00a77" + (int)(RBDGameRules.soundVolume(server) * 100) + "%"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aSound pitch: \u00a77" + (int)(RBDGameRules.soundPitch(server) * 100) + "%"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aParticle beacon: \u00a77" + RBDGameRules.particleBeaconEnabled(server)), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aDeath counter: \u00a77" + RBDGameRules.deathCounterEnabled(server)), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aMax named save points: \u00a77" + RBDGameRules.maxNamedSavePoints(server)), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aAction bar cooldown: \u00a77" + RBDGameRules.actionBarCooldown(server)), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7aInstant Respawn: \u00a77" + server.getGameRules().getBoolean(GameRules.DO_IMMEDIATE_RESPAWN)), false);
        return 1;
    }

    private static int loops(CommandContext<ServerCommandSource> ctx) {
        ServerPlayerEntity player = ctx.getSource().getPlayer();
        if (player == null) { ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cOnly players can use this command."), false); return 0; }
        var server = ctx.getSource().getServer();
        if (!RBDGameRules.deathCounterEnabled(server)) {
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cDeath counter is disabled (rbdDeathCounterEnabled = false)."), false);
            return 0;
        }
        int count = RBDState.get(server).getDeathCount(player.getUuid());
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aYou have died \u00a7e" + count + "\u00a7a time(s). Loop count: \u00a7e" + count), false);
        return 1;
    }

    private static int looplog(CommandContext<ServerCommandSource> ctx) {
        ServerPlayerEntity player = ctx.getSource().getPlayer();
        if (player == null) { ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cOnly players can use this command."), false); return 0; }
        var server = ctx.getSource().getServer();
        List<RBDState.DeathRecord> log = RBDState.get(server).getDeathLog(player.getUuid());
        if (log.isEmpty()) {
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a77No deaths recorded yet."), false);
        } else {
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d\u00a7l[RBD] Last " + log.size() + " death(s):"), false);
            SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            int i = 1;
            for (RBDState.DeathRecord r : log) {
                final int idx = i++;
                final String time = fmt.format(new Date(r.time));
                final String dim = r.dimension.replace("minecraft:", "");
                ctx.getSource().sendFeedback(() -> Text.literal(
                        String.format("\u00a7e#%d \u00a77%s \u00a7ain \u00a7b%s \u00a77@ \u00a77%.0f, %.0f, %.0f \u00a77cause: \u00a7c%s",
                                idx, time, dim, r.x, r.y, r.z, r.cause)), false);
            }
        }
        return 1;
    }

    private static int reset(CommandContext<ServerCommandSource> ctx) {
        ServerPlayerEntity player = ctx.getSource().getPlayer();
        if (player == null) { ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cOnly players can use this command."), false); return 0; }
        boolean ok = SaveManager.resetAutoSave(player.getUuid());
        if (ok) {
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7cYour save point has been cleared. Your next death will be permanent."), false);
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a77  A new save point will be created within " + RBDGameRules.saveIntervalSeconds(ctx.getSource().getServer()) + " seconds."), false);
        } else {
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7cYou had no save point to clear."), false);
        }
        return 1;
    }

    private static int revert(CommandContext<ServerCommandSource> ctx) {
        ServerPlayerEntity player = ctx.getSource().getPlayer();
        if (player == null) { ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cOnly players can use this command."), false); return 0; }
        // Use DeathHandler.revert for shared cooldown logic
        String err = DeathHandler.revert(player);
        if (err != null) {
            final String e = err;
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7c" + e), false);
        } else {
            var s = SaveManager.getSave(player.getUuid());
            if (s != null) {
                ctx.getSource().sendFeedback(() -> Text.literal(
                        String.format("\u00a7d[RBD] \u00a7aReverted to save point at \u00a77%.1f, %.1f, %.1f\u00a7a in \u00a7b%s\u00a7a.",
                                s.x, s.y, s.z, s.worldKey.getValue())), false);
            }
        }
        return 1;
    }

    private static int lastdeath(CommandContext<ServerCommandSource> ctx) {
        ServerPlayerEntity player = ctx.getSource().getPlayer();
        if (player == null) { ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cOnly players can use this command."), false); return 0; }
        var server = ctx.getSource().getServer();
        List<RBDState.DeathRecord> log = RBDState.get(server).getDeathLog(player.getUuid());
        if (log.isEmpty()) {
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a77You have no recorded deaths."), false);
        } else {
            RBDState.DeathRecord r = log.get(0);
            SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            final String time = fmt.format(new Date(r.time));
            final String dim = r.dimension.replace("minecraft:", "");
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d\u00a7l[RBD] Last death:"), false);
            ctx.getSource().sendFeedback(() -> Text.literal(
                    String.format("\u00a7a  Time: \u00a77%s", time)), false);
            ctx.getSource().sendFeedback(() -> Text.literal(
                    String.format("\u00a7a  Location: \u00a77%.1f, %.1f, %.1f \u00a7ain \u00a7b%s", r.x, r.y, r.z, dim)), false);
            ctx.getSource().sendFeedback(() -> Text.literal(
                    String.format("\u00a7a  Cause: \u00a7c%s", r.cause)), false);
            long agoSec = (System.currentTimeMillis() - r.time) / 1000;
            ctx.getSource().sendFeedback(() -> Text.literal(
                    String.format("\u00a77  (%d second(s) ago)", agoSec)), false);
        }
        return 1;
    }

    private static int testsound(CommandContext<ServerCommandSource> ctx) {
        ServerPlayerEntity player = ctx.getSource().getPlayer();
        if (player == null) { ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cOnly players can use this command."), false); return 0; }
        var server = ctx.getSource().getServer();
        float vol = RBDGameRules.soundVolume(server);
        float pitch = RBDGameRules.soundPitch(server);
        player.playSound(ReturnByDeathMod.RETURN_BY_DEATH_SOUND, net.minecraft.sound.SoundCategory.PLAYERS, vol, pitch);
        ctx.getSource().sendFeedback(() -> Text.literal(
                String.format("\u00a7d[RBD] \u00a7aPlaying Return By Death sound (vol=%d%%, pitch=%d%%). If you don't hear it, see the README troubleshooting section.",
                        (int)(vol * 100), (int)(pitch * 100))), false);
        return 1;
    }

    private static int namedCreate(CommandContext<ServerCommandSource> ctx) {
        ServerPlayerEntity player = ctx.getSource().getPlayer();
        if (player == null) { ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cOnly players can use this command."), false); return 0; }
        String name = StringArgumentType.getString(ctx, "name");
        String err = SaveManager.createNamedSave(player, name);
        if (err != null) {
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7c" + err), false);
        } else {
            var s = SaveManager.getSave(player.getUuid()); // current auto save for ref
            ctx.getSource().sendFeedback(() -> Text.literal(
                    "\u00a7d[RBD] \u00a7aNamed save point '\u00a7e" + name + "\u00a7a' created at your current location."), false);
        }
        return 1;
    }

    private static int namedList(CommandContext<ServerCommandSource> ctx) {
        ServerPlayerEntity player = ctx.getSource().getPlayer();
        if (player == null) { ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cOnly players can use this command."), false); return 0; }
        Map<String, SaveManager.PlayerSave> named = SaveManager.getNamedSaves(player.getUuid());
        if (named.isEmpty()) {
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a77You have no named save points."), false);
        } else {
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d\u00a7l[RBD] Named save points:"), false);
            for (var e : named.entrySet()) {
                String n = e.getKey();
                var s = e.getValue();
                ctx.getSource().sendFeedback(() -> Text.literal(
                        String.format("\u00a7a  %s \u00a77@ %.0f, %.0f, %.0f in %s",
                                n, s.x, s.y, s.z, s.worldKey.getValue())), false);
            }
        }
        return 1;
    }

    private static int namedDelete(CommandContext<ServerCommandSource> ctx) {
        ServerPlayerEntity player = ctx.getSource().getPlayer();
        if (player == null) { ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cOnly players can use this command."), false); return 0; }
        String name = StringArgumentType.getString(ctx, "name");
        boolean ok = SaveManager.deleteNamedSave(player.getUuid(), name);
        if (ok) {
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aDeleted named save point '\u00a7e" + name + "\u00a7a'."), false);
        } else {
            ctx.getSource().sendFeedback(() -> Text.literal("\u00a7cNo named save point called '" + name + "'."), false);
        }
        return 1;
    }

    private static int setParticles(ServerCommandSource source, boolean enabled) {
        ServerPlayerEntity player = source.getPlayer();
        if (player == null) { source.sendFeedback(() -> Text.literal("\u00a7cOnly players can use this command."), false); return 0; }
        PARTICLE_OVERRIDE.put(player.getUuid(), enabled);
        source.sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aSave point particles: \u00a77" + (enabled ? "ON" : "OFF")), false);
        return 1;
    }

    private static int help(CommandContext<ServerCommandSource> ctx) {
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d\u00a7l=== Return By Death v1.2.2 Help ==="), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a76Player commands:"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd save \u00a77- Manually create a save point now"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd info \u00a77- Show your current save point details"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd status \u00a77- Show all mod settings"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd loops \u00a77- Show your death count"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd looplog \u00a77- Show your last 10 deaths"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd lastdeath \u00a77- Show details of your most recent death"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd revert \u00a77- Instantly teleport to your save point (no death)"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd testsound \u00a77- Play the Return By Death sound to verify it works"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd reset \u00a77- Clear your save point (permadeath mode)"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd named <name> \u00a77- Create a named save point"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd named list \u00a77- List your named save points"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd named delete <name> \u00a77- Delete a named save point"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd particles <on|off> \u00a77- Toggle save point particles"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a76Op commands (permission level 2):"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd interval <seconds> \u00a77- Change save interval (1-600)"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd cooldown <seconds> \u00a77- Change cooldown (0-3600)"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd broadcast <on|off> \u00a77- Toggle death broadcast"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd radius <blocks> \u00a77- Change broadcast radius (-1 = global)"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd volume <0-100> \u00a77- Change sound volume %"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd pitch <50-200> \u00a77- Change sound pitch %"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd maxnamed <0-20> \u00a77- Change max named save points per player"), false);
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7a/rbd mod <on|off> \u00a77- Master enable/disable"), false);
        return 1;
    }

    // ===================== Op commands =====================

    private static int setInterval(CommandContext<ServerCommandSource> ctx) {
        int sec = IntegerArgumentType.getInteger(ctx, "seconds");
        ctx.getSource().getServer().getGameRules().get(RBDGameRules.SAVE_INTERVAL_SECONDS).set(sec, ctx.getSource().getServer());
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aSave interval set to \u00a7e" + sec + " seconds\u00a7a."), true);
        return 1;
    }

    private static int setCooldown(CommandContext<ServerCommandSource> ctx) {
        int sec = IntegerArgumentType.getInteger(ctx, "seconds");
        ctx.getSource().getServer().getGameRules().get(RBDGameRules.COOLDOWN_SECONDS).set(sec, ctx.getSource().getServer());
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aCooldown set to \u00a7e" + sec + " seconds\u00a7a."), true);
        return 1;
    }

    private static int broadcastOn(CommandContext<ServerCommandSource> ctx) {
        ctx.getSource().getServer().getGameRules().get(RBDGameRules.BROADCAST_DEATH).set(true, ctx.getSource().getServer());
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aDeath broadcast: \u00a7eON"), true);
        return 1;
    }

    private static int broadcastOff(CommandContext<ServerCommandSource> ctx) {
        ctx.getSource().getServer().getGameRules().get(RBDGameRules.BROADCAST_DEATH).set(false, ctx.getSource().getServer());
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aDeath broadcast: \u00a7eOFF"), true);
        return 1;
    }

    private static int setRadius(CommandContext<ServerCommandSource> ctx) {
        int r = IntegerArgumentType.getInteger(ctx, "blocks");
        ctx.getSource().getServer().getGameRules().get(RBDGameRules.BROADCAST_RADIUS).set(r, ctx.getSource().getServer());
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aBroadcast radius set to \u00a7e" + r + "\u00a7a blocks (-1 = global)."), true);
        return 1;
    }

    private static int setVolume(CommandContext<ServerCommandSource> ctx) {
        int v = IntegerArgumentType.getInteger(ctx, "percent");
        ctx.getSource().getServer().getGameRules().get(RBDGameRules.SOUND_VOLUME).set(v, ctx.getSource().getServer());
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aSound volume set to \u00a7e" + v + "%\u00a7a."), true);
        return 1;
    }

    private static int setPitch(CommandContext<ServerCommandSource> ctx) {
        int p = IntegerArgumentType.getInteger(ctx, "percent");
        ctx.getSource().getServer().getGameRules().get(RBDGameRules.SOUND_PITCH).set(p, ctx.getSource().getServer());
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aSound pitch set to \u00a7e" + p + "%\u00a7a."), true);
        return 1;
    }

    private static int setMaxNamed(CommandContext<ServerCommandSource> ctx) {
        int n = IntegerArgumentType.getInteger(ctx, "count");
        ctx.getSource().getServer().getGameRules().get(RBDGameRules.MAX_NAMED_SAVE_POINTS).set(n, ctx.getSource().getServer());
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aMax named save points per player set to \u00a7e" + n + "\u00a7a."), true);
        return 1;
    }

    private static int modOn(CommandContext<ServerCommandSource> ctx) {
        ctx.getSource().getServer().getGameRules().get(RBDGameRules.ENABLED).set(true, ctx.getSource().getServer());
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aMod: \u00a7eENABLED"), true);
        return 1;
    }

    private static int modOff(CommandContext<ServerCommandSource> ctx) {
        ctx.getSource().getServer().getGameRules().get(RBDGameRules.ENABLED).set(false, ctx.getSource().getServer());
        ctx.getSource().sendFeedback(() -> Text.literal("\u00a7d[RBD] \u00a7aMod: \u00a7eDISABLED"), true);
        return 1;
    }
}
