/**
 * Rules engine types.
 *
 * A `RuleDefinition` is the single unit of currency in the engine. Weapon
 * abilities, unit (core) abilities, stratagems, detachment rules and
 * user-authored homebrew are all the same shape — they only differ in their
 * `source`, their `conditions` and how they are activated.
 *
 * Rule *targeting* answers "which units does this rule belong to". Keyword
 * targeting is the important one: an attachment (a Leader joining a squad)
 * confers keywords onto the bodyguard unit, so every keyword-targeted rule
 * immediately starts applying to the attached unit as well. See
 * `KeywordAttachment` and `lib/rules/keywords.ts`.
 */

import type { ParsedUnit, ParsedWeapon, WeaponKeyword } from './roster'

// --- Combat options -------------------------------------------------------

/**
 * Situational facts about the attack that rules can key off. Rules declare
 * which options they need via `conditions.options`, and the UI only renders
 * toggles for options that some candidate rule actually cares about.
 */
export const COMBAT_OPTION_KEYS = [
  'inHalfRange',
  'remainedStationary',
  'setUpThisTurn',
  'unengaged',
  'advanced',
  'charged',
  'indirectFiring',
  'spotterAvailable',
  'snapShooting',
  'targetInCover',
  'singleTarget',
  'targetBattleShocked',
  'attackerBattleShocked',
  'targetBelowHalfStrength',
  'attackerBelowHalfStrength',
  'targetIsMarked',
] as const

export type CombatOptionKey = (typeof COMBAT_OPTION_KEYS)[number]

export type CombatOptions = Record<CombatOptionKey, boolean>

export interface CombatOptionDef {
  key: CombatOptionKey
  label: string
  hint: string
  /** Options that are true more often than not start switched on. */
  default: boolean
}

export const COMBAT_OPTION_DEFS: CombatOptionDef[] = [
  { key: 'inHalfRange', label: 'Half Range', hint: 'Target within half the weapon’s range', default: false },
  { key: 'remainedStationary', label: 'Stationary', hint: 'No model moved more than 3" this turn', default: false },
  { key: 'setUpThisTurn', label: 'Arrived', hint: 'Unit was set up on the battlefield this turn', default: false },
  { key: 'unengaged', label: 'Unengaged', hint: 'Attacking unit is not within Engagement Range', default: true },
  { key: 'advanced', label: 'Advanced', hint: 'Attacking unit made an Advance move this turn', default: false },
  { key: 'charged', label: 'Charged', hint: 'Attacking unit made a charge move this turn', default: false },
  { key: 'indirectFiring', label: 'Indirect', hint: 'Shooting using indirect shooting (10.07)', default: false },
  { key: 'spotterAvailable', label: 'Spotter', hint: 'Target visible to another friendly unit', default: false },
  { key: 'snapShooting', label: 'Snap Shot', hint: 'Shooting using snap shooting (15.09)', default: false },
  { key: 'targetInCover', label: 'Cover', hint: 'Target has the benefit of cover (13.08)', default: false },
  { key: 'singleTarget', label: 'Single Target', hint: 'All of this weapon’s attacks hit one unit', default: true },
  { key: 'targetBattleShocked', label: 'Target Shocked', hint: 'Target unit is battle-shocked', default: false },
  { key: 'attackerBattleShocked', label: 'Attacker Shocked', hint: 'Attacking unit is battle-shocked', default: false },
  { key: 'targetBelowHalfStrength', label: 'Target ≤ Half', hint: 'Target is at or below half-strength', default: false },
  { key: 'attackerBelowHalfStrength', label: 'Attacker ≤ Half', hint: 'Attacker is at or below half-strength', default: false },
  { key: 'targetIsMarked', label: 'Marked Target', hint: 'Target selected by a marking rule (Oath of Moment, Hunt, etc.)', default: false },
]

export function defaultCombatOptions(): CombatOptions {
  const out = {} as CombatOptions
  for (const def of COMBAT_OPTION_DEFS) out[def.key] = def.default
  return out
}

