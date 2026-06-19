# Return By Death v1.4.0 — Restoration Release

**Brings back the complete v1.2.5 feature set on top of the proven v1.3.0 death-detection foundation.**

After v1.3.1 stripped everything down to "just plays sound on death", this release merges every feature back together in a single, working package.

## Install

1. Download `return_by_death_v1.4.0.mcaddon` (attached to this release).
2. Double-click the file — Minecraft Bedrock will import both the behavior pack and the resource pack automatically.
3. Create a world (or edit an existing one) → enable **Beta APIs** (recommended, for full feature access) → activate both "Return By Death" packs in Behavior Packs and Resource Packs.
4. Done. The mod runs automatically — you'll get a save point every 20 seconds and rewind on death.

## What's New in v1.4.0

### Foundation kept (from v1.3.0)
- `entityDie` event + 1-tick polling fallback — most reliable death detection
- `GLOBAL_REWIND_ACTIVE` mutex — prevents double-restore when both methods fire
- Auto gamerule setup at startup (`doimmediaterespawn`, `keepinventory`, `showdeathmessages`)
- Modern `EntityComponentTypes.*` constants (not hardcoded strings)
- `EquipmentSlot.Offhand` saved + restored
- `player.getTotalExperience()` + `resetLevel()` for accurate XP restore
- `@minecraft/server` 1.19.0

### Features restored (from v1.2.5)
- **`broadcastRadius` config + `/rbd radius <blocks>` command** — was silently dropped in v1.3.0; death broadcasts now respect a configurable radius (`-1` = global)
- **Full particle beacon ring** — 4-direction `basic_crit_particle` ring around the save point (v1.3.0 only kept the column + endrod)
- **Death cause extraction** — `triggerReturn` now reads `ev.damageSource` and the death log records real causes (fire, fall, lava, etc.) instead of the hardcoded `"unknown"` from v1.3.0
- **Sound volume + pitch applied to `playSound`** — v1.3.0 hardcoded `1.0`, silently breaking the `!rbd volume` / `!rbd pitch` op commands. The OGG itself is still the boosted `-14dB` file from v1.2.4.
- `BEACON_INTERVAL_TICKS` and `BEACON_MAX_DISTANCE` named constants
- Witch scent extra drift particles (3 random `soul_particle` drifts around the player)
- Heartbeat volume scaling (0.4 → 1.0 based on proximity to death)
- `actionBarCooldown` config toggle + display loop
- `status` command shows ALL config fields (was truncated in v1.3.0)

### Bug fixes
- `playReturnByDeathSound` no longer ignores `CONFIG.soundVolume`
- Death log records include the actual death cause
- `/rbd:radius` slash command now registers (was missing from v1.3.0's `opNumeric` list)
- `status` command output matches v1.2.5 layout

## Three command layers (all working)

| Layer | How | Works on |
|-------|-----|----------|
| 1 | `/rbd:save`, `/rbd:info`, etc. (slash commands with autocomplete) | Bedrock 1.21.80+ |
| 2 | `!rbd save`, `!rbd info`, etc. (chat commands) | Older Bedrock (Beta APIs recommended) |
| 3 | RBD Notebook item — right-click the writable_book in your inventory | Universal (console, mobile, all versions) |

Use `!rbd debug` or `/rbd:debug` to see which layers are active.

## Commands

**Player commands**: `save`, `info`, `status`, `loops`, `looplog`, `lastdeath`, `revert`, `testsound`, `reset`, `particles on|off`, `debug`, `forcerestore`, `debug_save`, `help`, `named <name>`, `named list`, `named delete <name>`

**Op commands**: `interval <1-600>`, `cooldown <0-3600>`, `broadcast on|off`, `radius <-1+>`, `volume <0-100>`, `pitch <50-200>`, `maxnamed <0-20>`, `mod on|off`

## Requirements

- Minecraft Bedrock 1.21.50+ (script API 1.19.0)
- Bedrock 1.21.80+ required for Layer 1 slash commands (Layers 2 + 3 work on older versions)

## File structure

This release contains:
- `return_by_death_BP/` — behavior pack with `scripts/main.js` (the mod logic)
- `return_by_death_RP/` — resource pack with `sounds/return_by_death.ogg` (the iconic RBD sound, boosted to -14dB broadcast standard)

Both packs share version-matching UUIDs, so installing v1.4.0 automatically replaces any previous version.

---

**Full changelog**: see [CHANGELOG.md](https://github.com/TheStrongestOfTomorrow/return-by-death/blob/main/CHANGELOG.md) in the repo for the complete version history (v1.0.0 → v1.4.0).
