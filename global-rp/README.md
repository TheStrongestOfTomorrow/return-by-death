# Return By Death - Global RP (Client-Side)

> *"I will save you, no matter how many times I have to die."*
> — Natsuki Subaru, Re:Zero − Starting Life in Another World

A **standalone, client-side only** version of the Return By Death mod that plays the iconic Re:Zero sound whenever **YOU** die — on **any server**, with no server-side install required.

**Available for Bedrock Edition (pure resource pack) and Java Edition (tiny client-side Fabric mod).**

---

## What It Does

- **Plays the Return By Death sound when you die.** That's it. That's the mod.
- **Works on any server.** Bedrock: pure resource pack. Java: tiny client-side Fabric mod. No server install, no behavior pack, no permissions needed.
- **Hears only YOUR death.** The sound plays for you when you die — not when other players die (you don't get spammed).
- **No save points, no rewinds, no teleporting.** This is the lightweight version. If you want the full Return By Death rewind mechanic, use the [main mod](../README.md) instead.

---

## Why a separate "Global RP"?

The main Return By Death mod is server-side: it intercepts deaths, saves player state, teleports the player back to their save point, and broadcasts a sound. That's great for your own world/server, but:

- ❌ Doesn't work on realms/servers you don't control
- ❌ Requires both packs to be installed on the world
- ❌ Requires everyone to have the mod

The **Global RP** is the opposite:

- ✅ Works on ANY server (vanilla, realms, friends' worlds)
- ✅ Single resource pack (Bedrock) or tiny client mod (Java)
- ✅ Only YOU hear the sound — other players are unaffected
- ✅ Server doesn't even know you have it

Use this when you want the dramatic death sound effect on servers you don't own.

---

## How It Works

### Bedrock Edition (Pure Resource Pack)

Bedrock plays the `damage.fallbig` sound event when a player dies (it's the "big fall" sound, reused for death). This resource pack overrides `damage.fallbig` in `sound_definitions.json` to point to the Return By Death audio.

**The trade-off:** Because we override a vanilla sound ID, the RBD audio will also play when you take large fall damage (8+ blocks). It will NOT play on small falls (those use `damage.fallsmall`, which we leave alone). This is a Bedrock limitation — there's no client-side "player died" hook in a pure resource pack.

**How to use it on ANY server:**
1. Install the `.mcpack` globally (Settings → Storage → Import, or double-click the file).
2. Activate the resource pack as a **Global Resource Pack** (Settings → Global Resources → click the pack).
3. Restart Minecraft completely (sounds require a client restart to load).
4. Join any server. When you die, you'll hear the RBD sound.

### Java Edition (Client-Side Fabric Mod)

Java resource packs can't detect death events at all, so we use a tiny **client-only Fabric mod** (~2KB of code) that:

- Subscribes to the client tick event
- Checks the local player's health each tick
- When health drops to 0 (death edge detected), plays the RBD sound locally

**This is purely client-side.** The server never sees it, never gets a packet, never knows you have it. It works on vanilla servers, realms, modded servers — anywhere.

**Extra Java features:**
- **F8** — Test the sound (no death required)
- **F9** — Toggle the mod on/off
- **`/rbdglobal`** — Client command (NOT sent to server) with subcommands:
  - `status` — show current settings
  - `on` / `off` — enable/disable
  - `test` — play the sound
  - `volume <0-1>` — set volume (0.0 to 1.0)
  - `pitch <0.5-2>` — set pitch (0.5 to 2.0)
  - `count` — show session death count
  - `help` — show help

---

## Installation

### Bedrock Edition

**Requirements:** Minecraft Bedrock 1.21.0+ (incl. Pocket Edition)

**Steps:**
1. Download `RBD_Global_RP.mcpack` from the [Global RP Release](../../releases/tag/global-rp-v1.0.0).
2. Double-click the `.mcpack` file (or import via Settings → Storage → Import).
3. Go to **Settings → Global Resources**.
4. Activate "Return By Death - Global RP" as a global resource pack.
5. **Restart Minecraft completely** (close the app and reopen — sounds need a full client restart to load).
6. Join any server or world. Die. Hear the sound.

> **Why Global Resources?** Global resource packs apply to ALL worlds and servers — exactly what you want for a client-side death sound. You only need to set this up once.

### Java Edition

**Requirements:**
- Minecraft Java 1.20.1
- [Fabric Loader](https://fabricmc.net/use/) 0.15.0+
- [Fabric API](https://modrinth.com/mod/fabric-api) (only the base API is needed)

**Steps:**
1. Download `return-by-death-globalrp-1.0.0.jar` from the [Global RP Release](../../releases/tag/global-rp-v1.0.0) (or build from source).
2. Drop the jar into your `mods/` folder alongside Fabric API.
3. Launch Minecraft.
4. Join any server. When you die, you'll hear the sound.
5. (Optional) Press **F8** to test the sound. Press **F9** to toggle on/off.

---

## Troubleshooting

### "I don't hear the sound when I die!"

**Bedrock:**
1. **Did you restart Minecraft completely?** Bedrock caches sounds on startup — new sounds need a full client restart.
2. **Is the resource pack set as GLOBAL?** Not just per-world — go to Settings → Global Resources.
3. **Is your game volume up?** Check the master volume slider.
4. **Try a test death.** Open a single-player world, do `/kill @s`, or jump off a tall cliff. The sound should play on death (or large fall — that's expected on Bedrock).

**Java:**
1. **Is Fabric API installed?** The mod needs `fabric-api-base` for the client tick event.
2. **Is the mod loaded?** Check the Mods menu in-game — "Return By Death - Global RP" should appear.
3. **Is the mod enabled?** Press **F9** to toggle. Check `/rbdglobal status`.
4. **Test the sound:** Press **F8** or run `/rbdglobal test`. If this doesn't play, the audio files didn't load.
5. **Is your volume > 0?** Check `/rbdglobal status` — Volume should be > 0.0. Use `/rbdglobal volume 1.0` to set max.

### "The sound plays when I take fall damage, not just on death (Bedrock)"

This is expected behavior on Bedrock — there's no client-side "player died" hook in a pure resource pack. We override `damage.fallbig`, which is the vanilla sound Bedrock uses for both big falls AND death. If you want death-only detection, you need the [main mod](../README.md) (which requires a behavior pack + server install).

### "Does this work on multiplayer servers?"

**Yes.** Both versions are purely client-side:
- Bedrock: Resource packs are client-side. Servers can't see or block them.
- Java: The mod only listens to the local player's health — no packets are sent to the server. Some servers may block client mods in their ToS, but technically it works everywhere.

### "Will other players hear the sound when I die?"

**No.** Only YOU hear the sound. Other players' clients don't have this pack/mod installed (presumably), so they hear the vanilla death sound (or nothing, since vanilla doesn't have a death sound).

If you want EVERYONE to hear it, use the [main mod](../README.md) instead.

---

## Building from Source (Java Edition)

```bash
cd global-rp/java
gradle wrapper --gradle-version 8.7
./gradlew build
# Output: global-rp/java/build/libs/return-by-death-globalrp-1.0.0.jar
```

### Bedrock Edition

No build step — just zip the `bedrock/` folder:

```bash
cd global-rp/bedrock
zip -r RBD_Global_RP.mcpack .
```

---

## Project Structure

```
global-rp/
├── bedrock/                          # Pure resource pack (no BP!)
│   ├── manifest.json                 # version [1, 0, 0]
│   ├── pack_icon.png
│   └── sounds/
│       ├── sound_definitions.json    # overrides damage.fallbig
│       └── return_by_death.ogg
│
├── java/                             # Tiny client-side Fabric mod
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradle.properties             # mod_version = 1.0.0
│   ├── gradle/wrapper/
│   ├── LICENSE
│   ├── .gitignore
│   └── src/main/
│       ├── java/com/rezero/rbd/globalrp/
│       │   ├── ReturnByDeathGlobalRP.java    # Client entrypoint
│       │   └── RBDGlobalCommands.java        # /rbdglobal commands (client-only)
│       └── resources/
│           ├── fabric.mod.json
│           └── assets/rbd_globalrp/
│               ├── icon.png
│               ├── sounds.json
│               ├── sounds/return_by_death.ogg
│               └── lang/en_us.json
│
└── README.md                         # This file
```

---

## Comparison: Global RP vs Main Mod

| Feature                       | Global RP (this) | [Main Mod](../README.md) |
|-------------------------------|------------------|--------------------------|
| Plays RBD sound on death      | ✅               | ✅                       |
| Works on any server           | ✅               | ❌ (server-side only)    |
| Server-side install required  | ❌               | ✅                       |
| Rewinds you to save point     | ❌               | ✅                       |
| Saves inventory/HP/XP         | ❌               | ✅                       |
| Death counter                 | ✅ (session only) | ✅ (persisted)           |
| Configurable volume/pitch     | ✅               | ✅                       |
| Particle beacon               | ❌               | ✅                       |
| Named save points             | ❌               | ✅                       |
| Triggers on fall damage       | ✅ (Bedrock)     | ❌                       |
| Pure resource pack (Bedrock)  | ✅               | ❌ (needs BP + RP)       |
| File size                     | ~35 KB           | ~50 KB                   |

---

## Compatibility

| Edition | Mod version | MC version         | Status      |
|---------|-------------|--------------------|-------------|
| Bedrock | v1.0.0      | 1.21+ (incl. 1.26.x) | ✅ Supported |
| Bedrock | v1.0.0      | Pocket Edition     | ✅ Supported |
| Java    | v1.0.0      | 1.20.1 (Fabric)    | ✅ Supported |
| Java    | v1.0.0      | 1.21.x / 26.x      | 🚧 Planned  |

---

## Known Limitations

- **Bedrock:** The sound also plays on large fall damage (8+ blocks), not just death. This is unavoidable in a pure resource pack.
- **Bedrock:** The sound requires a full client restart after install (Bedrock caches sounds on startup).
- **Java:** Session death count is not persisted across game restarts. Use the [main mod](../README.md) for persisted death counts.
- **Java:** Some anti-cheat plugins on servers may flag client mods. The mod sends no packets, but you should still check server rules.
- **Both:** The sound is only heard by YOU. Other players hear vanilla (or nothing).

---

## Credits & Legal

- **Inspiration:** *Re:Zero − Starting Life in Another World* by Tappei Nagatsuki.
- **Sound:** `re-zero-return-by-death.mp3` provided by the user.
- **Code:** Return By Death Mod Team.

**License:** MIT — see [LICENSE](./java/LICENSE).

**Disclaimer:** *Re:Zero* and all related characters, including Subaru Natsuki and the "Return By Death" ability, are the property of Tappei Nagatsuki, Kadokawa, and respective rights holders. This mod is a non-commercial fan work and is not affiliated with or endorsed by the rights holders. All rights to the original work belong to their respective owners.

---

*"From zero. I'll restart from zero as many times as it takes."*