// --- Effects --------------------------------------------------------------

/** Dice expression such as 2, 'D6', 'D3+1', '2D6'. */
export type DiceExpr = string | number

export type RerollMode = 'none' | 'ones' | 'failed'

export interface RuleEffects {
  // Attack volume
  /** Extra attacks added to the weapon's A characteristic (per weapon). */
  bonusAttacks?: DiceExpr
  /** Extra attack dice per five models in the target unit (Blast / Cleave). */
  attackDicePerFiveTargetModels?: number

  // Hit step
  /** Positive = better for the attacker (+1 to hit). */
  hitModifier?: number
  hitRerolls?: RerollMode
  cannotRerollHits?: boolean
  autoHit?: boolean
  /** Unmodified hit roll must be at least this to hit (Indirect Fire, Snap Shooting). */
  unmodifiedHitFloor?: number
  /** Psychic: ignore any or all modifiers to the hit roll / BS. */
  ignoreHitModifiers?: boolean
  /** Critical hit on this unmodified roll or better (default 6). */
  critHitOn?: number
  sustainedHits?: DiceExpr
  lethalHits?: boolean

  // Wound step
  /** Positive = better for the attacker (+1 to wound). */
  woundModifier?: number
  woundRerolls?: RerollMode
  strengthModifier?: number
  /** Critical wound on this unmodified roll or better (default 6). */
  critWoundOn?: number
  /** Anti-X Y+: critical wound on Y+ when the target has keyword X. */
  anti?: { keyword: string; threshold: number }
  devastatingWounds?: boolean
  /** Wound roll is skipped (rare; note that auto-wounds can never be critical). */
  autoWound?: boolean

  // Save step
  /** Positive = more armour penetration (AP is stored unsigned everywhere). */
  apModifier?: number
  ignoresCover?: boolean
  /** Defender side: the unit has the benefit of cover (Stealth, Smokescreen). */
  grantsCover?: boolean
  /** Defender side: best invulnerable save granted. */
  invulnerableSave?: number
  /** Defender side, positive = better save (+1 to save rolls). */
  saveModifier?: number
  cannotUseInvulnerableSave?: boolean

  // Damage step
  /** Added to the weapon's D characteristic. */
  damageModifier?: number
  /** Defender side: subtracted from the D characteristic (minimum 1). */
  damageReduction?: number
  /** Defender side: halve the D characteristic (rounding up). */
  halveDamage?: boolean
  /** Defender side: Feel No Pain X+. */
  feelNoPain?: number
  /** Flat mortal wounds added to the estimate (Explosives, Crushing Impact...). */
  flatMortalWounds?: DiceExpr

  // Target profile
  /** Defender side, positive = tougher. */
  toughnessModifier?: number

  /** Free-text reminders surfaced in the UI. */
  notes?: string[]
}

// --- Targeting ------------------------------------------------------------

/**
 * Rule ownership.
 *
 * Faction keywords are just keywords, so there is one keyword selector rather
 * than separate faction and keyword modes. `keywords` holds display-form
 * keywords taken from the loaded armies; matching is case- and prefix-insensitive
 * ("Faction: T'au Empire" matches "T'au Empire").
 */
export type RuleTargetType = 'global' | 'keyword' | 'unit'

export interface RuleTarget {
  type: RuleTargetType
  /** Keywords the owning unit must have, e.g. ['Adeptus Astartes', 'Infantry']. */
  keywords?: string[]
  /** 'any' (default) matches units holding at least one keyword; 'all' requires every keyword. */
  keywordMatch?: 'any' | 'all'
  /** Explicit unit ids (from the loaded rosters). */
  unitIds?: string[]
}

// --- Conditions -----------------------------------------------------------

export interface KeywordQuery {
  any?: string[]
  all?: string[]
  none?: string[]
}

