# AGENTS.md

## Project Overview

Warhammer 40k Combat Math — a mobile-first PWA that calculates attack outcomes for Warhammer 40,000 tabletop games. Users upload BattleScribe roster JSON files for two armies, pick an attacking unit/weapon and a defending unit, and the app displays the full combat math pipeline (hit rolls, wound rolls, saves, damage).

## Tech Stack

- **Framework**: Preact (with hooks)
- **Build**: Vite 8, TypeScript 6
- **Styling**: Tailwind CSS 4 + DaisyUI 5
- **PWA**: vite-plugin-pwa (service worker, manifest, offline support)
- **No backend** — all state is client-side (localStorage for roster persistence)

## Architecture

```
src/
├── app.tsx              # Root component, manages combat + battle state
├── main.tsx             # Entry point, renders App
├── index.css            # Tailwind import
├── types/
│   ├── roster.ts        # Roster interfaces (ParsedWeapon, ParsedUnit, ParsedRoster)
│   ├── battle.ts        # Battle tracking types (BattleState, UnitWoundState, AttackAction, etc.)
│   └── rules.ts         # Rules engine types (RuleDefinition, RuleEffects, KeywordAttachment, CombatOptions)
├── lib/
│   ├── rules/
│   │   ├── types are in ../types/rules.ts
│   │   ├── keywords.ts  # Keyword normalisation, attachment resolution, rule targeting
│   │   ├── library.ts   # STARTER_RULES: core weapon/unit abilities, stratagems, buff templates
│   │   ├── engine.ts    # Rule matching → ResolvedProfile → expected damage
│   │   ├── dice.ts      # Dice expression parsing ("2D6+1")
│   │   ├── validate.ts  # Validates rules read from storage or an imported file
│   │   ├── fixtures.ts  # Test fixtures
│   │   └── *.test.ts    # Engine + keyword tests (vitest)
│   ├── combat-math.ts   # Presentation layer over the engine (formatting only)
│   ├── battle-state.ts  # Battle state management (round/phase tracking, damage application)
│   ├── roster-parser.ts # Parses BattleScribe JSON export into typed roster data
│   ├── rules-storage.ts # localStorage + export payload: rules, attachments, pinned rules
│   └── storage.ts       # localStorage helpers for roster persistence
└── components/
    ├── AttackSummary.tsx # Attack breakdown, situational toggles, rule toggles
    ├── BurgerMenu.tsx    # Settings/roster management menu
    ├── KeywordPicker.tsx # Searchable keyword multi-select, sourced from the loaded armies
    ├── ProfilePanel.tsx  # Collapsible unit profiles: stats, wounds +/-, battle-shock, abilities
    ├── RosterUpload.tsx  # File upload UI for BattleScribe JSON
    ├── RulesPage.tsx     # Homebrew rules, keyword attachments, rule library
    ├── UnitPicker.tsx    # Unit selection dropdown (shows skull for dead units)
    ├── WeaponSelector.tsx # Weapon selection for the attacking unit
    └── WoundInput.tsx   # Wound input + model removal recommendations + attack confirmation
```

## Screen Layout

The combat screen is deliberately split:

- **Attacker | swap | Defender** bar, then the **collapsible profile panel**. The panel owns
  everything that is not part of resolving the current attack: full stat lines, models and
  wounds remaining (a single +/- total — only one model in a unit can be damaged at a time),
  battle-shock, roster attachments, datasheet abilities and keywords. Collapsed, it shows model
  counts only.
- **Combat area** below it shows only what changes a number in this attack. A rule that just
  prints a reminder never gets a toggle here; re-rolls, modifiers and crit changes do. Options
  such as battle-shock are fed in from the profile panel instead of being duplicated as toggles.

## Rules Engine

All game logic lives in `src/lib/rules`. `combat-math.ts` only formats output; no
component contains rules logic.

- **One rule shape.** Weapon abilities, unit abilities, stratagems, detachment rules and
  homebrew are all `RuleDefinition`s. They differ by `source`, `conditions`, and whether
  they are `manual` (need switching on per attack).
- **Pipeline.** `resolveAttack(input)` → resolve attachments → match rules → merge effects
  into a `ResolvedProfile` → `estimateAttack(profile)`. Each stage is pure and tested.
- **Keyword attachments.** A `KeywordAttachment` pins keywords (and optionally rule ids)
  onto a set of units, modelling Attached Units (19.03): the attached unit has every keyword
  of both units, so keyword-targeted rules apply to the whole squad. Attachments are also
  how datasheet abilities (which BattleScribe does not export) reach the engine — tag a unit
  with `Stealth` and the Stealth rule starts applying.
