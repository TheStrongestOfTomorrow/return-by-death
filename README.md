# Return By Death — A Minecraft Mod

> *"From zero. From zero. From zero. I'll restart from zero as many times as it takes."*
> — Natsuki Subaru, Re:Zero − Starting Life in Another World

A Minecraft mod inspired by **Subaru Natsuki's "Return By Death"** ability from *Re:Zero − Starting Life in Another World*. When you die, you rewind to your last save point — with the inventory, position, and vitals you had at that moment — and the iconic Return By Death sound plays to everyone on the server.

**Available for both Minecraft Java Edition (Fabric) and Minecraft Bedrock Edition (incl. Pocket Edition).**

**Current version: v1.1.0** — see [What's New](#whats-new-in-v110) below.

---

## What's New in v1.1.0

A major feature update on top of the v1.0.0 release. **v1.0.0 is still available** at [the v1.0.0 release](https://github.com/TheStrongestOfTomorrow/return-by-death/releases/tag/v1.0.0) — we never overwrite old releases.

### New features

| Feature | Description |
|---------|-------------|
| **Configurable save interval** | Change the auto-save interval from 5s to anything 1–600s. `/rbd interval <sec>` (Java) or `!rbd interval <sec>` (Bedrock). |
| **Death counter ("loops")** | Tracks how many times you've died — a Subaru Natsuki reference. Persists across server restarts. `/rbd loops` to view. |
| **Death log** | Records the last 10 deaths with timestamp, dimension, coordinates, and cause. `/rbd looplog` to view. |
| **Save point particle beacon** | Purple witch-themed particles appear at your save point location so you always know where you'll respawn. Toggle per-player or globally. |
| **Named save points** | Create up to 3 (configurable) named save points in addition to the auto-save. `/rbd named <name>`, `/rbd named list`, `/rbd named delete <name>`. |
| **Configurable sound** | Adjust the Return By Death sound volume (0–100%) and pitch (50–200%). `/rbd volume`, `/rbd pitch`. |
| **Configurable broadcast radius** | Limit the sound + broadcast message to a radius around the death location (-1 = whole server). `/rbd radius <blocks>`. |
| **Action bar cooldown** | Remaining cooldown is shown in your action bar (top of screen) so you know exactly when you can rewind again. |
| **Save point reset** | Clear your save point — your next death becomes permanent. `/rbd reset`. Useful for hardcore runs or self-imposed challenges. |
| **Per-player particle toggle** | Each player can opt out of save point particles without affecting others. `/rbd particles <on\|off>`. |

---

## What It Does

- **Auto-save every N seconds.** The mod silently captures your complete state — position, dimension, full inventory, armor, health, hunger, XP level, and (Java) active potion effects — every interval (default 5 seconds).
- **Death triggers a rewind.** When you die, instead of going to the death screen and respawning at world spawn, you are teleported back to your last save point with the inventory and stats you had at the moment of save.
- **Iconic sound cue.** The provided `re-zero-return-by-death.mp3` (converted to OGG/Vorbis) plays to **every player on the server** (or within a configurable radius) when someone dies.
- **Requires Instant Respawn.** The mod auto-enables `doImmediateRespawn` (Java) and reminds you to enable it (Bedrock) so there's no death-screen delay between dying and rewinding.
- **Dropped items are cleaned up.** In Bedrock, items drop on death; the mod despawns them within an 8-block radius of the death location so your saved inventory isn't duplicated.

---

## Installation

### Java Edition (Fabric)

**Requirements:**
- Minecraft Java 1.20.1 (see [Version Compatibility](#version-compatibility) for the latest info)
- [Fabric Loader](https://fabricmc.net/use/) 0.15.0+
- [Fabric API](https://modrinth.com/mod/fabric-api) 0.92.2+1.20.1

**Steps:**
1. Install Fabric Loader for Minecraft 1.20.1.
2. Drop the **Fabric API** jar into your `mods/` folder.
3. Build the mod from source (see [Building from Source](#building-from-source)) or download a pre-built `.jar` from the [Releases](../../releases) page.
4. Drop `return-by-death-1.1.0.jar` into your `mods/` folder.
5. Launch the game. The mod will auto-enable `doImmediateRespawn`.
6. Join a world — you'll see the welcome message in chat.

### Bedrock Edition (incl. Pocket Edition)

**Requirements:**
- Minecraft Bedrock 1.21.0+ (tested through 1.26.x)
- "Beta APIs" experimental toggle may need to be ON depending on your version
- "Immediate Respawn" toggle must be ON in world settings

**Steps:**
1. Download `behavior_pack_RBD.mcpack` and `resource_pack_RBD.mcpack` from the [v1.1.0 Release](../../releases/tag/v1.1.0).
2. Double-click the `.mcpack` files (or import them via Settings → Storage → Import).
3. Open your world settings → **Behavior Packs** → activate "Return By Death - Behavior Pack".
4. Open **Resource Packs** → activate "Return By Death - Resource Pack".
5. In world settings, enable **Immediate Respawn** (Game → toggle "Immediate Respawn").
6. Join the world — you'll see the welcome message in chat.

> **Pocket Edition note:** The exact same `.mcpack` files work on Android/iOS. Just transfer them to your device and open with Minecraft.

---

## Commands & Configuration

### Java Edition

**Player commands** (no permission required):

| Command                          | Description                              |
|----------------------------------|------------------------------------------|
| `/rbd save`                      | Manually create a save point right now   |
| `/rbd info`                      | Show your current save point + named count |
| `/rbd status`                    | Show all mod settings                    |
| `/rbd loops`                     | Show your death count                    |
| `/rbd looplog`                   | Show your last 10 deaths                 |
| `/rbd reset`                     | Clear your save point (permadeath mode)  |
| `/rbd named <name>`              | Create a named save point                |
| `/rbd named list`                | List your named save points              |
| `/rbd named delete <name>`       | Delete a named save point                |
| `/rbd particles <on\|off>`        | Toggle save point particles (per-player) |
| `/rbd help`                      | Show help                                |

**Op commands** (permission level 2):

| Command                          | Description                              |
|----------------------------------|------------------------------------------|
| `/rbd interval <1-600>`          | Change save interval in seconds          |
| `/rbd cooldown <0-3600>`         | Change cooldown before next rewind       |
| `/rbd broadcast <on\|off>`        | Toggle death broadcast                   |
| `/rbd radius <-1 to 100000>`      | Change broadcast radius (-1 = global)    |
| `/rbd volume <0-100>`            | Change sound volume %                    |
| `/rbd pitch <50-200>`            | Change sound pitch %                     |
| `/rbd maxnamed <0-20>`           | Change max named save points per player  |
| `/rbd mod <on\|off>`              | Master enable/disable                    |

**Gamerules** (settable via `/gamerule`):

| Gamerule                     | Type    | Default | Description                                          |
|------------------------------|---------|---------|------------------------------------------------------|
| `rbdEnabled`                 | bool    | `true`  | Master toggle for the mod                            |
| `rbdSaveIntervalSeconds`     | int     | `5`     | Seconds between auto-saves                           |
| `rbdCooldownSeconds`         | int     | `0`     | Cooldown (seconds) before next rewind can trigger    |
| `rbdBroadcastDeath`          | bool    | `false` | Broadcast a server-wide message on rewind            |
| `rbdBroadcastRadius`         | int     | `-1`    | Broadcast radius in blocks (-1 = global)             |
| `rbdKeepInventoryOnDeath`    | bool    | `true`  | Keep items in inventory even though keepInventory is off |
| `rbdSoundVolume`             | int     | `100`   | Sound volume percent (0–100)                         |
| `rbdSoundPitch`              | int     | `100`   | Sound pitch percent (50–200)                         |
| `rbdParticleBeaconEnabled`   | bool    | `true`  | Show particles at save point                         |
| `rbdDeathCounterEnabled`     | bool    | `true`  | Track each player's death count                      |
| `rbdMaxNamedSavePoints`      | int     | `3`     | Max named save points per player                     |
| `rbdActionBarCooldown`       | bool    | `true`  | Show remaining cooldown as action bar text           |

### Bedrock Edition

**Player chat commands:**

| Command                          | Description                              |
|----------------------------------|------------------------------------------|
| `!rbd save`                      | Manually create a save point right now   |
| `!rbd info`                      | Show your save point details             |
| `!rbd status`                    | Show all mod settings                    |
| `!rbd loops`                     | Show your death count                    |
| `!rbd looplog`                   | Show your last 10 deaths                 |
| `!rbd reset`                     | Clear your save point (permadeath mode)  |
| `!rbd named <name>`              | Create a named save point                |
| `!rbd named list`                | List named save points                   |
| `!rbd named delete <name>`       | Delete a named save point                |
| `!rbd particles <on\|off>`        | Toggle save point particles              |
| `!rbd help`                      | Show help                                |

**Op chat commands** (requires operator status):

| Command                          | Description                              |
|----------------------------------|------------------------------------------|
| `!rbd interval <1-600>`          | Change save interval in seconds          |
| `!rbd cooldown <0-3600>`         | Change cooldown                          |
| `!rbd broadcast <on\|off>`        | Toggle death broadcast                   |
| `!rbd radius <blocks>`           | Change broadcast radius (-1 = global)    |
| `!rbd volume <0-100>`            | Change sound volume %                    |
| `!rbd pitch <50-200>`            | Change sound pitch %                     |
| `!rbd maxnamed <0-20>`           | Change max named save points             |
| `!rbd mod <on\|off>`              | Master enable/disable                    |

Bedrock config persists across world restarts via world dynamic properties.

---

## Version Compatibility

### Researched: June 2026

**Java Edition (as of June 2026):**
- **Latest stable**: Minecraft 1.21.9 (and 26.x is the new year-based versioning for snapshots/experimental)
- **Fabric Loader**: 0.19.3 (stable)
- **Fabric API**: 0.134.1+1.21.9
- **Yarn mappings**: 1.21.9+build.1
- **Java**: 21 required for 1.21.x; 17 required for 1.20.x

**Bedrock Edition (as of June 2026):**
- **Latest stable**: Minecraft Bedrock 1.26.x
- **@minecraft/server (npm)**: 2.7.0 (latest), 1.14.0 (used by this mod for compatibility)

### What this mod targets

| Edition | Mod version | MC version target | Notes |
|---------|-------------|-------------------|-------|
| Java    | v1.0.0 / v1.1.0 | 1.20.1 (Fabric)   | Uses Java 17, Fabric Loom 1.6, Fabric API 0.92.2+1.20.1 |
| Bedrock | v1.0.0       | 1.21+             | Uses @minecraft/server 1.13.0 |
| Bedrock | v1.1.0       | 1.21+ (incl. 1.26.x) | Uses @minecraft/server 1.14.0 |

**Roadmap:**
- Java 1.21.x / 26.x support: planned. Requires Java 21 toolchain + minor API refactors (effect serialization via `Registries` is already in place in v1.1.0).
- @minecraft/server 2.x support: planned for a future Bedrock release. API has breaking changes that need careful migration.

---

## Building from Source

### Java Edition

```bash
cd java-edition
# Gradle wrapper jar is not bundled (download on first run).
# Use system gradle 8.7+ OR bootstrap the wrapper:
gradle wrapper --gradle-version 8.7
./gradlew build
# Output: java-edition/build/libs/return-by-death-1.1.0.jar
```

### Bedrock Edition

No build step — the behavior pack scripts are plain JavaScript executed by Minecraft's scripting engine. Just zip the folders:

```bash
cd bedrock-edition
zip -r behavior_pack_RBD.mcpack behavior_pack_RBD/
zip -r resource_pack_RBD.mcpack resource_pack_RBD/
```

---

## How It Works (Technical)

### Java Edition

The mod uses **Fabric** with a **Mixin** into `ServerPlayerEntity.onDeath()`:

1. The mixin intercepts `onDeath()` at `HEAD`.
2. `DeathHandler.onPlayerDeath()` checks:
   - Is the mod enabled?
   - Is a cooldown active?
   - Does a save point exist?
3. If all checks pass, the mod plays the sound (configurable volume/pitch/radius), increments the death counter (`RBDState`), adds an entry to the death log, restores the player's state from `SaveManager`, grants invulnerability, and **cancels** the rest of `onDeath()` — so no item drops, no death message, no scoreboard updates.
4. If any check fails, the death proceeds normally (vanilla).

`SaveManager` is driven by `ServerTickEvents.END_SERVER_TICK` and captures state every configurable interval. Captures are deep (items are `.copy()`-d) so the save is not affected by later inventory changes.

`RBDState` extends `PersistentState` and is stored in `world/data/rbd_state.dat` — death counts and death logs persist across server restarts.

`SavePointBeacon` ticks every second and spawns purple dust + end rod particles at each player's save point (only visible if the player is in the same dimension and within 64 blocks).

### Bedrock Edition

Bedrock doesn't have mixins, so the approach is event-driven:

1. `system.runInterval(captureSave, 20)` snapshots every player every interval (checked each second).
2. `world.afterEvents.playerDie` fires on death — we play the sound (configurable volume/pitch/radius), increment the death counter (dynamic property), add to the death log (JSON-encoded dynamic property), mark the player for return, and record the death location.
3. `world.afterEvents.playerSpawn` (with `initialSpawn=false`) fires on respawn — we teleport the player back to their save point, restore their inventory and stats, and clear dropped items near the death location.
4. A separate `system.runInterval` ticks every second to spawn particle beacons at each save point.
5. Another `system.runInterval` ticks every 0.5s to display the cooldown in the action bar.

Config is persisted in `world.getDynamicProperty("rbd:config")` as JSON.

---

## Project Structure

```
return-by-death/
├── java-edition/                    # Fabric mod (Minecraft Java 1.20.1)
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradle.properties            # mod_version = 1.1.0
│   ├── gradle/wrapper/
│   ├── LICENSE
│   ├── .gitignore
│   └── src/main/
│       ├── java/com/rezero/rbd/
│       │   ├── ReturnByDeathMod.java        # Main entrypoint (v1.1.0)
│       │   ├── ReturnByDeathClient.java     # Client stub
│       │   ├── SaveManager.java             # Auto + named save logic
│       │   ├── DeathHandler.java            # Death interception + sound + state restore
│       │   ├── RBDGameRules.java            # 12 gamerules
│       │   ├── RBDState.java                # NEW v1.1.0: persistent death counts + logs
│       │   ├── SavePointBeacon.java         # NEW v1.1.0: particle beacon
│       │   ├── RBDCommands.java             # All /rbd commands (player + op)
│       │   └── mixins/
│       │       ├── ServerPlayerEntityMixin.java
│       │       └── LivingEntityMixin.java
│       └── resources/
│           ├── fabric.mod.json
│           ├── rbd.mixins.json
│           └── assets/rbd/
│               ├── icon.png
│               ├── sounds.json
│               ├── sounds/return_by_death.ogg
│               └── lang/en_us.json
│
├── bedrock-edition/                 # Bedrock / Pocket Edition
│   ├── behavior_pack_RBD/
│   │   ├── manifest.json            # version [1, 1, 0]
│   │   ├── pack_icon.png
│   │   └── scripts/
│   │       └── main.js              # All mod logic (v1.1.0)
│   └── resource_pack_RBD/
│       ├── manifest.json            # version [1, 1, 0]
│       ├── pack_icon.png
│       └── sounds/
│           ├── sound_definitions.json
│           └── return_by_death.ogg
│
├── .github/workflows/
│   └── build.yml                    # CI: builds Java jar on push
├── assets/
│   └── re-zero-return-by-death.mp3  # Original audio file
├── pack_icon.png
├── README.md
└── LICENSE
```

---

## Compatibility

| Edition | Mod version | MC version         | Status      |
|---------|-------------|--------------------|-------------|
| Java    | v1.0.0      | 1.20.1 (Fabric)    | ✅ Supported |
| Java    | v1.1.0      | 1.20.1 (Fabric)    | ✅ Supported |
| Java    | v1.1.0      | 1.21.x / 26.x      | 🚧 Planned  |
| Bedrock | v1.0.0      | 1.21+              | ✅ Supported |
| Bedrock | v1.1.0      | 1.21+ (incl. 1.26.x) | ✅ Supported |
| Bedrock | v1.1.0      | Pocket Edition     | ✅ Supported |

The mod is server-authoritative — it works on dedicated servers, realms (Java), and shared worlds. Bedrock requires the world to have the behavior + resource packs active.

---

## Known Limitations

- **Bedrock:** Item drops are cleaned up *after* death (within an 8-block radius). Items flung further than that by explosions will not be cleaned. This is a Bedrock API limitation — there's no pre-death event.
- **Bedrock:** Saturation and XP progress are not perfectly preserved (the API doesn't expose them as cleanly as Java). XP level is preserved; progress resets to 0.
- **Java:** Ender chest contents are intentionally NOT saved — Return By Death only rewinds the player's person, not their storage.
- **Both:** The mod does not save block changes. If you die, your save point may now be inside a creeper crater. Be careful.
- **Both:** Named save points are stored in-memory (not persisted across server restarts). This is intentional for game balance.

---

## Releases

| Version | Date       | Notes                                                |
|---------|------------|------------------------------------------------------|
| v1.0.0  | 2026-06-18 | Initial release: core rewind mechanic + sound        |
| v1.1.0  | 2026-06-18 | Major feature update: configurable interval, death counter, death log, particle beacon, named saves, configurable sound/broadcast, action bar cooldown, reset command |

Old releases are never deleted — find them all at [the Releases page](../../releases).

---

## Credits & Legal

- **Inspiration:** *Re:Zero − Starting Life in Another World* by Tappei Nagatsuki.
- **Sound:** `re-zero-return-by-death.mp3` provided by the user.
- **Code:** Return By Death Mod Team.

**License:** MIT — see [LICENSE](./LICENSE).

**Disclaimer:** *Re:Zero* and all related characters, including Subaru Natsuki and the "Return By Death" ability, are the property of Tappei Nagatsuki, Kadokawa, and respective rights holders. This mod is a non-commercial fan work and is not affiliated with or endorsed by the rights holders. All rights to the original work belong to their respective owners.

---

*"I'll definitely save you. No matter how many times I have to die."*