export interface RuleConditions {
  /** Only applies in this phase. */
  phase?: 'shooting' | 'fight'
  weaponType?: 'ranged' | 'melee'
  /** The weapon must have this ability for the rule to apply. */
  weaponKeyword?: string
  /** The weapon must have at least one of these abilities. */
  weaponKeywordAny?: string[]
  attackerKeywords?: KeywordQuery
  targetKeywords?: KeywordQuery
  /** Every listed option must be true. */
  options?: CombatOptionKey[]
  /** Every listed option must be false. */
  notOptions?: CombatOptionKey[]
  /**
   * Options the rule reads without requiring them, i.e. ones its `compute` looks
   * at. Declaring them is what puts them in front of the user — a rule that reads
   * an option nobody can toggle has a dead branch.
   */
  usesOptions?: CombatOptionKey[]
  /** Minimum number of models in the target unit. */
  minTargetModels?: number
}

// --- Rule definition ------------------------------------------------------

export type RuleSource =
  | 'weapon-ability'
  | 'core-ability'
  | 'stratagem'
  | 'army-rule'
  | 'detachment'
  | 'enhancement'
  | 'custom'

/**
 * `attacker` rules modify attacks the owning unit *makes*.
 * `defender` rules modify attacks *made against* the owning unit.
 * `both` rules apply either way (e.g. an aura granting re-rolls and FNP).
 */
export type RuleSide = 'attacker' | 'defender' | 'both'

export interface RuleDefinition {
  id: string
  name: string
  source: RuleSource
  /** Core rules reference, e.g. '24.36'. */
  ref?: string
  description?: string
  side: RuleSide
  /** Which units own this rule. Library rules default to 'global' + conditions. */
  target?: RuleTarget
  conditions?: RuleConditions
  effects: RuleEffects
  /**
   * Library-only hook: derives effects from the weapon/target (Sustained Hits X,
   * Anti-X Y+, Melta X ...). Not serialisable, so user rules never set it.
   */
  compute?: (ctx: RuleComputeContext) => RuleEffects | null
  /** Requires deliberate activation each attack (stratagems, once-per-turn buffs). */
  manual?: boolean
  /** User rules can be switched off entirely without deleting them. */
  enabled?: boolean
  /** Library rules cannot be edited or deleted from the UI. */
  builtIn?: boolean
}

export interface RuleComputeContext {
  attacker: ParsedUnit
  defender: ParsedUnit
  weapon: ParsedWeapon
  /** The weapon ability that matched `conditions.weaponKeyword`, if any. */
  weaponKeyword: WeaponKeyword | null
  attackerKeywords: string[]
  defenderKeywords: string[]
  options: CombatOptions
  phase: 'shooting' | 'fight'
}

// --- Attachments ----------------------------------------------------------

/**
 * A bundle of keywords (and optionally rules) conferred onto one or more units.
 *
 * This models Attached Units (19.03: "an attached unit has all of the keywords
 * of all of its component units") but is deliberately more general: any set of
 * keywords can be pinned onto any set of units, which is also how you model
 * enhancements, wargear, detachment tags and one-off mission effects.
 */
export interface KeywordAttachment {
  id: string
  name: string
  /** Keywords conferred on every unit in `unitIds`. */
  keywords: string[]
  /** Rule ids conferred on every unit in `unitIds` (a Leader's abilities). */
  ruleIds: string[]
  /** Units that receive the keywords/rules. */
  unitIds: string[]
  /**
   * Optional source unit (the Leader). Its keywords are merged in
   * automatically, and it inherits the bodyguard unit's keywords in return.
   */
  sourceUnitId?: string | null
  enabled: boolean
}

/** A unit with attachment-conferred keywords and rules folded in. */
export interface EffectiveUnitKeywords {
  keywords: string[]
  /** Rule ids granted explicitly by an attachment. */
  grantedRuleIds: string[]
  /**
   * Other units that form part of the same attached unit. Rules belonging to any
   * of them apply to this unit too (19.04).
   */
  partnerUnitIds: string[]
  /** Names of the attachments that contributed, for display. */
  attachmentNames: string[]
}
