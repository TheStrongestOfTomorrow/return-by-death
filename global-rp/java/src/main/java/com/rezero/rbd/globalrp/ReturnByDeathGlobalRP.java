package com.rezero.rbd.globalrp;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Return By Death - Global RP (Client-Side)
 *
 * A tiny client-only Fabric mod. Plays the iconic Return By Death sound whenever the
 * LOCAL player dies. Works on ANY server (vanilla or modded) - no server install required.
 *
 * Inspired by Subaru Natsuki's ability from Re:Zero.
 *
 * Detection strategy:
 *   - We poll the local player's health every client tick.
 *   - When health drops to 0 (or below) and the player wasn't already dead, we trigger.
 *   - This is purely client-side and works on vanilla servers.
 *
 * Extra features:
 *   - Press F8 (default) to test the sound.
 *   - Press F9 (default) to toggle the mod on/off.
 *   - /rbdglobal command to check status, toggle, test, view session death count.
 */
@Environment(EnvType.CLIENT)
public class ReturnByDeathGlobalRP implements ClientModInitializer {

    public static final String MOD_ID = "rbd_globalrp";
    public static final Logger LOGGER = LoggerFactory.getLogger("RBD Global RP");
    public static final Identifier RETURN_BY_DEATH_SOUND = new Identifier(MOD_ID, "return_by_death");

    /** Master toggle. */
    private static boolean enabled = true;

    /** True if the local player was dead on the previous tick (to detect death edge). */
    private static boolean wasDead = false;

    /** Death counter for this session (not persisted - reset on game restart). */
    private static int sessionDeathCount = 0;

    /** Volume multiplier (0.0 - 1.0). */
    private static float volume = 1.0f;

    /** Pitch multiplier (0.5 - 2.0). */
    private static float pitch = 1.0f;

    /** Keybindings. */
    private static KeyBinding toggleKey;
    private static KeyBinding testKey;

    @Override
    public void onInitializeClient() {
        LOGGER.info("[RBD Global RP v1.0.0] Initializing client-side death sound mod.");
        LOGGER.info("[RBD Global RP] Works on ANY server. No server-side install required.");

        // Register keybindings
        toggleKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "rbd_globalrp.key.toggle",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_F9,
                "rbd_globalrp.key.category"
        ));
        testKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "rbd_globalrp.key.test",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_F8,
                "rbd_globalrp.key.category"
        ));

        // Register tick handler - check player health each tick
        ClientTickEvents.END_CLIENT_TICK.register(this::onClientTick);

        // Register commands
        RBDGlobalCommands.register();

        LOGGER.info("[RBD Global RP] Initialized. F8 = test sound, F9 = toggle. /rbdglobal for commands.");
    }

    private void onClientTick(MinecraftClient client) {
        // Handle keybindings
        if (toggleKey != null && toggleKey.wasPressed()) {
            enabled = !enabled;
            if (client.player != null) {
                client.player.sendMessage(Text.literal(
                        "\u00a7d\u00a7l[RBD Global RP] \u00a7r\u00a7a" + (enabled ? "Enabled" : "Disabled")), false);
            }
            LOGGER.info("[RBD Global RP] Toggled: {}", enabled);
        }
        if (testKey != null && testKey.wasPressed()) {
            playSound(client);
            if (client.player != null) {
                client.player.sendMessage(Text.literal(
                        "\u00a7d\u00a7l[RBD Global RP] \u00a7r\u00a7aPlaying Return By Death sound."), false);
            }
        }

        if (!enabled) return;

        PlayerEntity player = client.player;
        if (player == null) {
            wasDead = false;
            return;
        }

        // Check if the player is currently dead (health <= 0)
        boolean isDead = player.getHealth() <= 0.0f;

        // Detect the death EDGE (transition from alive to dead)
        if (isDead && !wasDead) {
            // Player just died! Trigger the sound.
            sessionDeathCount++;
            LOGGER.info("[RBD Global RP] Local player died. Triggering RBD sound (session death #{}).", sessionDeathCount);
            playSound(client);
        }

        wasDead = isDead;
    }

    /** Plays the Return By Death sound to the local player. */
    private static void playSound(MinecraftClient client) {
        if (client.player == null) return;
        try {
            client.player.playSound(RETURN_BY_DEATH_SOUND, SoundCategory.PLAYERS, volume, pitch);
        } catch (Throwable t) {
            LOGGER.warn("[RBD Global RP] Failed to play sound: {}", t.getMessage());
        }
    }

    // === Static accessors used by the commands ===

    public static boolean isEnabled() { return enabled; }
    public static void setEnabled(boolean v) { enabled = v; }
    public static int getSessionDeathCount() { return sessionDeathCount; }
    public static float getVolume() { return volume; }
    public static void setVolume(float v) { volume = Math.max(0.0f, Math.min(1.0f, v)); }
    public static float getPitch() { return pitch; }
    public static void setPitch(float v) { pitch = Math.max(0.5f, Math.min(2.0f, v)); }

    /** Test the sound (called from /rbdglobal test). */
    public static void testSound(MinecraftClient client) {
        playSound(client);
    }
}
