import type { ParsedUnit, ParsedWeapon } from '../../types/roster'
import type {
  CombatOptionKey,
  CombatOptions,
  KeywordAttachment,
  RerollMode,
  RuleDefinition,
  RuleEffects,
} from '../../types/rules'
import { defaultCombatOptions } from '../../types/rules'
import { STARTER_RULES } from './library'
import { addToExpression, averageDice, averageDiceOr, halveRoundingUp } from './dice'
import {
  buildUnitIndex,
  findWeaponKeyword,
  matchesKeywordQuery,
  normalizeKeyword,
  resolveUnitKeywords,
  targetMatchesUnit,
  weaponAbilityApplies,
} from './keywords'

/**
 * The rules engine.
 *
 * 1. `resolveAttack` folds attachments into both units' keyword lists.
 * 2. Every rule (library + homebrew) is tested against the resulting context.
 * 3. Surviving rules' effects are merged into a single `ResolvedProfile`.
 * 4. `estimateAttack` turns that profile into expected damage.
 *
 * Keeping steps 2-4 separate is what makes the engine testable: no display
 * strings are parsed to recover state, and nothing about the pipeline depends
 * on the UI.
 */

/** Modifiers to hit and wound rolls are capped at ±1 in total. */
export const MODIFIER_CAP = 1

export type Phase = 'shooting' | 'fight'

export interface AttackInput {
  attacker: ParsedUnit
  weapon: ParsedWeapon
  defender: ParsedUnit
  options?: Partial<CombatOptions>
  phase?: Phase
  /** Homebrew / imported rules. Library rules are always included. */
  rules?: RuleDefinition[]
  attachments?: KeywordAttachment[]
  /** Used to resolve attachment source units. Defaults to attacker + defender. */
  allUnits?: ParsedUnit[]
  /** Ids of manual rules (stratagems etc.) switched on for this attack. */
  activeManualRuleIds?: string[]
  /**
   * Manual rules the user keeps to hand. When set, other manual rules are
   * ignored entirely so they cannot clutter the toggle row or pull in options
   * nothing is using.
   */
  availableManualRuleIds?: string[]
  /**
   * How many copies of this weapon are firing. Defaults to the weapon's own
   * count from the roster, because attack dice are gathered per weapon (04.02).
   */
  weaponCount?: number
  includeLibrary?: boolean
}

export interface AppliedRule {
  rule: RuleDefinition
  /** Whether the rule was applied as an attacker-side or defender-side effect. */
  as: 'attacker' | 'defender'
  effects: RuleEffects
  /** Which unit owned the rule. */
  ownerUnitId: string
  /** True when the rule reached the unit through an attachment. */
  viaAttachment: boolean
}

export interface ResolvedProfile {
  // Attack volume
  attacksExpression: string
  attacksPerWeapon: number
  extraAttackDice: number
  weaponCount: number
  totalAttacks: number

  // Hit step
  autoHit: boolean
  baseHitThreshold: number
  hitModifier: number
  rawHitModifier: number
  hitThreshold: number
  /** Human-readable breakdown of where the hit modifiers came from. */
  hitModifierSources: string[]
  unmodifiedHitFloor: number | null
  hitReroll: RerollMode
  critHitOn: number
  sustainedHits: number
  lethalHits: boolean

  // Wound step
  strength: number
  toughness: number
  baseWoundThreshold: number
  woundModifier: number
  rawWoundModifier: number
  woundThreshold: number
  woundModifierSources: string[]
  woundReroll: RerollMode
  critWoundOn: number
  devastatingWounds: boolean
  autoWound: boolean

  // Save step
  ap: number
  armourSave: number
  invulnerableSave: number | null
  /** Best save the defender can take, or null when no save is possible. */
  effectiveSave: number | null
  savingWith: 'armour' | 'invulnerable' | 'none'
  targetHasCover: boolean

  // Damage step
  damageExpression: string
  damagePerWound: number
  feelNoPain: number | null
  woundsPerModel: number
  flatMortalWounds: number

  // Meta
  notes: string[]
  appliedRules: AppliedRule[]
}

export interface AttackEstimate {
  attacks: number
  hits: number
  criticalHits: number
  wounds: number
  criticalWounds: number
  unsavedWounds: number
  mortalWounds: number
  expectedDamage: number
  expectedModelsSlain: number
  /** True when Lethal Hits was used instead of rolling to wound for crits. */
  usedLethalHits: boolean
}

