# Return By Death — A Minecraft Mod

> *"From zero. From zero. From zero. From zero. From zero. From zero. From zero. From zero. From zero. From zero. From zero. From zero. From zero. From zero. From zero. From zero. I'll restart from zero as many times as it takes."*
> — Natsuki Subaru, Re:Zero − Starting Life in Another World

A Minecraft mod inspired by **Subaru Natsuki's "Return By Death"** ability from *Re:Zero − Starting Life in Another World*. When you die, you rewind to your last save point — with the inventory, position, and vitals you had at that moment — and the iconic Return By Death sound plays to everyone on the server.

**Available for both Minecraft Java Edition (Fabric) and Minecraft Bedrock Edition (incl. Pocket Edition).**

---

## What It Does

- **Auto-save every 5 seconds.** The mod silently captures your complete state — position, dimension, full inventory, armor, health, hunger, XP level, and (Java) active potion effects — every 5 seconds (100 ticks).
- **Death triggers a rewind.** When you die, instead of going to the death screen and respawning at world spawn, you are teleported back to your last save point with the inventory and stats you had at the moment of save.
- **Iconic sound cue.** The provided `re-zero-return-by-death.mp3` (converted to OGG/Vorbis) plays to **every player on the server** when someone dies — a haunting reminder that the loop has restarted.
- **Requires Instant Respawn.** The mod auto-enables `doImmediateRespawn` (Java) and reminds you to enable it (Bedrock) so there's no death-screen delay between dying and rewinding.
- **Dropped items are cleaned up.** In Bedrock, items drop on death; the mod despawns them within an 8-block radius of the death location so your saved inventory isn't duplicated.

---

## Extra Features

Beyond the core rewind mechanic, the mod ships with:

- **Manual save command** — Don't want to wait for the 5-second tick? Force a save point immediately.
  - **Java:** `/rbd save`
  - **Bedrock:** `!rbd save` (chat)
- **Save point info** — Show coordinates, dimension, HP, hunger, and XP of your current save.
  - **Java:** `/rbd info`
  - **Bedrock:** `!rbd info`
- **Mod status** — Show all gamerules and current configuration.
  - **Java:** `/rbd status`
  - **Bedrock:** `!rbd status`
- **Cooldown** — Optionally require N seconds between rewinds. If you die during cooldown, the death is permanent.
- **Death broadcast** — Optionally announce to the whole server when someone Returns By Death.
- **Brief invulnerability on return** — 3 seconds of Resistance V + Fire Resistance so you don't instantly re-die to the thing that just killed you (e.g. lava, a crowd of zombies).
- **Master toggle gamerule** — `rbdEnabled` lets server admins disable the mod without uninstalling.
- **Keeps inventory on death** — Even though vanilla `keepInventory` is off, the mod prevents drops on the Java side via mixin. Bedrock cleans up drops after the fact.

---

## Installation

### Java Edition (Fabric)