- **Rule targeting.** `global` | `keyword` | `unit`, plus rules granted directly through an
  attachment. There is no separate faction mode: a faction keyword is just a keyword, and
  BattleScribe's "Faction: " category prefix is ignored when matching. The keyword list in the UI
  is parsed from the loaded armies (`collectKeywords`).
- **Conventions.** `hitModifier`/`woundModifier` are always from the attacker's point of
  view (positive = better for the attacker). AP is stored unsigned. Total hit and wound
  modifiers are capped at ±1 (`MODIFIER_CAP`).
- **Adding a rule:** append to the right array in `library.ts`. Use `compute` when the
  effect depends on the weapon's ability value (Sustained Hits X, Melta X, Anti-X Y+).


## Key Design Decisions

- **Rules as data**: every rule is a `RuleDefinition` matched against an attack context. See
  the Rules Engine section above. Adding a keyword or ability means appending to
  `lib/rules/library.ts`, not editing the calculation.
- **Attack dice are per weapon, not per model** (04.02). `ParsedWeapon.count` is summed from the
  roster's weapon `number` fields, so a Shas'vre with twin fusion blasters counts 2 and a single
  heavy weapon in a five-model squad counts 1. The engine multiplies attacks by that count, and
  the UI scales it down as models die.
- **Averages, not distributions**: variable characteristics ("D6+1") are kept as strings for
  display and reduced to averages when estimating. `estimateAttack` returns expected values.
- **Roster format**: BattleScribe JSON export. The parser reads unit profiles (M/T/Sv/W/LD/OC/InSv),
  weapons with counts and ranges, datasheet abilities, keywords and points from the nested
  selection tree, and records `warnings` instead of silently guessing.
- **Attachments are never guessed**: a Leader/Support ability only says a Character *can* join a
  unit, and exports do not record who actually joined whom. Those pairings are surfaced as
  one-tap suggestions on the Attachments tab (`ParsedRoster.attachmentCandidates`) and nothing is
  applied until the user says so. Only an explicit marker — a leader nested inside its bodyguard
  unit — lands in `ParsedRoster.attachments` and is applied. Everything else is a keyword rule the
  user writes, which is what the rules engine is for.
- **This edition's cover rule**: the benefit of cover worsens the attack's BS by 1 (13.08); it
  does not improve saves. Cover is resolved centrally in the engine so `[IGNORES COVER]` wins
  regardless of rule ordering.
- **Battle-shock is state, not a rule**: it lives on `UnitWoundState`, is toggled on the profile
  panel, and feeds the `attackerBattleShocked`/`targetBattleShocked` options for homebrew rules
  that care.

## Warhammer 40k Rules Reference

A knowledge base of the Warhammer 40k Core Rules is indexed and available for semantic search. Use it to verify game mechanics (wound threshold tables, weapon keyword effects, save calculations, etc.) when implementing combat logic.

## Conventions

- Components are functional with Preact hooks (`useState`, `useEffect`)
- Use DaisyUI component classes (e.g., `btn`, `btn-primary`, `card`) for UI elements
- Tailwind utility classes for layout and spacing
- Types are defined in `src/types/` and imported as `type` imports
- Tests use vitest and live next to the code as `*.test.ts` (`npm test`)
- There is no persisted-data migration path: storage is validated on read and bad data is dropped
- No linter/formatter config exists — follow existing code style (2-space indent, single quotes, no semicolons in TSX)
- Interactive controls need accessible names (`aria-label` on icon-only buttons and toggles)

## Commands

- `npm run dev` — Start dev server
- `npm run build` — Type-check + production build
- `npm test` — Run the test suite once
- `npm run test:watch` — Watch mode
- `npm run preview` — Preview production build locally

## Rules Covered

Weapon abilities: Anti-X, Assault, Blast, Cleave, Close-Quarters/Pistol, Devastating Wounds,
Extra Attacks, Hazardous, Heavy, Ignores Cover, Indirect Fire, Lance, Lethal Hits, Melta,
One Shot, Precision, Psychic, Rapid Fire, Sustained Hits, Torrent, Twin-linked.

Unit abilities (keyword-driven): Stealth, Lone Operative, Fights First, Deadly Demise, Deep
Strike, Infiltrators, Scouts, Leader, Support, Firing Deck, Feel No Pain. Reminder-only ones are
shown on the profile panel; Stealth changes the maths so it appears in the combat readout.

Core mechanics: benefit of cover, modifier cap, critical hits/wounds, mortal wounds, invulnerable
saves, Feel No Pain. Battle-shock is tracked as unit state rather than a rule.

Core stratagems: Command Re-roll, Epic Challenge, Insane Bravery, Explosives, Crushing Impact,
Rapid Ingress, Fire Overwatch, Snap Shooting, Smokescreen, Heroic Intervention, Counteroffensive.

Plus ~30 buff/debuff templates covering the shapes most army, detachment and enhancement rules
reduce to.