export interface ResolvedAttack {
  profile: ResolvedProfile
  estimate: AttackEstimate
  options: CombatOptions
  /** Rules that could apply but need switching on (stratagems, homebrew). */
  manualRules: RuleDefinition[]
  /** Options referenced by any candidate rule — drives which toggles the UI shows. */
  relevantOptions: CombatOptionKey[]
  attackerKeywords: string[]
  defenderKeywords: string[]
  attackerAttachments: string[]
  defenderAttachments: string[]
}

// --- Public entry point ---------------------------------------------------

export function resolveAttack(input: AttackInput): ResolvedAttack {
  const options: CombatOptions = { ...defaultCombatOptions(), ...(input.options ?? {}) }
  const phase: Phase = input.phase ?? (input.weapon.type === 'melee' ? 'fight' : 'shooting')
  const attachments = input.attachments ?? []
  const unitsById = buildUnitIndex(input.allUnits ?? [input.attacker, input.defender])

  const attackerKw = resolveUnitKeywords(input.attacker, attachments, unitsById)
  const defenderKw = resolveUnitKeywords(input.defender, attachments, unitsById)

  const candidates = [
    ...(input.includeLibrary === false ? [] : STARTER_RULES),
    ...(input.rules ?? []).filter((rule) => rule.enabled !== false),
  ]

  const ctx: MatchContext = {
    weapon: input.weapon,
    attacker: input.attacker,
    defender: input.defender,
    attackerKeywords: attackerKw.keywords,
    defenderKeywords: defenderKw.keywords,
    attackerGrantedRuleIds: attackerKw.grantedRuleIds,
    defenderGrantedRuleIds: defenderKw.grantedRuleIds,
    attackerPartnerIds: attackerKw.partnerUnitIds,
    defenderPartnerIds: defenderKw.partnerUnitIds,
    options,
    phase,
  }

  const matched = matchRules(candidates, ctx, input.activeManualRuleIds ?? [], input.availableManualRuleIds)
  const profile = buildProfile(input, matched.applied)
  const estimate = estimateAttack(profile)

  return {
    profile,
    estimate,
    options,
    manualRules: matched.manual,
    relevantOptions: matched.relevantOptions,
    attackerKeywords: attackerKw.keywords,
    defenderKeywords: defenderKw.keywords,
    attackerAttachments: attackerKw.attachmentNames,
    defenderAttachments: defenderKw.attachmentNames,
  }
}

// --- Rule matching --------------------------------------------------------

export interface MatchContext {
  weapon: ParsedWeapon
  attacker: ParsedUnit
  defender: ParsedUnit
  attackerKeywords: string[]
  defenderKeywords: string[]
  attackerGrantedRuleIds: string[]
  defenderGrantedRuleIds: string[]
  /** Units forming part of the same attached unit as the attacker/defender. */
  attackerPartnerIds: string[]
  defenderPartnerIds: string[]
  options: CombatOptions
  phase: Phase
}

interface MatchResult {
  applied: AppliedRule[]
  /** Rules that match except for needing manual activation. */
  manual: RuleDefinition[]
  relevantOptions: CombatOptionKey[]
}

