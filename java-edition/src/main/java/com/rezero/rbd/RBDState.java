package com.rezero.rbd;

import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtList;
import net.minecraft.nbt.NbtString;
import net.minecraft.registry.RegistryWrapper;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.PersistentState;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * RBDState - persistent server-side state for the Return By Death mod.
 *
 * Stored in the world's data folder (data/rbd_state.dat) and reloaded across
 * server restarts. Tracks per-player:
 *
 *   - Death count ("loops" - a Subaru Natsuki reference)
 *   - Last N deaths (timestamp, dimension, x/y/z, cause) - the "loop log"
 *
 * Named save points are NOT persisted here (they're in-memory in SaveManager)
 * because they should reset on world restart for balance reasons — a permanent
 * named save would defeat the point of the death-rewind mechanic.
 */
public class RBDState extends PersistentState {

    private static final int MAX_LOG_ENTRIES = 10;
    private static final String DATA_NAME = "rbd_state";

    private final Map<UUID, Integer> deathCounts = new HashMap<>();
    private final Map<UUID, List<DeathRecord>> deathLogs = new HashMap<>();

    public RBDState() {
        super();
    }

    /** Convenience constructor for older Loom versions (1.20.1 uses the older API). */
    public static RBDState get(MinecraftServer server) {
        var mgr = server.getOverworld().getPersistentStateManager();
        return mgr.getOrCreate(RBDState::fromNbt, RBDState::new, DATA_NAME);
    }

    /** Increment death count for a player, return new value. */
    public int incrementDeathCount(UUID uuid) {
        int newCount = deathCounts.getOrDefault(uuid, 0) + 1;
        deathCounts.put(uuid, newCount);
        markDirty();
        return newCount;
    }

    public int getDeathCount(UUID uuid) {
        return deathCounts.getOrDefault(uuid, 0);
    }

    public void resetDeathCount(UUID uuid) {
        deathCounts.remove(uuid);
        markDirty();
    }

    /** Add a death to the log. Keeps the most recent MAX_LOG_ENTRIES. */
    public void addDeathLog(UUID uuid, DeathRecord record) {
        List<DeathRecord> log = deathLogs.computeIfAbsent(uuid, k -> new ArrayList<>());
        log.add(0, record); // newest first
        while (log.size() > MAX_LOG_ENTRIES) {
            log.remove(log.size() - 1);
        }
        markDirty();
    }

    public List<DeathRecord> getDeathLog(UUID uuid) {
        return deathLogs.getOrDefault(uuid, new ArrayList<>());
    }

    public void resetDeathLog(UUID uuid) {
        deathLogs.remove(uuid);
        markDirty();
    }

    /** Reset everything for a player. */
    public void resetAll(UUID uuid) {
        deathCounts.remove(uuid);
        deathLogs.remove(uuid);
        markDirty();
    }

    // --- Serialization ---

    public static RBDState fromNbt(NbtCompound tag) {
        RBDState state = new RBDState();
        NbtCompound counts = tag.getCompound("DeathCounts");
        for (String key : counts.getKeys()) {
            try {
                UUID uuid = UUID.fromString(key);
                state.deathCounts.put(uuid, counts.getInt(key));
            } catch (IllegalArgumentException ignored) {}
        }
        NbtCompound logs = tag.getCompound("DeathLogs");
        for (String key : logs.getKeys()) {
            try {
                UUID uuid = UUID.fromString(key);
                NbtList list = logs.getList(key, NbtList.COMPOUND_TYPE);
                List<DeathRecord> log = new ArrayList<>();
                for (int i = 0; i < list.size(); i++) {
                    NbtCompound e = list.getCompound(i);
                    DeathRecord r = new DeathRecord(
                            e.getLong("Time"),
                            e.getString("Dimension"),
                            e.getDouble("X"), e.getDouble("Y"), e.getDouble("Z"),
                            e.getString("Cause")
                    );
                    log.add(r);
                }
                state.deathLogs.put(uuid, log);
            } catch (IllegalArgumentException ignored) {}
        }
        return state;
    }

    @Override
    public NbtCompound writeNbt(NbtCompound tag) {
        NbtCompound counts = new NbtCompound();
        for (var e : deathCounts.entrySet()) {
            counts.putInt(e.getKey().toString(), e.getValue());
        }
        tag.put("DeathCounts", counts);

        NbtCompound logs = new NbtCompound();
        for (var e : deathLogs.entrySet()) {
            NbtList list = new NbtList();
            for (DeathRecord r : e.getValue()) {
                NbtCompound ec = new NbtCompound();
                ec.putLong("Time", r.time);
                ec.putString("Dimension", r.dimension);
                ec.putDouble("X", r.x);
                ec.putDouble("Y", r.y);
                ec.putDouble("Z", r.z);
                ec.putString("Cause", r.cause);
                list.add(ec);
            }
            logs.put(e.getKey().toString(), list);
        }
        tag.put("DeathLogs", logs);

        return tag;
    }

    // --- Inner types ---

    public static class DeathRecord {
        public final long time;          // epoch millis
        public final String dimension;   // e.g. "minecraft:overworld"
        public final double x, y, z;
        public final String cause;       // death message (localized)

        public DeathRecord(long time, String dimension, double x, double y, double z, String cause) {
            this.time = time;
            this.dimension = dimension;
            this.x = x; this.y = y; this.z = z;
            this.cause = cause;
        }
    }
}
