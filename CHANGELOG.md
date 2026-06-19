# Changelog — Return By Death

All notable changes to the Return By Death mod (Bedrock Edition) are documented in this file.
Java Edition changelog lives in `java-edition/` and is not tracked here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.4.0] — 2026-06-19 — Restoration Release

### Summary
Brings back the **complete v1.2.5 feature set** on top of the **proven v1.3.0 death-detection foundation**. After v1.3.1 stripped everything down to just "play sound on death", users requested a single release that has every feature working together again. This is that release.

### Added (restored from v1.2.5)
- **`broadcastRadius` config option** + `/rbd radius <blocks>` op command — was silently dropped in v1.3.0; death broadcasts are now distance-filtered again (`-1` = global).
- **Full particle beacon ring** — v1.3.0 only kept the column + endrod; v1.4.0 restores the 4-direction `basic_crit_particle` ring around the save point.
- **Death cause extraction from `entityDie` event** — `triggerReturn` now accepts `ev.damageSource` and the death log records real causes (fire, fall, lava, etc.) instead of the hardcoded `"unknown"` that v1.3.0 logged.
- **Sound volume + pitch now applied to `playSound`** — v1.3.0 hardcoded `1.0`, which silently broke the `!rbd volume` / `!rbd pitch` op commands. The OGG itself is still the boosted `-14dB` broadcast-standard file from v1.2.4, so the multiplier just acts as a user-side attenuation.
- **`BEACON_INTERVAL_TICKS` and `BEACON_MAX_DISTANCE` named constants** — v1.3.0 inlined `64 * 64` and `20`; restored as named constants for readability.
- **Witch scent extra drift particles** — the 3 random `soul_particle` drifts around the player from v1.2.5 are back.
- **Heartbeat volume scaling** — warden heartbeat volume now scales from 0.4 to 1.0 based on how close HP is to 0 (was constant in v1.3.0).
- **`actionBarCooldown` config toggle** + display loop — restored.
- **Status command shows all config fields** — v1.3.0's `status` command dropped several fields (broadcastRadius, soundPitch, maxNamedSavePoints, actionBarCooldown, deathQuotesEnabled, witchWatchingEnabled); v1.4.0 restores all of them.

### Kept from v1.3.0 (the foundation)
- **`entityDie` event + 1-tick polling fallback** for death detection — most reliable pattern, catches both natural deaths and `/kill`.
- **`GLOBAL_REWIND_ACTIVE` mutex** — prevents double-restore when both detection methods fire for the same death.
- **Auto gamerule setup at startup** — sets `doimmediaterespawn=true`, `keepinventory=true`, `showdeathmessages=false` so RBD's restore logic works correctly.
- **Modern `EntityComponentTypes.Inventory` / `Equippable` constants** instead of hardcoded `"minecraft:..."` strings.
- **`EquipmentSlot.Offhand` saved + restored** (added in v1.3.0, kept in v1.4.0).
- **`player.getTotalExperience()` + `player.resetLevel()`** for XP restore — much more accurate than `addLevels()` deltas.
- **`@minecraft/server` 1.19.0** dependency (matches reference pack).
- **All three command layers** retained:
  - Layer 1: `CustomCommandRegistry` (Bedrock 1.21.80+, no Beta APIs, real `/rbd:*` slash commands with autocomplete)
  - Layer 2: `world.beforeEvents.chatSend` (older Bedrock, `!rbd` chat commands)
  - Layer 3: `RBD Notebook` item UI (universal fallback — right-click the writable_book to open a button menu)