export function matchRules(
  rules: RuleDefinition[],
  ctx: MatchContext,
  activeManualRuleIds: string[],
  availableManualRuleIds?: string[]
): MatchResult {
  const applied: AppliedRule[] = []
  const manual: RuleDefinition[] = []
  const relevantOptions = new Set<CombatOptionKey>()
  // 24.02: duplicated abilities are not cumulative.
  const seen = new Set<string>()

  for (const rule of rules) {
    for (const as of ['attacker', 'defender'] as const) {
      if (rule.side !== 'both' && rule.side !== as) continue
      if (rule.manual && availableManualRuleIds && !availableManualRuleIds.includes(rule.id)) continue

      const ownerUnit = as === 'attacker' ? ctx.attacker : ctx.defender
      const ownerKeywords = as === 'attacker' ? ctx.attackerKeywords : ctx.defenderKeywords
      const grantedIds =
        as === 'attacker' ? ctx.attackerGrantedRuleIds : ctx.defenderGrantedRuleIds
      const partnerIds = as === 'attacker' ? ctx.attackerPartnerIds : ctx.defenderPartnerIds

      const grantedByAttachment = grantedIds.includes(rule.id)
      const ownsDirectly = targetMatchesUnit(rule.target, ownerUnit.id, ownerKeywords)
      // A rule named against a Leader (or against the squad it joined) belongs to
      // the whole attached unit (19.04).
      const ownsViaPartner =
        !ownsDirectly && targetMatchesUnit(rule.target, ownerUnit.id, ownerKeywords, partnerIds)
      const viaAttachment = grantedByAttachment || ownsViaPartner

      if (!grantedByAttachment && !ownsDirectly && !ownsViaPartner) continue
      if (!structuralConditionsPass(rule, as, ctx)) continue

      // Collected before the option check so the UI can offer the toggles a rule
      // is waiting on. Rules that only print a reminder never need a toggle.
      if (hasMathematicalEffect(rule.effects) || rule.compute) {
        for (const option of rule.conditions?.options ?? []) relevantOptions.add(option)
        for (const option of rule.conditions?.notOptions ?? []) relevantOptions.add(option)
        for (const option of rule.conditions?.usesOptions ?? []) relevantOptions.add(option)
      }

      // Listed before the option check too: a stratagem you could use once the
      // situation is right should still appear in the toggle row.
      if (rule.manual) {
        if (!manual.some((r) => r.id === rule.id)) manual.push(rule)
        if (!activeManualRuleIds.includes(rule.id)) continue
      }

      if (!optionConditionsPass(rule, ctx)) continue

      // 24.02: multiple instances of the same ability are not cumulative, so a
      // rule contributes at most once per attack even if both units own it.
      const dedupeKey = normalizeKeyword(rule.name)
      if (seen.has(dedupeKey)) continue

      const effects = computeEffects(rule, ctx)
      if (!effects) continue

      seen.add(dedupeKey)
      applied.push({ rule, as, effects, ownerUnitId: ownerUnit.id, viaAttachment })
    }
  }

  return { applied, manual, relevantOptions: [...relevantOptions] }
}

/** Everything except the situational option toggles. */
function structuralConditionsPass(
  rule: RuleDefinition,
  as: 'attacker' | 'defender',
  ctx: MatchContext
): boolean {
  const c = rule.conditions
  if (!c) return true

  if (c.phase && c.phase !== ctx.phase) return false
  if (c.weaponType && c.weaponType !== ctx.weapon.type) return false

  if (c.weaponKeyword) {
    const kw = findWeaponKeyword(ctx.weapon, c.weaponKeyword)
    if (!kw) return false
    if (!weaponAbilityApplies(kw, ctx.defenderKeywords)) return false
  }

  if (c.weaponKeywordAny && c.weaponKeywordAny.length > 0) {
    const found = c.weaponKeywordAny.some((name) => {
      const kw = findWeaponKeyword(ctx.weapon, name)
      return kw !== null && weaponAbilityApplies(kw, ctx.defenderKeywords)
    })
    if (!found) return false
  }

  if (!matchesKeywordQuery(ctx.attackerKeywords, c.attackerKeywords)) return false
  if (!matchesKeywordQuery(ctx.defenderKeywords, c.targetKeywords)) return false

  if (c.minTargetModels !== undefined) {
    const models = as === 'attacker' ? ctx.defender.modelCount : ctx.attacker.modelCount
    if (models < c.minTargetModels) return false
  }

  return true
}

function optionConditionsPass(rule: RuleDefinition, ctx: MatchContext): boolean {
  const c = rule.conditions
  if (!c) return true
  if (c.options && !c.options.every((key) => ctx.options[key])) return false
  if (c.notOptions && c.notOptions.some((key) => ctx.options[key])) return false
  return true
}

function computeEffects(rule: RuleDefinition, ctx: MatchContext): RuleEffects | null {
  if (!rule.compute) return rule.effects

  const keywordName = rule.conditions?.weaponKeyword ?? null
  const computed = rule.compute({
    attacker: ctx.attacker,
    defender: ctx.defender,
    weapon: ctx.weapon,
    weaponKeyword: keywordName ? findWeaponKeyword(ctx.weapon, keywordName) : null,
    attackerKeywords: ctx.attackerKeywords,
    defenderKeywords: ctx.defenderKeywords,
    options: ctx.options,
    phase: ctx.phase,
  })
  if (!computed) return null
  return { ...rule.effects, ...computed }
}

