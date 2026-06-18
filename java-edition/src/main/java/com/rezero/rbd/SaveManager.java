package com.rezero.rbd;

import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtList;
import net.minecraft.registry.Registries;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.Vec3d;
import net.minecraft.registry.RegistryKey;
import net.minecraft.world.World;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * SaveManager - the heart of the "Return By Death" mechanic.
 *
 * Every configurable number of seconds (gamerule rbdSaveIntervalSeconds, default 5),
 * the player's state is captured:
 *   - Position (x, y, z, yaw, pitch)
 *   - Dimension (Overworld / Nether / End / modded dimensions)
 *   - Full inventory snapshot (main, armor, offhand)
 *   - Health, hunger, saturation, exhaustion
 *   - XP level, XP progress, total XP
 *   - Active potion effects
 *   - Fire / freeze / air ticks
 *
 * On death, DeathHandler restores the player from this snapshot.
 *
 * v1.1.0 also supports named save points — a player can create up to
 * rbdMaxNamedSavePoints named saves (default 3). The auto-save remains
 * the default return target.
 */
public final class SaveManager {

    /** Per-player auto save state. */
    private static final Map<UUID, PlayerSave> AUTO_SAVES = new HashMap<>();

    /** Per-player named save states: UUID -> (name -> save). */
    private static final Map<UUID, Map<String, PlayerSave>> NAMED_SAVES = new HashMap<>();

    private SaveManager() {}

    /** Ensure a player has an entry in the auto-save map (used on join). */
    public static void touch(ServerPlayerEntity player) {
        if (!AUTO_SAVES.containsKey(player.getUuid())) {
            capture(player, false);
        }
    }

    /** Auto-save called periodically by the tick loop. */
    public static void autoSave(ServerPlayerEntity player) {
        capture(player, false);
    }

    /** Manual save called via /rbd save. */
    public static void manualSave(ServerPlayerEntity player) {
        capture(player, false); // already announces via command
    }

    /** Create a named save point. Returns null on success, or an error message. */
    public static String createNamedSave(ServerPlayerEntity player, String name) {
        if (name == null || name.trim().isEmpty()) return "Name cannot be empty";
        if (name.length() > 32) return "Name too long (max 32 chars)";
        if (name.contains(" ")) return "Name cannot contain spaces";

        Map<String, PlayerSave> map = NAMED_SAVES.computeIfAbsent(player.getUuid(), k -> new LinkedHashMap<>());
        int max = RBDGameRules.maxNamedSavePoints(player.getServer());
        if (!map.containsKey(name) && map.size() >= max) {
            return "Maximum named save points reached (" + max + "). Delete one first.";
        }
        PlayerSave save = captureToSave(player);
        map.put(name, save);
        return null; // success
    }

    /** List a player's named save points. */
    public static Map<String, PlayerSave> getNamedSaves(UUID uuid) {
        return NAMED_SAVES.getOrDefault(uuid, new LinkedHashMap<>());
    }

    /** Delete a named save point. Returns true on success. */
    public static boolean deleteNamedSave(UUID uuid, String name) {
        Map<String, PlayerSave> map = NAMED_SAVES.get(uuid);
        if (map == null) return false;
        boolean removed = map.remove(name) != null;
        return removed;
    }

    /** Restore the player from a named save point. */
    public static boolean restoreNamed(ServerPlayerEntity player, String name) {
        Map<String, PlayerSave> map = NAMED_SAVES.get(player.getUuid());
        if (map == null) return false;
        PlayerSave save = map.get(name);
        if (save == null) return false;
        restoreFromSave(player, save);
        return true;
    }

    /** Clear the player's auto-save, making their next death permanent (permadeath mode). */
    public static boolean resetAutoSave(UUID uuid) {
        return AUTO_SAVES.remove(uuid) != null;
    }

    private static void capture(ServerPlayerEntity player, boolean announce) {
        PlayerSave save = captureToSave(player);
        AUTO_SAVES.put(player.getUuid(), save);

        if (announce && ReturnByDeathMod.DEBUG) {
            ReturnByDeathMod.LOGGER.info("[RBD] Save for {} at {},{},{} in {}",
                    player.getName().getString(), save.x, save.y, save.z, save.worldKey.getValue());
        }
    }

    private static PlayerSave captureToSave(ServerPlayerEntity player) {
        PlayerSave save = new PlayerSave();
        save.uuid = player.getUuid();
        save.worldKey = player.getWorld().getRegistryKey();
        Vec3d pos = player.getPos();
        save.x = pos.x; save.y = pos.y; save.z = pos.z;
        save.yaw = player.getYaw();
        save.pitch = player.getPitch();

        // Snapshot inventory
        PlayerInventory inv = player.getInventory();
        save.mainInventory = copyInventoryItems(inv.main);
        save.armorInventory = copyInventoryItems(inv.armor);
        save.offhandInventory = copyInventoryItems(inv.offHand);

        // Vitals
        save.health = player.getHealth();
        save.maxHealth = player.getMaxHealth();
        save.hunger = player.getHungerManager().getFoodLevel();
        save.saturation = player.getHungerManager().getSaturationLevel();
        save.exhaustion = player.getHungerManager().getExhaustion();
        save.air = player.getAir();
        save.fireTicks = player.getFireTicks();
        save.frozenTicks = player.getFrozenTicks();

        // XP
        save.xpLevel = player.experienceLevel;
        save.xpProgress = player.experienceProgress;
        save.totalXp = player.totalExperience;

        // Effects (serialized as Identifier strings — works on both 1.20 and 1.21)
        save.effectsNbt = new NbtList();
        for (var effect : player.getActiveStatusEffects().values()) {
            NbtCompound ec = new NbtCompound();
            Identifier id = Registries.STATUS_EFFECT.getId(effect.getEffectType());
            ec.putString("Id", id != null ? id.toString() : "minecraft:unluck");
            ec.putInt("Amplifier", effect.getAmplifier());
            ec.putInt("Duration", effect.getDuration());
            ec.putBoolean("Ambient", effect.isAmbient());
            ec.putBoolean("ShowParticles", effect.shouldShowParticles());
            ec.putBoolean("ShowIcon", effect.shouldShowIcon());
            save.effectsNbt.add(ec);
        }

        return save;
    }