**Requirements:**
- Minecraft Java 1.20.1
- [Fabric Loader](https://fabricmc.net/use/) 0.15.0+
- [Fabric API](https://modrinth.com/mod/fabric-api) 0.92.2+

**Steps:**
1. Install Fabric Loader for Minecraft 1.20.1.
2. Drop the **Fabric API** jar into your `mods/` folder.
3. Build the mod from source (see [Building from Source](#building-from-source)) or download a pre-built `.jar` from the [Releases](../../releases) page.
4. Drop `return-by-death-1.0.0.jar` into your `mods/` folder.
5. Launch the game. The mod will auto-enable `doImmediateRespawn`.
6. Join a world — you'll see the welcome message in chat.

### Bedrock Edition (incl. Pocket Edition)

**Requirements:**
- Minecraft Bedrock 1.21.0+
- "Beta APIs" / "Holiday Creator Features" experimental toggle may need to be ON (depending on your version)
- "Immediate Respawn" toggle must be ON in world settings

**Steps:**
1. Download `behavior_pack_RBD.mcpack` and `resource_pack_RBD.mcpack` from [Releases](../../releases), or zip the folders manually.
2. Double-click the `.mcpack` files (or import them via Settings → Storage → Import).
3. Open your world settings → **Behavior Packs** → activate "Return By Death - Behavior Pack".
4. Open **Resource Packs** → activate "Return By Death - Resource Pack".
5. In world settings, enable **Immediate Respawn** (Game → Default Game Mode → toggle "Immediate Respawn").
6. Join the world — you'll see the welcome message in chat.

> **Pocket Edition note:** The exact same `.mcpack` files work on Android/iOS. Just transfer them to your device and open with Minecraft.

---

## Building from Source

### Java Edition

```bash
cd java-edition
# Gradle wrapper jar is not bundled (it's downloaded on first run).
# Use system gradle 8.7+ OR download the wrapper jar from https://fabricmc.net/develop/
gradle build      # or: ./gradlew build (if you've bootstrapped the wrapper)
# Output: java-edition/build/libs/return-by-death-1.0.0.jar
```

### Bedrock Edition

No build step required — the behavior pack scripts are plain JavaScript executed by Minecraft's scripting engine. Just zip the folders:

```bash
cd bedrock-edition
# Behavior pack
zip -r behavior_pack_RBD.mcpack behavior_pack_RBD/
# Resource pack
zip -r resource_pack_RBD.mcpack resource_pack_RBD/
```

---

## Commands & Gamerules

### Java Edition

| Command         | Description                              |
|-----------------|------------------------------------------|
| `/rbd save`     | Manually create a save point right now   |
| `/rbd info`     | Show your current save point details     |
| `/rbd status`   | Show mod status and gamerules            |
| `/rbd help`     | Show help                                |

| Gamerule                     | Type    | Default | Description                                          |
|------------------------------|---------|---------|------------------------------------------------------|
| `rbdEnabled`                 | bool    | `true`  | Master toggle for the mod                            |
| `rbdCooldownSeconds`         | int     | `0`     | Cooldown (seconds) before next rewind can trigger    |
| `rbdBroadcastDeath`          | bool    | `false` | Broadcast a server-wide message on rewind            |
| `rbdKeepInventoryOnDeath`    | bool    | `true`  | Keep items in inventory even though keepInventory is off |
| `doImmediateRespawn`         | bool    | `true`  | (Vanilla) Required by mod — auto-enabled             |

### Bedrock Edition

| Chat Command    | Description                              |
|-----------------|------------------------------------------|
| `!rbd save`     | Manually create a save point right now   |
| `!rbd info`     | Show your current save point details     |
| `!rbd status`   | Show mod status                          |
| `!rbd help`     | Show help                                |

Configuration is currently hardcoded in `behavior_pack_RBD/scripts/main.js` (top of file). Edit `CONFIG` to change `enabled`, `broadcastDeaths`, `cooldownSeconds`.

---

## How It Works (Technical)

### Java Edition

The mod uses **Fabric** with a **Mixin** into `ServerPlayerEntity.onDeath()`:

1. The mixin intercepts `onDeath()` at `HEAD`.
2. `DeathHandler.onPlayerDeath()` checks:
   - Is the mod enabled?
   - Is a cooldown active?
   - Does a save point exist?
3. If all checks pass, the mod plays the sound, restores the player's state from `SaveManager`, grants invulnerability, and **cancels** the rest of `onDeath()` — so no item drops, no death message, no scoreboard updates.
4. If any check fails, the death proceeds normally (vanilla).

`SaveManager` is driven by `ServerTickEvents.END_SERVER_TICK` and captures state every 100 ticks (5 seconds). Captures are deep (items are `.copy()`-d) so the save is not affected by later inventory changes.

### Bedrock Edition

Bedrock doesn't have mixins, so the approach is event-driven:

1. `system.runInterval(captureSave, 100)` snapshots every player every 5 seconds.
2. `world.afterEvents.playerDie` fires on death — we play the sound, mark the player for return, and record the death location.
3. `world.afterEvents.playerSpawn` (with `initialSpawn=false`) fires on respawn — we teleport the player back to their save point, restore their inventory and stats, and clear dropped items near the death location.

---

## Project Structure

```
return-by-death/
├── java-edition/                    # Fabric mod (Minecraft Java 1.20.1)
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradle.properties
│   ├── gradle/wrapper/
│   ├── LICENSE
│   ├── .gitignore
│   └── src/main/
│       ├── java/com/rezero/rbd/
│       │   ├── ReturnByDeathMod.java        # Main entrypoint
│       │   ├── ReturnByDeathClient.java     # Client stub
│       │   ├── SaveManager.java             # 5-second save logic
│       │   ├── DeathHandler.java            # Death interception
│       │   ├── RBDGameRules.java            # Custom gamerules
│       │   ├── RBDCommands.java             # /rbd commands
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
│   │   ├── manifest.json
│   │   ├── pack_icon.png
│   │   └── scripts/
│   │       └── main.js                      # All mod logic
│   └── resource_pack_RBD/
│       ├── manifest.json
│       ├── pack_icon.png
│       └── sounds/
│           ├── sound_definitions.json
│           └── return_by_death.ogg
│
├── .github/workflows/
│   └── build.yml                    # CI: builds Java jar on push
├── pack_icon.png
├── README.md
└── LICENSE
```

---

## Compatibility

| Edition | Version         | Status      |
|---------|-----------------|-------------|
| Java    | 1.20.1 (Fabric) | ✅ Supported |
| Bedrock | 1.21.0+         | ✅ Supported |
| Pocket  | (Bedrock)       | ✅ Supported |

The mod is server-authoritative — it works on dedicated servers, realms (Java), and shared worlds. Bedrock requires the world to have the behavior + resource packs active.

---

## Known Limitations

- **Bedrock:** Item drops are cleaned up *after* death (within an 8-block radius). Items flung further than that by explosions will not be cleaned. This is a Bedrock API limitation — there's no pre-death event.
- **Bedrock:** Saturation and XP progress are not perfectly preserved (the API doesn't expose them as cleanly as Java). XP level is preserved; progress resets to 0.
- **Java:** Ender chest contents are intentionally NOT saved — Return By Death only rewinds the player's person, not their storage.
- **Both:** The mod does not save block changes. If you die, your save point may now be inside a creeper crater. Be careful.

---

## Credits & Legal

- **Inspiration:** *Re:Zero − Starting Life in Another World* by Tappei Nagatsuki.
- **Sound:** `re-zero-return-by-death.mp3` provided by the user.
- **Code:** Return By Death Mod Team.

**License:** MIT — see [LICENSE](./LICENSE).

**Disclaimer:** *Re:Zero* and all related characters, including Subaru Natsuki and the "Return By Death" ability, are the property of Tappei Nagatsuki, Kadokawa, and respective rights holders. This mod is a non-commercial fan work and is not affiliated with or endorsed by the rights holders. All rights to the original work belong to their respective owners.

---

*"I'll definitely save you. No matter how many times I have to die."*