// --- Effect merging -------------------------------------------------------

interface MergedEffects {
  bonusAttacks: number
  attackDicePerFive: number
  hitModifier: number
  hitReroll: RerollMode
  cannotRerollHits: boolean
  autoHit: boolean
  unmodifiedHitFloor: number | null
  ignoreHitModifiers: boolean
  critHitOn: number
  sustainedHits: number
  lethalHits: boolean
  woundModifier: number
  woundReroll: RerollMode
  strengthModifier: number
  critWoundOn: number
  devastatingWounds: boolean
  autoWound: boolean
  apModifier: number
  ignoresCover: boolean
  grantsCover: boolean
  invulnerableSave: number | null
  saveModifier: number
  cannotUseInvulnerableSave: boolean
  damageModifier: number
  damageReduction: number
  halveDamage: boolean
  feelNoPain: number | null
  flatMortalWounds: number
  toughnessModifier: number
  hitSources: string[]
  woundSources: string[]
  notes: string[]
}

const REROLL_RANK: Record<RerollMode, number> = { none: 0, ones: 1, failed: 2 }

function bestReroll(a: RerollMode, b: RerollMode): RerollMode {
  return REROLL_RANK[b] > REROLL_RANK[a] ? b : a
}

function mergeEffects(applied: AppliedRule[]): MergedEffects {
  const merged: MergedEffects = {
    bonusAttacks: 0,
    attackDicePerFive: 0,
    hitModifier: 0,
    hitReroll: 'none',
    cannotRerollHits: false,
    autoHit: false,
    unmodifiedHitFloor: null,
    ignoreHitModifiers: false,
    critHitOn: 6,
    sustainedHits: 0,
    lethalHits: false,
    woundModifier: 0,
    woundReroll: 'none',
    strengthModifier: 0,
    critWoundOn: 6,
    devastatingWounds: false,
    autoWound: false,
    apModifier: 0,
    ignoresCover: false,
    grantsCover: false,
    invulnerableSave: null,
    saveModifier: 0,
    cannotUseInvulnerableSave: false,
    damageModifier: 0,
    damageReduction: 0,
    halveDamage: false,
    feelNoPain: null,
    flatMortalWounds: 0,
    toughnessModifier: 0,
    hitSources: [],
    woundSources: [],
    notes: [],
  }

  for (const { rule, effects } of applied) {
    if (effects.bonusAttacks !== undefined) merged.bonusAttacks += averageDiceOr(effects.bonusAttacks, 0)
    if (effects.attackDicePerFiveTargetModels)
      merged.attackDicePerFive += effects.attackDicePerFiveTargetModels

    if (effects.hitModifier) {
      merged.hitModifier += effects.hitModifier
      merged.hitSources.push(`${signed(effects.hitModifier)} ${rule.name}`)
    }
    if (effects.hitRerolls) merged.hitReroll = bestReroll(merged.hitReroll, effects.hitRerolls)
    if (effects.cannotRerollHits) merged.cannotRerollHits = true
    if (effects.autoHit) merged.autoHit = true
    if (effects.unmodifiedHitFloor !== undefined) {
      // The most restrictive floor wins.
      merged.unmodifiedHitFloor =
        merged.unmodifiedHitFloor === null
          ? effects.unmodifiedHitFloor
          : Math.max(merged.unmodifiedHitFloor, effects.unmodifiedHitFloor)
    }
    if (effects.ignoreHitModifiers) merged.ignoreHitModifiers = true
    if (effects.critHitOn) merged.critHitOn = Math.min(merged.critHitOn, effects.critHitOn)
    // 24.02: instances of the same ability are not cumulative — take the best.
    if (effects.sustainedHits !== undefined)
      merged.sustainedHits = Math.max(merged.sustainedHits, averageDiceOr(effects.sustainedHits, 0))
    if (effects.lethalHits) merged.lethalHits = true

    if (effects.woundModifier) {
      merged.woundModifier += effects.woundModifier
      merged.woundSources.push(`${signed(effects.woundModifier)} ${rule.name}`)
    }
    if (effects.woundRerolls) merged.woundReroll = bestReroll(merged.woundReroll, effects.woundRerolls)
    if (effects.strengthModifier) merged.strengthModifier += effects.strengthModifier
    if (effects.critWoundOn) merged.critWoundOn = Math.min(merged.critWoundOn, effects.critWoundOn)
    if (effects.anti) merged.critWoundOn = Math.min(merged.critWoundOn, effects.anti.threshold)
    if (effects.devastatingWounds) merged.devastatingWounds = true
    if (effects.autoWound) merged.autoWound = true

    if (effects.apModifier) merged.apModifier += effects.apModifier
    if (effects.ignoresCover) merged.ignoresCover = true
    if (effects.grantsCover) merged.grantsCover = true
    if (effects.invulnerableSave)
      merged.invulnerableSave =
        merged.invulnerableSave === null
          ? effects.invulnerableSave
          : Math.min(merged.invulnerableSave, effects.invulnerableSave)
    if (effects.saveModifier) merged.saveModifier += effects.saveModifier
    if (effects.cannotUseInvulnerableSave) merged.cannotUseInvulnerableSave = true

    if (effects.damageModifier) merged.damageModifier += effects.damageModifier
    if (effects.damageReduction) merged.damageReduction += effects.damageReduction
    if (effects.halveDamage) merged.halveDamage = true
    if (effects.feelNoPain)
      merged.feelNoPain =
        merged.feelNoPain === null ? effects.feelNoPain : Math.min(merged.feelNoPain, effects.feelNoPain)
    if (effects.flatMortalWounds !== undefined)
      merged.flatMortalWounds += averageDiceOr(effects.flatMortalWounds, 0)

    if (effects.toughnessModifier) merged.toughnessModifier += effects.toughnessModifier

    // Battlefield-only reminders belong to the unit profile, not to this attack.
    if (affectsCombat(rule)) {
      for (const note of effects.notes ?? []) merged.notes.push(`${rule.name}: ${note}`)
    }
  }

  return merged
}

