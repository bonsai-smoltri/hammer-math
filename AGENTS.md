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
├── app.tsx              # Root component, manages combat state (attacker/defender/weapon selection)
├── main.tsx             # Entry point, renders App
├── index.css            # Tailwind import
├── types/roster.ts      # TypeScript interfaces (ParsedWeapon, ParsedUnit, ParsedRoster)
├── lib/
│   ├── combat-math.ts   # Core calculation engine — modifier pipeline pattern
│   ├── roster-parser.ts # Parses BattleScribe JSON export into typed roster data
│   └── storage.ts       # localStorage helpers for roster persistence
└── components/
    ├── AttackSummary.tsx # Displays full combat result breakdown
    ├── BurgerMenu.tsx    # Settings/roster management menu
    ├── DefenderStats.tsx # Shows defender's defensive profile
    ├── ModelCounter.tsx  # Adjusts active model count for attacker
    ├── RosterUpload.tsx  # File upload UI for BattleScribe JSON
    ├── UnitPicker.tsx    # Unit selection dropdown
    └── WeaponSelector.tsx # Weapon selection for the attacking unit
```

## Key Design Decisions

- **Modifier pipeline**: `combat-math.ts` uses a declarative modifier array (`AttackModifier[]`). Each modifier has an `isActive` predicate and an `apply` function that transforms `AttackState`. This makes adding new weapon keywords straightforward — just append to the `MODIFIERS` array.
- **String-based attacks/damage**: Attacks and damage are stored as strings (e.g., "D6+1", "D3") since 40k uses variable dice expressions. The UI displays these as-is rather than calculating expected values.
- **Roster format**: Expects BattleScribe JSON export format. The parser extracts unit profiles, weapons, keywords, and points from the nested selection tree.

## Warhammer 40k Rules Reference

A knowledge base of the Warhammer 40k Core Rules is indexed and available for semantic search. Use it to verify game mechanics (wound threshold tables, weapon keyword effects, save calculations, etc.) when implementing combat logic.

## Conventions

- Components are functional with Preact hooks (`useState`, `useEffect`)
- Use DaisyUI component classes (e.g., `btn`, `btn-primary`, `card`) for UI elements
- Tailwind utility classes for layout and spacing
- Types are defined in `src/types/` and imported as `type` imports
- No test framework is currently set up
- No linter/formatter config exists — follow existing code style (2-space indent, single quotes, no semicolons in TSX)

## Commands

- `npm run dev` — Start dev server
- `npm run build` — Type-check + production build
- `npm run preview` — Preview production build locally

## Weapon Keywords Handled

Rapid Fire, Blast, Cleave, Torrent, Heavy, Lethal Hits, Sustained Hits, Lance, Twin-linked, Anti-X, Devastating Wounds, Ignores Cover, Melta, One Shot, Pistol/Close-Quarters, Assault, Extra Attacks, Hazardous, Precision, Indirect Fire, Psychic, Cover (as a combat option).