### Fixed
- `playReturnByDeathSound` no longer ignores `CONFIG.soundVolume` (v1.3.0 regression).
- Death log records now include the actual death cause (v1.3.0 regression).
- `/rbd:radius` slash command now registers (was missing from v1.3.0's `opNumeric` list).
- `status` command output now matches the v1.2.5 layout (was truncated in v1.3.0).

### File layout
New folder: `bedrock-v1.4.0/` containing `return_by_death_BP/` and `return_by_death_RP/`. Previous folders (`bedrock-edition/`, `bedrock-edition-v1.3/`, `bedrock-v1.3.1/`) are kept for historical reference; do not install multiple versions side-by-side (same pack UUIDs — Bedrock will replace the older one).

### Minimum engine version
- Bedrock 1.21.50+ recommended (script API 1.19.0)
- Bedrock 1.21.80+ required for Layer 1 (`/rbd:*` slash commands); Layers 2 + 3 work on older versions

---

## [1.3.1] — 2026 — Minimal port
Stripped the v1.3.0 rewrite down to the bare minimum: plays the iconic RBD sound when any player dies, nothing else. Server-side install — all players hear it. This was an emergency release to ship *something* working after v1.3.0 proved unstable in real-world testing.

---

## [1.3.0] — 2026 — Complete rewrite
Rebuilt the behavior pack from scratch based on a proven open-source RBD reference pack. Key architectural changes:
- `world.afterEvents.entityDie` (instead of `playerDie`) for death detection
- 1-tick polling fallback that checks HP `< 0.1`
- `GLOBAL_REWIND_ACTIVE` mutex to prevent double-restore
- Auto gamerule setup at startup
- Migrated to `EntityComponentTypes.*` constants
- Added `EquipmentSlot.Offhand` to saved equipment
- Used `player.getTotalExperience()` / `resetLevel()` for XP
- Bumped `@minecraft/server` to 1.19.0

**Regression note**: in the rewrite, `broadcastRadius`, the particle beacon ring, death cause extraction, sound volume/pitch application, and several `status` command fields were accidentally dropped. These are all restored in v1.4.0.

---

## [1.2.5] — HOTFIX
### Fixed
- **"RBD not working after first save"** — `save.health` could be `0` due to a race condition (save captured at the exact moment of death). `restoreSave` now clamps health to a minimum of 1 (falls back to max 20 if save was 0) and hunger to a minimum of 6 so the player can sprint/heal.
- **"Spawning outside the RBD spawn point"** — Bedrock's respawn logic could override the first teleport on ticks 2-3. v1.2.5 now teleports **TWICE**: once after 5 ticks (full restore) and once after 15 ticks (confirmation teleport to ensure the position sticks).
- **v1.2.4 regression**: `sound_definitions.json` had `max_distance:10000` + `volume:4.0` which caused the resource pack to fail to load on some Bedrock versions, breaking the whole script. Rolled back to safe `volume: 1.0` — the OGG itself is already 6x louder from v1.2.4's boost.

### Added
- `/rbd forcerestore` — manually trigger a restore from save point (use if auto-restore fails)
- `/rbd debug_save` — show save point details (position, rotation, dimension, vitals, inventory count, effects, fire state, age of save, distance from save)
- Detailed logging in `restoreSave` for troubleshooting

### Changed
- All `playSound` calls wrapped in `try/catch` so sound issues never break death/respawn logic.

---

## [1.2.4] — HOTFIX
### Fixed
- RBD sound not playing — boosted sound_definitions volume + max_distance to broadcast loudness.

### Regression
- The boosted `max_distance:10000` + `volume:4.0` values caused resource pack load failures on some Bedrock versions, breaking the entire script. Fixed in v1.2.5 by rolling back the values while keeping the boosted OGG file.

---

## [1.2.3] — HOTFIX
Initial public release of the "double-teleport" fix for the save point not sticking after respawn. Same bug fixes that v1.2.5 documents above — v1.2.5 is essentially v1.2.3 with the v1.2.4 sound regression also fixed.

---

## [1.2.2] — HOTFIX
### Fixed
- **Layer 1 (`CustomCommandRegistry`) was completely broken in v1.2.1** — it registered commands but used a non-existent `system.afterEvents.customCommand` event to handle execution, so all `/rbd:*` slash commands returned "Unknown command". Fixed by passing the execution callback directly as the second argument to `registerCommand()` per the Bedrock Wiki / MS Learn docs.
- Added `cheatsRequired: false` so commands work without cheats enabled.
- Added `CommandPermissionLevel` enum import + `mandatoryParameters` support for `/rbd:named <name>`, `/rbd:interval <sec>`, etc.

---

## [1.2.1] — PATCH
### Added — Bedrock chat commands via 3 layers (with graceful fallback)
- **Layer 1**: `CustomCommandRegistry` via `system.beforeEvents.startup` (Bedrock 1.21.80+) — real `/rbd` slash commands with autocomplete, work in command blocks, NO Beta APIs needed. (Note: execution handler was broken — see v1.2.2 above.)
- **Layer 2**: `world.beforeEvents.chatSend` fallback (older Bedrock) — the classic `!rbd` chat handler. Wrapped in try/catch with logging.
- **Layer 3**: `RBD Notebook` item UI (universal fallback) — player gets a `writable_book` renamed "RBD Notebook" on join. Right-click opens an `ActionFormData` with all commands as buttons. Works on console, mobile, no chat needed.

All event subscriptions are wrapped in try/catch with `console.warn()` logging so the script never silently dies. Use `!rbd debug` or `/rbd debug` to see which layers are active.

### Added — Tier 1 RBD flavor
- **Witch scent**: dark soul particles drift around you for 60 seconds after each death
- **Death quotes**: random Subaru-style quote appears in chat on death
- **Heartbeat**: deep heartbeat sound plays when your HP is below 6 (3 hearts)
- **Witch watching**: every 5th death, action bar shows "The Witch of Envy is watching..."

---

## [1.2.0] — Feature update
- Default 20-second save interval (configurable via `/rbd interval <sec>`)
- Bedrock potion effect + fire tick saving (restored on rewind)
- `/rbd revert` — teleport to save point without dying
- `/rbd lastdeath` — show most recent death
- `/rbd testsound` — play the RBD sound to verify it's working
- Named save points: `/rbd named <name>`, `/rbd named list`, `/rbd named delete <name>`

---

## [1.1.0] — Major feature update
- Config commands (`/rbd interval`, `/rbd cooldown`, `/rbd broadcast`, `/rbd volume`, etc.)
- Death counter (`/rbd loops`)
- Particle beacon at the save point
- Named save points
- Action bar cooldown display

---

## [1.0.0] — Initial release
- Core Return By Death mechanic: every 20 seconds, capture player state (position, dimension, rotation, health, hunger, XP level, inventory, equipment). On death, rewind to the save point with everything you had at that moment.
- Iconic "Return By Death" sound plays to all players on death.
- Java Edition (Fabric) + Bedrock Edition (incl. Pocket Edition).