// --- Profile construction -------------------------------------------------

export function woundThresholdFor(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2
  if (strength > toughness) return 3
  if (strength === toughness) return 4
  if (strength * 2 <= toughness) return 6
  return 5
}

function clampModifier(value: number): number {
  return Math.max(-MODIFIER_CAP, Math.min(MODIFIER_CAP, value))
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`
}

function buildProfile(input: AttackInput, applied: AppliedRule[]): ResolvedProfile {
  const merged = mergeEffects(applied)
  const notes = [...merged.notes]
  const weapon = input.weapon
  const defender = input.defender

  // --- attacks
  const parsedAttacks = averageDice(weapon.attacks)
  if (parsedAttacks === null) {
    notes.push(`Could not read the A characteristic "${weapon.attacks}" — assuming 1.`)
  }
  const extraAttackDice =
    merged.attackDicePerFive > 0
      ? Math.floor(defender.modelCount / 5) * merged.attackDicePerFive
      : 0
  const attacksPerBearer = (parsedAttacks ?? 1) + merged.bonusAttacks + extraAttackDice
  const weaponCount = Math.max(0, input.weaponCount ?? weapon.count ?? input.attacker.modelCount)

  // --- hit
  // Cover is resolved centrally so that [IGNORES COVER] wins regardless of the
  // order rules were matched in. In this edition cover worsens the attack's BS
  // by 1 (13.08) rather than improving the target's save.
  const targetHasCover = weapon.type === 'ranged' && merged.grantsCover && !merged.ignoresCover
  if (merged.grantsCover && merged.ignoresCover) {
    notes.push('Ignores Cover: the target does not get the benefit of cover.')
  }
  const hitSources = [...merged.hitSources]
  if (targetHasCover) hitSources.push('-1 benefit of cover')

  const rawHitModifier = merged.hitModifier + (targetHasCover ? -1 : 0)
  // [PSYCHIC] lets you ignore *any or all* modifiers, so beneficial ones are kept.
  const hitModifier = merged.ignoreHitModifiers
    ? Math.max(0, clampModifier(rawHitModifier))
    : clampModifier(rawHitModifier)
  if (merged.ignoreHitModifiers && rawHitModifier < 0) {
    notes.push('Psychic: negative hit roll modifiers ignored.')
  }
  if (Math.abs(rawHitModifier) > MODIFIER_CAP) {
    notes.push(`Hit modifiers capped at ${signed(hitModifier)} (total was ${signed(rawHitModifier)}).`)
  }
  const hitThreshold = Math.max(2, Math.min(6, weapon.skill - hitModifier))
  const hitReroll = merged.cannotRerollHits ? 'none' : merged.hitReroll
  if (merged.cannotRerollHits && merged.hitReroll !== 'none') {
    notes.push('Hit re-rolls are not allowed for this attack.')
  }

  // --- wound
  const strength = Math.max(1, weapon.strength + merged.strengthModifier)
  const toughness = Math.max(1, defender.toughness + merged.toughnessModifier)
  const baseWoundThreshold = woundThresholdFor(strength, toughness)
  const rawWoundModifier = merged.woundModifier
  const woundModifier = clampModifier(rawWoundModifier)
  if (Math.abs(rawWoundModifier) > MODIFIER_CAP) {
    notes.push(`Wound modifiers capped at ${signed(woundModifier)} (total was ${signed(rawWoundModifier)}).`)
  }
  const woundThreshold = Math.max(2, Math.min(6, baseWoundThreshold - woundModifier))

  // --- save
  const ap = Math.max(0, weapon.ap + merged.apModifier)
  const armourSave = defender.save + ap - merged.saveModifier
  const invulnFromRules = merged.invulnerableSave
  let invulnerableSave: number | null = defender.invulnerableSave
  if (invulnFromRules !== null) {
    invulnerableSave =
      invulnerableSave === null ? invulnFromRules : Math.min(invulnerableSave, invulnFromRules)
  }
  if (invulnerableSave !== null) invulnerableSave = Math.max(2, invulnerableSave - merged.saveModifier)
  if (merged.cannotUseInvulnerableSave) invulnerableSave = null

  let savingWith: ResolvedProfile['savingWith'] = 'none'
  let effectiveSave: number | null = null
  if (invulnerableSave !== null && (armourSave > 6 || invulnerableSave <= armourSave)) {
    savingWith = 'invulnerable'
    effectiveSave = invulnerableSave
  } else if (armourSave <= 6) {
    savingWith = 'armour'
    effectiveSave = Math.max(2, armourSave)
  }

  // --- damage
  const baseDamage = averageDice(weapon.damage)
  if (baseDamage === null) {
    notes.push(`Could not read the D characteristic "${weapon.damage}" — assuming 1.`)
  }
  let damagePerWound = baseDamage ?? 1
  if (merged.halveDamage) damagePerWound = halveRoundingUp(damagePerWound)
  damagePerWound = Math.max(1, damagePerWound + merged.damageModifier - merged.damageReduction)

  const netDamageModifier = merged.damageModifier - merged.damageReduction
  let damageExpression = merged.halveDamage
    ? `half of ${weapon.damage}`
    : addToExpression(weapon.damage, netDamageModifier)
  if (merged.halveDamage && netDamageModifier !== 0) {
    damageExpression += ` ${netDamageModifier > 0 ? '+' : ''}${netDamageModifier}`
  }

  const feelNoPain =
    merged.feelNoPain === null
      ? defender.feelNoPain
      : defender.feelNoPain === null
        ? merged.feelNoPain
        : Math.min(defender.feelNoPain, merged.feelNoPain)

  return {
    attacksExpression: weapon.attacks,
    attacksPerWeapon: attacksPerBearer,
    extraAttackDice,
    weaponCount,
    totalAttacks: attacksPerBearer * weaponCount,

    autoHit: merged.autoHit,
    baseHitThreshold: weapon.skill,
    hitModifier,
    rawHitModifier,
    hitThreshold,
    hitModifierSources: hitSources,
    unmodifiedHitFloor: merged.unmodifiedHitFloor,
    hitReroll,
    critHitOn: merged.critHitOn,
    sustainedHits: merged.sustainedHits,
    lethalHits: merged.lethalHits,

    strength,
    toughness,
    baseWoundThreshold,
    woundModifier,
    rawWoundModifier,
    woundThreshold,
    woundModifierSources: merged.woundSources,
    woundReroll: merged.woundReroll,
    critWoundOn: merged.critWoundOn,
    devastatingWounds: merged.devastatingWounds,
    autoWound: merged.autoWound,

    ap,
    armourSave,
    invulnerableSave,
    effectiveSave,
    savingWith,
    targetHasCover,

    damageExpression,
    damagePerWound,
    feelNoPain,
    woundsPerModel: Math.max(1, defender.wounds),
    flatMortalWounds: merged.flatMortalWounds,

    notes,
    appliedRules: applied,
  }
}
// --- Estimation -----------------------------------------------------------

function applyReroll(prob: number, critProb: number, mode: RerollMode): [number, number] {
  if (mode === 'failed') {
    const failChance = 1 - prob
    return [prob + failChance * prob, critProb + failChance * critProb]
  }
  if (mode === 'ones') {
    const oneChance = 1 / 6
    return [prob + oneChance * prob, critProb + oneChance * critProb]
  }
  return [prob, critProb]
}

/**
 * Expected damage for a resolved profile.
 *
 * Variable characteristics use their average, so this is an expected value and
 * not a distribution. Where the rules give the attacker a choice (Lethal Hits
 * versus letting crits roll to wound so that Devastating Wounds can trigger)
 * both branches are evaluated and the better one is reported.
 */
export function estimateAttack(profile: ResolvedProfile): AttackEstimate {
  if (!profile.lethalHits || !profile.devastatingWounds) {
    return estimateBranch(profile, profile.lethalHits)
  }
  const withLethal = estimateBranch(profile, true)
  const withoutLethal = estimateBranch(profile, false)
  return withLethal.expectedDamage >= withoutLethal.expectedDamage ? withLethal : withoutLethal
}

function estimateBranch(profile: ResolvedProfile, useLethalHits: boolean): AttackEstimate {
  const attacks = profile.totalAttacks

  // --- hit rolls
  let hitProb: number
  let critHitProb: number
  if (profile.autoHit) {
    // No hit roll is made, so no critical hits (and nothing to re-roll).
    hitProb = 1
    critHitProb = 0
  } else if (profile.unmodifiedHitFloor !== null) {
    // Unmodified roll requirements ignore BS and modifiers entirely.
    hitProb = Math.max(0, (7 - profile.unmodifiedHitFloor) / 6)
    critHitProb = profile.unmodifiedHitFloor <= 6 ? (7 - profile.critHitOn) / 6 : 0
    critHitProb = Math.min(critHitProb, hitProb)
    ;[hitProb, critHitProb] = applyReroll(hitProb, critHitProb, profile.hitReroll)
  } else {
    hitProb = (7 - profile.hitThreshold) / 6
    critHitProb = Math.min((7 - profile.critHitOn) / 6, 1)
    // A critical hit always hits, even if the modified roll would have missed.
    hitProb = Math.max(hitProb, critHitProb)
    ;[hitProb, critHitProb] = applyReroll(hitProb, critHitProb, profile.hitReroll)
  }

  const hits = attacks * hitProb
  const criticalHits = attacks * critHitProb
  const sustainedExtraHits = criticalHits * profile.sustainedHits

  // --- wound rolls
  let woundProb = (7 - profile.woundThreshold) / 6
  let critWoundProb = Math.min((7 - profile.critWoundOn) / 6, 1)
  woundProb = Math.max(woundProb, critWoundProb)
  ;[woundProb, critWoundProb] = applyReroll(woundProb, critWoundProb, profile.woundReroll)

  const lethal = useLethalHits && profile.lethalHits
  // Auto-wounding attacks skip the wound roll, so they can never crit.
  const autoWoundingHits = lethal ? criticalHits : 0
  const rollingHits = hits - autoWoundingHits + sustainedExtraHits
  const woundsFromRolls = profile.autoWound ? rollingHits : rollingHits * woundProb
  const criticalWounds = profile.autoWound ? 0 : rollingHits * critWoundProb
  const totalWounds = woundsFromRolls + autoWoundingHits

  // --- saves
  const saveProb =
    profile.effectiveSave === null ? 0 : Math.max(0, (7 - Math.max(2, profile.effectiveSave)) / 6)
  const failSave = 1 - saveProb

  const devastating = profile.devastatingWounds && !profile.autoWound
  const savableWounds = devastating ? totalWounds - criticalWounds : totalWounds
  const unsavedWounds = savableWounds * failSave

  // Devastating Wounds: mortal wounds equal to D, but they can only damage one
  // model per critical wound, so overkill beyond a model's W is lost.
  const devastatingMortals = devastating
    ? criticalWounds * Math.min(profile.damagePerWound, profile.woundsPerModel)
    : 0
  const mortalWounds = devastatingMortals + profile.flatMortalWounds

  // --- damage
  const fnpFail = profile.feelNoPain === null ? 1 : 1 - (7 - profile.feelNoPain) / 6
  const normalDamage = unsavedWounds * profile.damagePerWound * fnpFail
  const mortalDamage = mortalWounds * fnpFail
  const expectedDamage = normalDamage + mortalDamage

  // Damage does not spill between models, so cap each unsaved wound's damage at
  // one model's wounds when estimating casualties.
  const effectiveNormalDamage =
    unsavedWounds * Math.min(profile.damagePerWound, profile.woundsPerModel) * fnpFail
  const expectedModelsSlain = (effectiveNormalDamage + mortalDamage) / profile.woundsPerModel

  return {
    attacks,
    hits: hits + sustainedExtraHits,
    criticalHits,
    wounds: totalWounds,
    criticalWounds,
    unsavedWounds,
    mortalWounds,
    expectedDamage,
    expectedModelsSlain,
    usedLethalHits: lethal,
  }
}

// --- Convenience ----------------------------------------------------------

/**
 * True when a rule changes any number in the attack sequence, as opposed to only
 * printing a reminder. Re-rolls count: they change the probabilities.
 */
export function hasMathematicalEffect(effects: RuleEffects): boolean {
  for (const [key, value] of Object.entries(effects)) {
    if (key === 'notes') continue
    if (value === undefined || value === null || value === false || value === 'none') continue
    return true
  }
  return false
}

/** Rules that belong in the combat readout rather than the unit profile. */
export function affectsCombat(rule: RuleDefinition): boolean {
  return hasMathematicalEffect(rule.effects) || rule.source === 'weapon-ability' || rule.compute !== undefined
}

export interface UnitAbilitySummary {
  keywords: string[]
  attachmentNames: string[]
  /** Rules the unit owns that are not tied to a particular weapon or attack. */
  rules: RuleDefinition[]
}

/**
 * What a unit brings to the table independently of any single attack: keywords
 * (after attachments), attachment names, and its non-combat rules. Used by the
 * profile panel so battlefield-only abilities stay out of the combat readout.
 */
export function resolveUnitAbilities(
  unit: ParsedUnit,
  options: {
    rules?: RuleDefinition[]
    attachments?: KeywordAttachment[]
    allUnits?: ParsedUnit[]
    includeLibrary?: boolean
  } = {}
): UnitAbilitySummary {
  const attachments = options.attachments ?? []
  const unitsById = buildUnitIndex(options.allUnits ?? [unit])
  const resolved = resolveUnitKeywords(unit, attachments, unitsById)

  const candidates = [
    ...(options.includeLibrary === false ? [] : STARTER_RULES),
    ...(options.rules ?? []).filter((rule) => rule.enabled !== false),
  ]

  const rules: RuleDefinition[] = []
  const seen = new Set<string>()

  for (const rule of candidates) {
    if (affectsCombat(rule)) continue
    // Stratagems and toggled buffs are things the player does, not traits the
    // unit has, so they stay out of the profile.
    if (rule.manual) continue
    const conditions = rule.conditions
    // Anything weapon-specific belongs to an attack, not to the unit.
    if (conditions?.weaponKeyword || conditions?.weaponKeywordAny || conditions?.weaponType) continue
    if (conditions?.options?.length || conditions?.notOptions?.length) continue

    const owns =
      resolved.grantedRuleIds.includes(rule.id) ||
      targetMatchesUnit(rule.target, unit.id, resolved.keywords, resolved.partnerUnitIds)
    if (!owns) continue
    if (!matchesKeywordQuery(resolved.keywords, conditions?.attackerKeywords)) continue

    const key = normalizeKeyword(rule.name)
    if (seen.has(key)) continue
    seen.add(key)
    rules.push(rule)
  }

  return { keywords: resolved.keywords, attachmentNames: resolved.attachmentNames, rules }
}

/** Expected total damage — the number the target picker sorts on. */
export function estimateExpectedDamage(input: AttackInput): number {
  return resolveAttack(input).estimate.expectedDamage
}