    public static boolean hasSave(UUID uuid) {
        return AUTO_SAVES.containsKey(uuid);
    }

    public static PlayerSave getSave(UUID uuid) {
        return AUTO_SAVES.get(uuid);
    }

    public static boolean restore(ServerPlayerEntity player) {
        PlayerSave save = AUTO_SAVES.get(player.getUuid());
        if (save == null) return false;
        restoreFromSave(player, save);
        return true;
    }

    private static void restoreFromSave(ServerPlayerEntity player, PlayerSave save) {
        // Restore inventory
        PlayerInventory inv = player.getInventory();
        inv.main.clear();
        inv.armor.clear();
        inv.offHand.clear();
        for (int i = 0; i < save.mainInventory.length && i < inv.main.size(); i++) {
            inv.main.set(i, save.mainInventory[i].copy());
        }
        for (int i = 0; i < save.armorInventory.length && i < inv.armor.size(); i++) {
            inv.armor.set(i, save.armorInventory[i].copy());
        }
        for (int i = 0; i < save.offhandInventory.length && i < inv.offHand.size(); i++) {
            inv.offHand.set(i, save.offhandInventory[i].copy());
        }
        inv.markDirty();

        // Restore vitals
        // v1.2.3 BUGFIX: Health safety check - if save.health is 0 or negative (race condition
        // during death), fall back to max health to prevent instant re-death.
        float safeHealth = save.health;
        if (safeHealth <= 0) {
            ReturnByDeathMod.LOGGER.warn("[RBD] save.health was {} - falling back to max health {}", safeHealth, save.maxHealth);
            safeHealth = Math.max(1.0f, save.maxHealth);
        }
        // Clamp hunger to at least 6 so the player can sprint/heal
        int safeHunger = Math.max(6, save.hunger);

        player.setHealth(safeHealth);
        player.getHungerManager().setFoodLevel(safeHunger);
        player.getHungerManager().setSaturationLevel(save.saturation);
        player.getHungerManager().setExhaustion(save.exhaustion);
        player.setAir(save.air);
        player.setFireTicks(save.fireTicks);
        player.setFrozenTicks(save.frozenTicks);
        player.clearStatusEffects();
        if (save.effectsNbt != null) {
            for (int i = 0; i < save.effectsNbt.size(); i++) {
                NbtCompound ec = save.effectsNbt.getCompound(i);
                String idStr = ec.getString("Id");
                Identifier id;
                try { id = new Identifier(idStr); }
                catch (Exception ignored) { continue; }
                var type = Registries.STATUS_EFFECT.get(id);
                if (type == null) continue;
                player.addStatusEffect(new net.minecraft.entity.effect.StatusEffectInstance(
                        type,
                        ec.getInt("Duration"),
                        ec.getInt("Amplifier"),
                        ec.getBoolean("Ambient"),
                        ec.getBoolean("ShowParticles"),
                        ec.getBoolean("ShowIcon")
                ));
            }
        }

        // XP
        player.experienceLevel = save.xpLevel;
        player.experienceProgress = save.xpProgress;
        player.totalExperience = save.totalXp;
        player.addExperienceLevels(0);

        // Teleport back to save point
        var server = player.getServer();
        if (server != null) {
            var targetWorld = server.getWorld(save.worldKey);
            if (targetWorld != null && targetWorld != player.getWorld()) {
                player.teleport(targetWorld, save.x, save.y, save.z, save.yaw, save.pitch);
            } else {
                player.refreshPositionAndAngles(save.x, save.y, save.z, save.yaw, save.pitch);
                player.setVelocity(0, 0, 0);
                player.velocityModified = true;
            }
        } else {
            player.refreshPositionAndAngles(save.x, save.y, save.z, save.yaw, save.pitch);
            player.setVelocity(0, 0, 0);
            player.velocityModified = true;
        }
    }

    private static ItemStack[] copyInventoryItems(net.minecraft.util.collection.DefaultedList<ItemStack> list) {
        ItemStack[] arr = new ItemStack[list.size()];
        for (int i = 0; i < list.size(); i++) {
            arr[i] = list.get(i).copy();
        }
        return arr;
    }

    public static class PlayerSave {
        public UUID uuid;
        public RegistryKey<World> worldKey;
        public double x, y, z;
        public float yaw, pitch;
        public ItemStack[] mainInventory;
        public ItemStack[] armorInventory;
        public ItemStack[] offhandInventory;
        public float health;
        public float maxHealth;
        public int hunger;
        public float saturation;
        public float exhaustion;
        public int air;
        public int fireTicks;
        public int frozenTicks;
        public int xpLevel;
        public float xpProgress;
        public int totalXp;
        public NbtList effectsNbt;
    }
}
