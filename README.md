# Return By Death — A Minecraft Mod

> *"From zero. From zero. From zero. I'll restart from zero as many times as it takes."*
> — Natsuki Subaru, Re:Zero − Starting Life in Another World

A Minecraft mod inspired by **Subaru Natsuki's "Return By Death"** ability from *Re:Zero − Starting Life in Another World*. When you die, you rewind to your last save point — with the inventory, position, hunger, vitals, XP, potion effects, and fire ticks you had at that moment — and the iconic Return By Death sound plays to everyone on the server.

**Available for both Minecraft Java Edition (Fabric) and Minecraft Bedrock Edition (incl. Pocket Edition).**

**Current version: v1.2.2** — see [What's New](#whats-new-in-v122) below.

---

## What's New in v1.2.2 (HOTFIX)

**Fixes a critical bug in v1.2.1**: Layer 1 (`CustomCommandRegistry`) was completely broken — it registered commands but used a non-existent `system.afterEvents.customCommand` event to handle execution, so all `/rbd:*` slash commands returned "Unknown command". This is fixed in v1.2.2.

### What was wrong

In v1.2.1, the code did this:
```js
// BROKEN: registers the command but never handles execution
registry.registerCommand({ name: "rbd:help", ... });
// Then tried to listen to a non-existent event:
system.afterEvents.customCommand.subscribe(...)  // ← does not exist!
```

### What's fixed in v1.2.2

```js
// CORRECT: pass the execution callback as the 2nd argument to registerCommand
registry.registerCommand({
  name: "rbd:help",
  description: "...",
  permissionLevel: CommandPermissionLevel.Any,  // proper enum, not raw 0
  cheatsRequired: false,  // works without cheats enabled
}, (origin) => {
  // Handle the command execution here
  const player = origin.sourceEntity;
  system.run(() => handleCommand(player, "help", ["help"]));
  return { status: CustomCommandStatus.Success };
});
```

Also new in v1.2.2:
- `cheatsRequired: false` on all commands — they work without enabling cheats
- `CommandPermissionLevel.Any` enum (instead of raw `0`) for player commands
- `CommandPermissionLevel.GameDirectors` enum for op commands
- Proper `mandatoryParameters` for commands that take arguments (`/rbd:named <name>`, `/rbd:interval <sec>`, etc.) — autocomplete now shows the parameter name
- Static import of `CommandPermissionLevel`, `CustomCommandParamType`, `CustomCommandStatus` from `@minecraft/server`

### How to test the fix

1. Install v1.2.2 packs (download from [the v1.2.2 release](../../releases/tag/v1.2.2))
2. **Save & quit the world** (custom commands only register on world load)
3. Re-enter the world
4. Type `/rbd` in chat — you should see autocomplete suggestions like `/rbd:help`, `/rbd:save`, `/rbd:info`, etc.
5. Run `/rbd:help` — it should now actually work

If Layer 1 still doesn't work, run `!rbd debug` (Layer 2) or right-click the RBD Notebook (Layer 3) — these still work and will tell you which layers are active.

---

## What's New in v1.2.1 (PATCH)

This is a bug fix + flavor patch. **v1.0.0, v1.1.0, and v1.2.0 are still available** at their respective release pages.

### 🩹 Bug Fix: Bedrock Chat Commands Now Work (3 Layers)

The most-reported issue with v1.2.0 was that `!rbd` chat commands didn't work for many Bedrock players. **v1.2.1 fixes this with 3 command layers and graceful fallback:**

| Layer | Method | Bedrock version | Beta APIs? | Notes |
|-------|--------|-----------------|------------|-------|
| **1** | `CustomCommandRegistry` (real `/rbd:save` slash commands) | 1.21.80+ | Not needed | Shows in autocomplete, works in command blocks, works on console |
| **2** | `world.beforeEvents.chatSend` (`!rbd save` chat) | All versions | Required for older Bedrock | The classic method, now wrapped in try/catch with logging |
| **3** | **RBD Notebook item UI** (right-click to open menu) | All versions | Not needed | Universal fallback — works on mobile, console, no chat needed |

All 3 layers call the same command handler, so behavior is identical. If one layer fails, the others still work. Every event subscription is wrapped in `try/catch` so the script never silently dies.

**New command: `/rbd debug` (or `!rbd debug`)** — shows which layers are active on your installation. Use this to diagnose command issues.

**New: RBD Notebook item** — every player gets a writable book renamed "RBD Notebook" in their inventory on join. Right-click it (in air) to open a button-based UI with all commands. This is the universal fallback that should always work.

### ✨ New Tier 1 RBD Flavor Features (both Java + Bedrock)

| Feature | Description |
|---------|-------------|
| **Witch scent** | After each death, dark soul particles drift around you for 60 seconds. In Re:Zero, the Witch of Envy is drawn to Subaru's scent after each death — this is the visual representation. Other players can briefly see the particles. |
| **Death quotes** | When you die, a random Subaru-style quote appears in chat (e.g. *"From zero. I'll restart from zero."*). Pure flavor, no mechanical effect. |
| **Heartbeat at low HP** | When your HP drops to 3 hearts (6 HP) or below, a deep warden-heartbeat sound plays every second — getting louder as you get closer to death. Recreates the anime's tense pre-death audio cue. |
| **"Witch watching" message** | Every 5th death, an ominous action-bar message appears: *"The Witch of Envy is watching you..."*. The more you die, the more attention you attract. |

These can be toggled individually (Java: gamerules; Bedrock: `CONFIG` in main.js).

---

## What's New in v1.2.0

A focused improvement update building on v1.1.0. **v1.0.0 and v1.1.0 are still available** at their respective release pages — we never overwrite old releases.

### New / changed in v1.2.0

| Change | Description |
|--------|-------------|
| **Default save interval → 20s** | Changed from 5s to 20s by default. Still configurable 1-600s via `/rbd interval`. |
| **Bedrock now saves potion effects** | Bedrock Edition now captures and restores active potion effects (was missing in v1.1.0). Java already did this. |
| **Bedrock now saves fire ticks** | Bedrock Edition now records whether the player was on fire and restores the fire state on rewind. |
| **Death title overlay** | "Returned By Death" title + "Loop #X" subtitle shown on the screen when you die. |
| **Action bar save indicator** | Every 3rd save (i.e. every 60s at default 20s), a brief "⚡ Save point recorded" message flashes in your action bar. |
| **Better death cause reporting** | Death log and `/rbd lastdeath` now show readable causes (e.g. "lava" instead of "lava", "entity attack (zombie)" instead of just "entityAttack"). |
| **New command: `/rbd revert`** | Instantly teleport back to your save point without dying. Uses the same cooldown as death-triggered reverts. |
| **New command: `/rbd lastdeath`** | Show details of your most recent death (time, location, cause, how long ago). |
| **New command: `/rbd testsound`** | Play the Return By Death sound on demand to verify the audio is installed correctly. |
| **Bedrock sound robustness** | Improved `playReturnByDeathSound` — uses `dimension.playSound` for radius-based, falls back to per-player `playSound` for global. |

---

## What's New in v1.1.0

| Feature | Description |
|---------|-------------|
| **Configurable save interval** | Change the auto-save interval from 5s to anything 1-600s. |
| **Death counter ("loops")** | Tracks how many times you've died — a Subaru Natsuki reference. Persists across restarts. |
| **Death log** | Records the last 10 deaths with timestamp, dimension, coordinates, and cause. |
| **Save point particle beacon** | Purple witch-themed particles appear at your save point location. |
| **Named save points** | Create up to 3 (configurable) named save points in addition to the auto-save. |
| **Configurable sound** | Adjust the Return By Death sound volume (0-100%) and pitch (50-200%). |
| **Configurable broadcast radius** | Limit the sound + broadcast message to a radius around the death location (-1 = whole server). |
| **Action bar cooldown** | Remaining cooldown is shown in your action bar. |
| **Save point reset** | Clear your save point — your next death becomes permanent. |
| **Per-player particle toggle** | Each player can opt out of save point particles without affecting others. |

---

## What It Does

- **Auto-save every 20 seconds** (default; configurable 1-600s). The mod silently captures your complete state:
  - **Position** (x, y, z, yaw, pitch) and dimension
  - **Full inventory** (36 slots: 27 main + 9 hotbar)
  - **Armor** (head, chest, legs, feet) and offhand (Java)
  - **Health, max health**
  - **Hunger, saturation, exhaustion** (Java full; Bedrock hunger only)
  - **Air, fire ticks, frozen ticks** (Java full; Bedrock fire only)
  - **XP level, XP progress, total XP** (Java full; Bedrock level only)
  - **Active potion effects** (Java full; Bedrock in v1.2.0+)
- **Death triggers a rewind.** When you die, instead of going to the death screen and respawning at world spawn, you are teleported back to your last save point with everything you had at the moment of save.
- **Iconic sound cue.** The provided `re-zero-return-by-death.mp3` (converted to OGG/Vorbis) plays to **every player on the server** (or within a configurable radius) when someone dies.
- **Death title overlay.** A "Returned By Death" title with subtitle "Loop #X" appears on your screen for ~3 seconds when you die.
- **Requires Instant Respawn.** The mod auto-enables `doImmediateRespawn` (Java) and reminds you to enable it (Bedrock) so there's no death-screen delay between dying and rewinding.
- **Dropped items are cleaned up** (Bedrock). Items drop on death in Bedrock; the mod despawns them within an 8-block radius of the death location so your saved inventory isn't duplicated.

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
4. Drop `return-by-death-1.2.0.jar` into your `mods/` folder.
5. Launch the game. The mod will auto-enable `doImmediateRespawn`.
6. Join a world — you'll see the welcome message in chat.

### Bedrock Edition (incl. Pocket Edition)

**Requirements:**
- Minecraft Bedrock 1.21.0+ (tested through 1.26.x)
- "Beta APIs" experimental toggle may need to be ON depending on your version
- "Immediate Respawn" toggle must be ON in world settings

**Steps:**
1. Download `behavior_pack_RBD.mcpack` and `resource_pack_RBD.mcpack` from the [v1.2.0 Release](../../releases/tag/v1.2.0).
2. **Double-click BOTH `.mcpack` files** to import them (or import via Settings → Storage → Import).
   - You MUST install BOTH packs. The sound is in the **resource pack** only — Bedrock does not load custom sounds from behavior packs.
3. Open your world settings → **Behavior Packs** → activate "Return By Death - Behavior Pack".
4. Open **Resource Packs** → activate "Return By Death - Resource Pack".
5. In world settings, enable **Immediate Respawn** (Game → toggle "Immediate Respawn").
6. **Restart your Minecraft client completely** (close the app and reopen it).
   - Bedrock does NOT hot-reload new sound files referenced by `sound_definitions.json`. A full client restart is required for the sound to load.
7. Join the world — you'll see the welcome message in chat.
8. Type `!rbd testsound` to verify the sound works. If you don't hear it, see [Troubleshooting](#troubleshooting) below.

> **Pocket Edition note:** The exact same `.mcpack` files work on Android/iOS. Transfer them to your device, tap to open with Minecraft.

---

## Troubleshooting

### "I don't hear the Return By Death sound when I die!"

This is the most common issue, and it's almost always one of these:

1. **You only installed the behavior pack, not the resource pack.**
   - The sound file (`return_by_death.ogg`) lives in the **resource pack**, not the behavior pack. Bedrock only loads custom sounds from resource packs.
   - Fix: install both `.mcpack` files and activate both packs in your world.

2. **You didn't restart your Minecraft client after installing the packs.**
   - Bedrock caches sound definitions on startup. New sounds referenced by `sound_definitions.json` need a full client restart to load.
   - Fix: completely close Minecraft (force-quit on mobile, fully exit the app) and reopen it.

3. **The resource pack is not active in your world.**
   - Even after installing, you must activate the pack per-world.
   - Fix: World Settings → Resource Packs → activate "Return By Death - Resource Pack".

4. **You're testing it wrong.**
   - Type `!rbd testsound` (Bedrock) or `/rbd testsound` (Java) to play the sound on demand. If THIS doesn't work, it's an install issue. If it works but the death sound doesn't, check the broadcast radius and volume settings.

5. **The sound volume is 0% or muted in game settings.**
   - Check your music/sound slider in game settings.
   - Check the mod's volume: `!rbd status` → `Sound volume: X%`. If it's 0%, run `!rbd volume 100`.

### "The mod doesn't seem to do anything when I die"

- Make sure the **behavior pack is active** in World Settings → Behavior Packs.
- Make sure **Immediate Respawn is ON** in world settings.
- Type `!rbd status` (Bedrock) or `/rbd status` (Java) to verify the mod is enabled.
- If `Enabled: false`, run `!rbd mod on` (Bedrock) or `/rbd mod on` (Java).
- Check for error messages in chat — the mod logs failures.

### "My death counter keeps resetting"

- Bedrock: the counter is stored per-player as a dynamic property. If you remove the behavior pack or reset the world, the counter is lost.
- Java: the counter is in `world/data/rbd_state.dat`. If you delete this file, the counter resets.

### "Items are duplicated when I die!"

- This happens in Bedrock if the cleanup radius is too small. The mod despawns dropped items within 8 blocks of the death location. If items are flung further (e.g. by an explosion), they won't be cleaned up.
- Workaround: increase the radius in `main.js` (search for `ITEM_DESPAWN_RADIUS`).

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
| `/rbd lastdeath`                 | Show details of your most recent death (v1.2.0) |
| `/rbd revert`                    | Instantly teleport to your save point (v1.2.0) |
| `/rbd testsound`                 | Play the RBD sound to verify it works (v1.2.0) |
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
| `rbdSaveIntervalSeconds`     | int     | `20`    | Seconds between auto-saves (v1.2.0 default)          |
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
| `!rbd lastdeath`                 | Show your most recent death (v1.2.0)     |
| `!rbd revert`                    | Instantly teleport to save point (v1.2.0) |
| `!rbd testsound`                 | Play RBD sound to verify (v1.2.0)        |
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
| Java    | v1.0.0 / v1.1.0 / v1.2.0 | 1.20.1 (Fabric)   | Uses Java 17, Fabric Loom 1.6, Fabric API 0.92.2+1.20.1 |
| Bedrock | v1.0.0       | 1.21+             | Uses @minecraft/server 1.13.0 |
| Bedrock | v1.1.0       | 1.21+ (incl. 1.26.x) | Uses @minecraft/server 1.14.0 |
| Bedrock | v1.2.0       | 1.21+ (incl. 1.26.x) | Uses @minecraft/server 1.14.0; saves potion effects + fire |

**Roadmap:**
- Java 1.21.x / 26.x support: planned. The hardest part (effect serialization via `Registries`) is already in place.
- @minecraft/server 2.x support: planned for a future Bedrock release. API has breaking changes.

---

## Building from Source

### Java Edition

```bash
cd java-edition
gradle wrapper --gradle-version 8.7
./gradlew build
# Output: java-edition/build/libs/return-by-death-1.2.0.jar
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

### What Gets Saved

| Field                  | Java | Bedrock v1.1.0 | Bedrock v1.2.0 |
|------------------------|------|----------------|----------------|
| Position (x, y, z)     | ✅   | ✅             | ✅             |
| Rotation (yaw, pitch)  | ✅   | ✅             | ✅             |
| Dimension              | ✅   | ✅             | ✅             |
| Full inventory (36)    | ✅   | ✅             | ✅             |
| Armor (4 slots)        | ✅   | ✅             | ✅             |
| Offhand                | ✅   | ❌             | ❌             |
| Health                 | ✅   | ✅             | ✅             |
| Hunger                 | ✅   | ✅             | ✅             |
| Saturation             | ✅   | ❌             | ❌             |
| Exhaustion             | ✅   | ❌             | ❌             |
| Air / breath           | ✅   | ❌             | ❌             |
| Fire ticks             | ✅   | ❌             | ✅ (NEW)       |
| Frozen ticks           | ✅   | ❌             | ❌             |
| XP level               | ✅   | ✅             | ✅             |
| XP progress            | ✅   | ❌             | ❌             |
| Total XP               | ✅   | ❌             | ❌             |
| **Potion effects**     | ✅   | ❌             | ✅ (NEW)       |

### Java Edition

The mod uses **Fabric** with a **Mixin** into `ServerPlayerEntity.onDeath()`:

1. The mixin intercepts `onDeath()` at `HEAD`.
2. `DeathHandler.onPlayerDeath()` checks: mod enabled? cooldown active? save point exists?
3. If all checks pass, the mod:
   - Plays the sound (configurable volume/pitch/radius)
   - Increments the death counter (`RBDState`)
   - Adds an entry to the death log (with readable cause via `source.getDeathMessage()`)
   - Shows a death title overlay ("Returned By Death" + "Loop #X")
   - Restores the player's state from `SaveManager` (position, inventory, armor, vitals, XP, effects, fire, etc.)
   - Grants 3 seconds of invulnerability
   - **Cancels** the rest of `onDeath()` — no item drops, no death message, no scoreboard updates

`SaveManager` is driven by `ServerTickEvents.END_SERVER_TICK` and captures state every configurable interval. Captures are deep (items are `.copy()`-d) so the save is not affected by later inventory changes.

`RBDState` extends `PersistentState` and is stored in `world/data/rbd_state.dat` — death counts and death logs persist across server restarts.

`SavePointBeacon` ticks every second and spawns purple dust + end rod particles at each player's save point (only visible if the player is in the same dimension and within 64 blocks).

### Bedrock Edition

Bedrock doesn't have mixins, so the approach is event-driven:

1. `system.runInterval(captureSave, 20)` snapshots every player every interval (checked each second).
2. `world.afterEvents.playerDie` fires on death — we play the sound, increment the death counter (dynamic property), add to the death log (JSON-encoded dynamic property), show the title overlay, mark the player for return, and record the death location.
3. `world.afterEvents.playerSpawn` (with `initialSpawn=false`) fires on respawn — we teleport the player back to their save point, restore their inventory/armor/vitals/XP/effects/fire, and clear dropped items near the death location.
4. A separate `system.runInterval` ticks every second to spawn particle beacons at each save point.
5. Another `system.runInterval` ticks every 0.5s to display the cooldown in the action bar.

Config is persisted in `world.getDynamicProperty("rbd:config")` as JSON.

The sound is in `resource_pack_RBD/sounds/return_by_death.ogg` and registered in `resource_pack_RBD/sounds/sound_definitions.json` — Bedrock only loads custom sounds from resource packs, never from behavior packs.

---

## Project Structure

```
return-by-death/
├── java-edition/                    # Fabric mod (Minecraft Java 1.20.1)
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradle.properties            # mod_version = 1.2.0
│   ├── gradle/wrapper/
│   ├── LICENSE
│   ├── .gitignore
│   └── src/main/
│       ├── java/com/rezero/rbd/
│       │   ├── ReturnByDeathMod.java        # Main entrypoint (v1.2.0)
│       │   ├── ReturnByDeathClient.java     # Client stub
│       │   ├── SaveManager.java             # Auto + named save logic
│       │   ├── DeathHandler.java            # Death interception + sound + state restore + revert()
│       │   ├── RBDGameRules.java            # 12 gamerules
│       │   ├── RBDState.java                # Persistent death counts + logs
│       │   ├── SavePointBeacon.java         # Particle beacon
│       │   ├── RBDCommands.java             # All /rbd commands (player + op) - 25 total
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
│   │   ├── manifest.json            # version [1, 2, 0]
│   │   ├── pack_icon.png
│   │   └── scripts/
│   │       └── main.js              # All mod logic (v1.2.0) - saves effects + fire
│   └── resource_pack_RBD/
│       ├── manifest.json            # version [1, 2, 0]
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
| Java    | v1.0.0 / v1.1.0 / v1.2.0 / v1.2.1 / v1.2.2 | 1.20.1 (Fabric)    | ✅ Supported |
| Java    | v1.2.2      | 1.21.x / 26.x      | 🚧 Planned  |
| Bedrock | v1.0.0      | 1.21+              | ✅ Supported |
| Bedrock | v1.1.0      | 1.21+ (incl. 1.26.x) | ✅ Supported |
| Bedrock | v1.2.0      | 1.21+ (incl. 1.26.x) | ✅ Supported |
| Bedrock | v1.2.1      | 1.21+ (incl. 1.26.x) | ⚠️ Layer 1 broken — use v1.2.2 |
| Bedrock | v1.2.2      | 1.21+ (incl. 1.26.x) | ✅ Supported (recommended) |
| Bedrock | v1.2.2      | Pocket Edition     | ✅ Supported |

The mod is server-authoritative — it works on dedicated servers, realms (Java), and shared worlds. Bedrock requires the world to have BOTH the behavior AND resource packs active.

---

## Known Limitations

- **Bedrock:** Item drops are cleaned up *after* death (within an 8-block radius). Items flung further than that by explosions will not be cleaned.
- **Bedrock:** Saturation, XP progress, air, and frozen ticks are not preserved (the API doesn't expose them cleanly). XP level is preserved; progress resets to 0.
- **Bedrock:** Sound files require a full client restart to load — they are NOT hot-reloaded when you join a world.
- **Java:** Ender chest contents are intentionally NOT saved — Return By Death only rewinds the player's person, not their storage.
- **Both:** The mod does not save block changes. If you die, your save point may now be inside a creeper crater. Be careful.
- **Both:** Named save points are stored in-memory (not persisted across server restarts). This is intentional for game balance.

---

## Releases

| Version | Date       | Notes                                                |
|---------|------------|------------------------------------------------------|
| v1.0.0  | 2026-06-18 | Initial release: core rewind mechanic + sound        |
| v1.1.0  | 2026-06-18 | Major feature update: configurable interval, death counter, death log, particle beacon, named saves, configurable sound/broadcast, action bar cooldown, reset command |
| v1.2.0  | 2026-06-18 | Default interval 20s, Bedrock saves potion effects + fire ticks, death title overlay, save indicator, `/rbd revert` + `/rbd lastdeath` + `/rbd testsound`, better cause reporting |
| v1.2.1  | 2026-06-18 | Bedrock command fix (3 layers). New `/rbd debug` command. Tier 1 RBD flavor: witch scent, death quotes, heartbeat at low HP, "Witch watching" message. **⚠️ Layer 1 (CustomCommandRegistry) was broken — use v1.2.2 instead.** |
| v1.2.2  | 2026-06-18 | **HOTFIX**: Fixed Layer 1 CustomCommandRegistry — slash commands `/rbd:save` etc. now actually work on Bedrock 1.21.80+. Added `cheatsRequired: false`, proper `CommandPermissionLevel` enums, mandatoryParameters for autocomplete. |

Old releases are never deleted — find them all at [the Releases page](../../releases).

---

### "!rbd commands don't work in chat"

This was a common issue in v1.2.0. v1.2.1 fixes it with 3 command layers. If commands still don't work, try these in order:

1. **Run `!rbd debug`** (or `/rbd:debug` on Bedrock 1.21.80+) — this shows which command layers are active.
2. **Try `/rbd:save`** (Layer 1) — works on Bedrock 1.21.80+ without any experimental toggles.
3. **Try right-clicking the RBD Notebook in your inventory** (Layer 3) — should always work, on any version. The notebook is a writable book renamed "RBD Notebook".
4. **If you lost the notebook**, rejoin the world (you get a new one on join).
5. **Enable "Beta APIs" experimental toggle** in world settings if you want `!rbd` chat commands (Layer 2) to work on older Bedrock versions.
6. **Check the script console** — if `chatSend` failed to register, the script logs a warning like `[RBD WARNING] Layer 2 (chatSend): world.beforeEvents.chatSend is undefined`.

The RBD Notebook (Layer 3) is the universal fallback — it should always work even if the other two layers fail.

---

## Credits & Legal

- **Inspiration:** *Re:Zero − Starting Life in Another World* by Tappei Nagatsuki.
- **Sound:** `re-zero-return-by-death.mp3` provided by the user.
- **Code:** Return By Death Mod Team.

**License:** MIT — see [LICENSE](./LICENSE).

**Disclaimer:** *Re:Zero* and all related characters, including Subaru Natsuki and the "Return By Death" ability, are the property of Tappei Nagatsuki, Kadokawa, and respective rights holders. This mod is a non-commercial fan work and is not affiliated with or endorsed by the rights holders. All rights to the original work belong to their respective owners.

---

*"I'll definitely save you. No matter how many times I have to die."*
