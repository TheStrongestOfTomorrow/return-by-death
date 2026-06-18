package com.rezero.rbd;

import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.inventory.Inventory;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtList;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.registry.RegistryKey;
import net.minecraft.world.World;
import net.minecraft.world.dimension.DimensionType;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * SaveManager - the heart of the "Return By Death" mechanic.
 *
 * Every 5 seconds (configurable via SAVE_INTERVAL_TICKS), the player's state is captured:
 *   - Position (x, y, z, yaw, pitch)
 *   - Dimension (Overworld / Nether / End / modded dimensions)
 *   - Full inventory snapshot (main, armor, offhand)
 *   - Health, hunger, saturation, exhaustion
 *   - XP level, XP progress, total XP
 *   - Active potion effects
 *   - Fire / freeze / air ticks
 *
 * On death, DeathHandler restores the player from this snapshot, effectively "rewinding"
 * them to their last save point with everything they had at that moment.
 */
public final class SaveManager {

    /** Per-player save state. */
    private static final Map<UUID, PlayerSave> SAVES = new HashMap<>();

    /** Last manual save time per player (millis), used for /rbd save. */
    private static final Map<UUID, Long> LAST_MANUAL_SAVE = new HashMap<>();

    private SaveManager() {}

    /** Ensure a player has an entry in the save map (used on join). */
    public static void touch(ServerPlayerEntity player) {
        SAVES.computeIfAbsent(player.getUuid(), k -> {
            capture(player, false);
            return null;
        });
        if (!SAVES.containsKey(player.getUuid())) {
            capture(player, false);
        }
    }

    /** Called every 5 seconds to silently capture the player's state. */
    public static void autoSave(ServerPlayerEntity player) {
        capture(player, false);
    }

    /** Called manually (via /rbd save) to capture state and notify the player. */
    public static void manualSave(ServerPlayerEntity player) {
        capture(player, true);
        LAST_MANUAL_SAVE.put(player.getUuid(), System.currentTimeMillis());
    }

    private static void capture(ServerPlayerEntity player, boolean announce) {
        PlayerSave save = new PlayerSave();
        save.uuid = player.getUuid();
        save.worldKey = player.getWorld().getRegistryKey();
        Vec3d pos = player.getPos();
        save.x = pos.x;
        save.y = pos.y;
        save.z = pos.z;
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

        // Effects (encoded as NBT list)
        NbtCompound effectsNbt = new NbtCompound();
        player.getStatusEffects().forEach(e -> {
            // Let the entity write them; we use a tag built per-effect
        });
        save.effectsNbt = new NbtList();
        for (var effect : player.getActiveStatusEffects().values()) {
            NbtCompound ec = new NbtCompound();
            ec.putInt("Id", net.minecraft.entity.effect.StatusEffect.getRawId(effect.getEffectType()));
            ec.putInt("Amplifier", effect.getAmplifier());
            ec.putInt("Duration", effect.getDuration());
            ec.putBoolean("Ambient", effect.isAmbient());
            ec.putBoolean("ShowParticles", effect.shouldShowParticles());
            ec.putBoolean("ShowIcon", effect.shouldShowIcon());
            save.effectsNbt.add(ec);
        }

        // Ender chest is intentionally NOT saved — Return By Death only rewinds the player.

        SAVES.put(player.getUuid(), save);

        if (announce && ReturnByDeathMod.DEBUG) {
            ReturnByDeathMod.LOGGER.info("[RBD] Manual save for {} at {},{},{} in {}",
                    player.getName().getString(), save.x, save.y, save.z, save.worldKey.getValue());
        }
    }

    /** Returns true if a save point exists for this player. */
    public static boolean hasSave(UUID uuid) {
        return SAVES.containsKey(uuid);
    }

    /** Returns the save point for a player (or null). */
    public static PlayerSave getSave(UUID uuid) {
        return SAVES.get(uuid);
    }

    /**
     * Restore the player's state from their save point.
     * Returns true on success, false if no save exists.
     */
    public static boolean restore(ServerPlayerEntity player) {
        PlayerSave save = SAVES.get(player.getUuid());
        if (save == null) {
            return false;
        }

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
        player.setHealth(save.health);
        player.getHungerManager().setFoodLevel(save.hunger);
        player.getHungerManager().setSaturationLevel(save.saturation);
        player.getHungerManager().setExhaustion(save.exhaustion);
        player.setAir(save.air);
        player.setFireTicks(save.fireTicks);
        player.setFrozenTicks(save.frozenTicks);
        player.clearStatusEffects();
        if (save.effectsNbt != null) {
            for (int i = 0; i < save.effectsNbt.size(); i++) {
                NbtCompound ec = save.effectsNbt.getCompound(i);
                int id = ec.getInt("Id");
                int amp = ec.getInt("Amplifier");
                int dur = ec.getInt("Duration");
                boolean ambient = ec.getBoolean("Ambient");
                boolean particles = ec.getBoolean("ShowParticles");
                boolean icon = ec.getBoolean("ShowIcon");
                var type = net.minecraft.entity.effect.StatusEffect.byRawId(id);
                if (type != null) {
                    player.addStatusEffect(new net.minecraft.entity.effect.StatusEffectInstance(
                            type, dur, amp, ambient, particles, icon));
                }
            }
        }

        // XP
        player.experienceLevel = save.xpLevel;
        player.experienceProgress = save.xpProgress;
        player.totalExperience = save.totalXp;
        player.addExperienceLevels(0); // refresh XP bar

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

        return true;
    }

    private static ItemStack[] copyInventoryItems(net.minecraft.util.collection.DefaultedList<ItemStack> list) {
        ItemStack[] arr = new ItemStack[list.size()];
        for (int i = 0; i < list.size(); i++) {
            arr[i] = list.get(i).copy();
        }
        return arr;
    }

    /** Snapshot of a player's state at a save point. */
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
