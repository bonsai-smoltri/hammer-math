import type {
  RuleConditions,
  RuleDefinition,
  RuleEffects,
  RuleSide,
  RuleSource,
} from '../../types/rules'
import { hasUnitKeyword, normalizeKeyword, parseAntiKeyword } from './keywords'

/**
 * Starter rules library.
 *
 * Everything the core rules define that can affect the maths of a single attack,
 * plus informational entries for the abilities that only change what you are
 * allowed to do. References are to the Warhammer 40,000 core rules sections in
 * `data/core rules.pdf`.
 *
 * Three activation styles:
 *  - Weapon abilities apply automatically when the weapon has the ability.
 *  - Unit abilities apply automatically to units holding a keyword. Datasheet
 *    abilities are not in a BattleScribe export, so attach the keyword (e.g.
 *    'Stealth') to the unit and the rule starts applying — see KeywordAttachment.
 *  - Stratagems, detachment rules and buffs are `manual`: they only apply for the
 *    attack you switch them on for.
 */

function slug(name: string): string {
  return normalizeKeyword(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Weapon ability: applies whenever the attacking weapon has the ability. */
function weaponAbility(
  name: string,
  ref: string,
  description: string,
  effects: RuleEffects,
  conditions: RuleConditions = {},
  compute?: RuleDefinition['compute']
): RuleDefinition {
  return {
    id: `core.weapon.${slug(name)}`,
    name,
    source: 'weapon-ability',
    ref,
    description,
    side: 'attacker',
    target: { type: 'global' },
    conditions: { weaponKeyword: name, ...conditions },
    effects,
    compute,
    builtIn: true,
  }
}

/** Unit ability: applies to units that hold the matching keyword. */
function unitAbility(
  name: string,
  ref: string,
  description: string,
  side: RuleSide,
  effects: RuleEffects,
  conditions: RuleConditions = {},
  keywords: string[] = [name]
): RuleDefinition {
  return {
    id: `core.ability.${slug(name)}`,
    name,
    source: 'core-ability',
    ref,
    description,
    side,
    target: { type: 'keyword', keywords, keywordMatch: 'any' },
    conditions,
    effects,
    builtIn: true,
  }
}

function manualRule(
  source: RuleSource,
  name: string,
  ref: string | undefined,
  description: string,
  side: RuleSide,
  effects: RuleEffects,
  conditions: RuleConditions = {}
): RuleDefinition {
  return {
    id: `core.${source}.${slug(name)}`,
    name,
    source,
    ref,
    description,
    side,
    target: { type: 'global' },
    conditions,
    effects,
    manual: true,
    builtIn: true,
  }
}

// --- Weapon abilities (24.03 - 24.38) -------------------------------------

export const WEAPON_ABILITY_RULES: RuleDefinition[] = [
  weaponAbility(
    'Anti',
    '24.03',
    '[ANTI-X Y+]: against a target with keyword X, an unmodified wound roll of Y+ is a critical wound.',
    {},
    { weaponKeyword: 'Anti' },
    (ctx) => {
      // A weapon can carry several Anti abilities; use the best one that
      // matches the target (24.02 lets the controlling player choose).
      let best: { keyword: string; threshold: number } | null = null
      for (const kw of ctx.weapon.keywords) {
        const anti = parseAntiKeyword(kw)
        if (!anti) continue
        if (!hasUnitKeyword(ctx.defenderKeywords, anti.keyword)) continue
        if (!best || anti.threshold < best.threshold) best = anti
      }
      if (!best) return null
      return {
        anti: best,
        notes: [`critical wound on ${best.threshold}+ against ${best.keyword}`],
      }
    }
  ),
  weaponAbility('Assault', '24.04', 'The unit can shoot using assault shooting after Advancing (10.05).', {
    notes: ['can shoot after Advancing'],
  }),
  weaponAbility(
    'Blast',
    '24.05',
    '[BLAST X]: add X attack dice for every five models in the target unit. Cannot be used against engaged units.',
    {},
    {},
    (ctx) => ({
      attackDicePerFiveTargetModels: ctx.weaponKeyword?.value ?? 1,
      notes: ['cannot target units within Engagement Range'],
    })
  ),
  weaponAbility(
    'Cleave',
    '24.06',
    '[CLEAVE X]: if all of the weapon’s attacks are made against one target, add X attack dice for every five models in it.',
    {},
    { options: ['singleTarget'] },
    (ctx) => ({ attackDicePerFiveTargetModels: ctx.weaponKeyword?.value ?? 1 })
  ),
  weaponAbility('Close-Quarters', '24.07', 'Can be fired at engaged units, but excludes the model’s other ranged weapons.', {
    notes: ['can shoot while engaged; excludes that model’s other ranged weapons'],
  }),
  weaponAbility(
    'Devastating Wounds',
    '24.10',
    'A critical wound ends the attack sequence and inflicts mortal wounds equal to the weapon’s D characteristic (max one model per critical wound).',
    { devastatingWounds: true }
  ),
  weaponAbility('Extra Attacks', '24.11', 'Used in addition to the model’s other melee weapons.', {
    notes: ['resolved in addition to other melee weapons'],
  }),
  weaponAbility(
    'Hazardous',
    '24.15',
    'After attacking, make one hazard roll per Hazardous weapon selected: on a 1-2 the unit suffers 1 mortal wound (3 for MONSTER/VEHICLE).',
    { notes: ['hazard roll after attacking — ~0.33 mortal wounds per weapon, to yourself'] }
  ),
  weaponAbility(
    'Heavy',
    '24.16',
    'Add 1 to the hit roll if the unit is unengaged, was not set up this turn and no model moved more than 3".',
    { hitModifier: 1 },
    { phase: 'shooting', options: ['remainedStationary', 'unengaged'], notOptions: ['setUpThisTurn'] }
  ),
  weaponAbility('Ignores Cover', '24.18', 'The target cannot have the benefit of cover against the attack.', {
    ignoresCover: true,
  }),
  weaponAbility(
    'Indirect Fire',
    '24.19',
    'Indirect shooting: the target has the benefit of cover, hit rolls cannot be re-rolled, and an unmodified 1-5 fails (1-3 if the unit remained stationary and the target is visible to a friendly unit).',
    {},
    {
      options: ['indirectFiring'],
      usesOptions: ['remainedStationary', 'spotterAvailable'],
      weaponType: 'ranged',
    },
    (ctx) => {
      const spotted = ctx.options.remainedStationary && ctx.options.spotterAvailable
      return {
        unmodifiedHitFloor: spotted ? 4 : 6,
        cannotRerollHits: true,
        grantsCover: true,
        notes: [spotted ? 'stationary + spotter: 4+ to hit' : '6+ to hit'],
      }
    }
  ),
  weaponAbility(
    'Lance',
    '24.21',
    'Add 1 to the wound roll if the attacking model’s unit made a charge move this turn.',
    { woundModifier: 1 },
    { options: ['charged'] }
  ),
  weaponAbility(
    'Lethal Hits',
    '24.23',
    'A critical hit can automatically wound the target (no wound roll, so it cannot become a critical wound).',
    { lethalHits: true }
  ),
  weaponAbility(
    'Melta',
    '24.25',
    '[MELTA X]: add X to the weapon’s D characteristic against targets within half range.',
    {},
    { options: ['inHalfRange'] },
    (ctx) => ({ damageModifier: ctx.weaponKeyword?.value ?? 2 })
  ),
  weaponAbility('One Shot', '24.26', 'Can only be selected to attack with once per battle.', {
    notes: ['once per battle'],
  }),
  weaponAbility('Pistol', '24.27', 'Identical to [CLOSE-QUARTERS] for all rules purposes.', {
    notes: ['can shoot while engaged; excludes that model’s other ranged weapons'],
  }),
  weaponAbility(
    'Precision',
    '24.28',
    'Attacks can be allocated to a visible CHARACTER model in the target unit.',
    { notes: ['can be allocated to CHARACTER models'] },
    { targetKeywords: { any: ['Character'] } }
  ),
  weaponAbility(
    'Psychic',
    '24.29',
    'You can ignore any or all modifiers to the attack’s BS/WS and hit roll. Counts as a psychic attack.',
    { ignoreHitModifiers: true, notes: ['psychic attack'] }
  ),
  weaponAbility(
    'Rapid Fire',
    '24.30',
    '[RAPID FIRE X]: add X attack dice against targets within half range.',
    {},
    { options: ['inHalfRange'] },
    (ctx) => ({ bonusAttacks: ctx.weaponKeyword?.value ?? 1 })
  ),
  weaponAbility(
    'Sustained Hits',
    '24.36',
    '[SUSTAINED HITS X]: each critical hit scores X additional hits.',
    {},
    {},
    (ctx) => ({ sustainedHits: ctx.weaponKeyword?.value ?? 1 })
  ),
  weaponAbility('Torrent', '24.37', 'The attack automatically hits (no hit roll, so no critical hits).', {
    autoHit: true,
  }),
  weaponAbility('Twin-linked', '24.38', 'You can re-roll the wound roll.', { woundRerolls: 'failed' }),
]

// --- Unit (core) abilities ------------------------------------------------
// Datasheet abilities are not present in roster exports, so these are keyed on
// keywords you attach to a unit.

export const UNIT_ABILITY_RULES: RuleDefinition[] = [
  unitAbility(
    'Stealth',
    '24.33',
    'If every model has this ability, ranged attacks against the unit are made against a target with the benefit of cover.',
    'defender',
    { grantsCover: true },
    { weaponType: 'ranged' }
  ),
  unitAbility(
    'Lone Operative',
    '24.24',
    'Unless part of an attached unit, cannot be targeted from more than 12" away.',
    'defender',
    { notes: ['cannot be targeted beyond 12" unless attached'] }
  ),
  unitAbility(
    'Fights First',
    '24.13',
    'The unit fights in the Fights First step of the Fight phase.',
    'attacker',
    { notes: ['fights before units without Fights First'] },
    { phase: 'fight' }
  ),
  unitAbility(
    'Deadly Demise',
    '24.08',
    'Deadly Demise X: when a model is destroyed, on a 6 each unit within 6" suffers X mortal wounds.',
    'defender',
    { notes: ['on a 6 when destroyed, units within 6" suffer mortal wounds'] }
  ),
  unitAbility(
    'Deep Strike',
    '24.09',
    'Can arrive from Reserves anywhere more than 8" from enemy units.',
    'attacker',
    { notes: ['arrives from Reserves more than 8" away'] }
  ),
  unitAbility(
    'Infiltrators',
    '24.20',
    'Deploys anywhere more than 8" from the enemy deployment zone and all enemy units.',
    'attacker',
    { notes: ['deploys outside the enemy deployment zone'] }
  ),
  unitAbility(
    'Scouts',
    '24.31',
    'Scouts X": makes a pre-battle scout move of up to X".',
    'attacker',
    { notes: ['pre-battle scout move'] }
  ),
  unitAbility(
    'Leader',
    '24.22',
    'Forms an attached unit (19). The attached unit has every keyword of both units — model this with an attachment.',
    'both',
    { notes: ['attached unit: keywords and abilities are shared (19.03, 19.04)'] }
  ),
  unitAbility(
    'Support',
    '24.34',
    'Attaches to a unit like a Leader (19).',
    'both',
    { notes: ['attached unit: keywords and abilities are shared (19.03, 19.04)'] }
  ),
  unitAbility(
    'Firing Deck',
    '24.14',
    'Firing Deck X: fires up to X embarked models’ ranged weapons.',
    'attacker',
    { notes: ['can fire embarked models’ weapons'] }
  ),
  unitAbility(
    'Feel No Pain',
    '24.12',
    'Feel No Pain X+: each time the model would lose a wound, on an X+ that wound is not lost.',
    'defender',
    { notes: ['datasheet Feel No Pain is read from the roster; use a granted rule to add one'] }
  ),
]

// --- Core mechanics ------------------------------------------------------
// Battle-shock is deliberately not a rule here: on its own it changes no number
// in the attack sequence, so it lives on the unit profile as a state flag. The
// `attackerBattleShocked` / `targetBattleShocked` options are still available for
// homebrew rules that do care.

export const CORE_MECHANIC_RULES: RuleDefinition[] = [
  {
    id: 'core.mechanic.benefit-of-cover',
    name: 'Benefit of Cover',
    source: 'core-ability',
    ref: '13.08',
    description:
      'A ranged attack against a target with the benefit of cover has its BS characteristic worsened by 1. Cover no longer improves saves.',
    side: 'attacker',
    target: { type: 'global' },
    conditions: { weaponType: 'ranged', options: ['targetInCover'] },
    effects: { grantsCover: true },
    builtIn: true,
  },
]

/** Reminder text for a battle-shocked unit, shown on the profile panel. */
export const BATTLE_SHOCK_EFFECTS = [
  'OC characteristic of every model is 0 (01.07)',
  'cannot be targeted by your stratagems',
  'not eligible to start an action',
]

// --- Core stratagems (15.02 - 15.12) -------------------------------------

export const STRATAGEM_RULES: RuleDefinition[] = [
  manualRule(
    'stratagem',
    'Command Re-roll',
    '15.02',
    '1CP. Re-roll one hit, wound, save, damage, hazard, Advance, Charge or attack-number dice.',
    'attacker',
    { notes: ['re-roll a single dice (not modelled in the estimate)'] }
  ),
  manualRule(
    'stratagem',
    'Epic Challenge',
    '15.03',
    '1CP. One CHARACTER model’s melee weapons gain [PRECISION] until the end of the phase.',
    'attacker',
    { notes: ['melee weapons gain [PRECISION]'] },
    { phase: 'fight', attackerKeywords: { any: ['Character'] } }
  ),
  manualRule(
    'stratagem',
    'Insane Bravery',
    '15.04',
    '1CP. A battle-shock roll is automatically passed. Once per battle.',
    'both',
    { notes: ['battle-shock roll automatically passed'] }
  ),
  manualRule(
    'stratagem',
    'Explosives',
    '15.05',
    '1CP. Roll six D6 against a unit within 8": each 4+ inflicts 1 mortal wound.',
    'attacker',
    { flatMortalWounds: 3, notes: ['six D6, each 4+ inflicts a mortal wound (≈3)'] },
    { phase: 'shooting', attackerKeywords: { any: ['Explosives', 'Grenades'] } }
  ),
  {
    ...manualRule(
      'stratagem',
      'Crushing Impact',
      '15.06',
      '1CP. After a MONSTER/VEHICLE charge, roll D6 equal to a model’s T: each 5+ inflicts a mortal wound (max 6), each 1 wounds you.',
      'attacker',
      {},
      { options: ['charged'], attackerKeywords: { any: ['Monster', 'Vehicle'] } }
    ),
    compute: (ctx) => {
      const dice = Math.max(1, ctx.attacker.toughness)
      return {
        flatMortalWounds: Math.min(6, dice / 3),
        notes: [`roll ${dice}D6, each 5+ inflicts a mortal wound (≈${Math.min(6, dice / 3).toFixed(1)})`],
      }
    },
  },
  manualRule(
    'stratagem',
    'Rapid Ingress',
    '15.07',
    '1CP. A unit in Strategic Reserves makes an ingress move at the end of your opponent’s Movement phase.',
    'attacker',
    { notes: ['arrives early from Strategic Reserves'] }
  ),
  manualRule(
    'stratagem',
    'Fire Overwatch',
    '15.08',
    '1CP. The unit shoots using snap shooting: only 6s hit, no hit re-rolls, target within 24".',
    'attacker',
    { unmodifiedHitFloor: 6, cannotRerollHits: true, notes: ['snap shooting: target must be within 24"'] },
    { weaponType: 'ranged' }
  ),
  manualRule(
    'stratagem',
    'Snap Shooting',
    '15.09',
    'Each attack only hits on an unmodified 6 and hit rolls cannot be re-rolled.',
    'attacker',
    { unmodifiedHitFloor: 6, cannotRerollHits: true },
    { weaponType: 'ranged' }
  ),
  manualRule(
    'stratagem',
    'Smokescreen',
    '15.10',
    '1CP. Attacks against the SMOKE unit are made against a target with the benefit of cover.',
    'defender',
    { grantsCover: true },
    { weaponType: 'ranged' }
  ),
  manualRule(
    'stratagem',
    'Heroic Intervention',
    '15.11',
    '1CP. Resolve a charge with your unit in your opponent’s Charge phase.',
    'attacker',
    { notes: ['charges in your opponent’s turn'] }
  ),
  manualRule(
    'stratagem',
    'Counteroffensive',
    '15.12',
    '2CP. Your unit gains Fights First and fights next.',
    'attacker',
    { notes: ['fights out of sequence'] },
    { phase: 'fight' }
  ),
]

// --- Reusable buff / debuff templates ------------------------------------
// The shapes almost every army rule, detachment rule and enhancement reduces
// to. Copy one, rename it, and point its target at a keyword or unit.

export const BUFF_TEMPLATE_RULES: RuleDefinition[] = [
  manualRule('army-rule', 'Re-roll Hits vs Marked Target', undefined, 'Oath of Moment-style: re-roll hit rolls against the marked target.', 'attacker', { hitRerolls: 'failed' }, { options: ['targetIsMarked'] }),
  manualRule('army-rule', 'Re-roll Hit Rolls', undefined, 'Re-roll failed hit rolls.', 'attacker', { hitRerolls: 'failed' }),
  manualRule('army-rule', 'Re-roll Hit Rolls of 1', undefined, 'Re-roll hit rolls of 1.', 'attacker', { hitRerolls: 'ones' }),
  manualRule('army-rule', 'Re-roll Wound Rolls', undefined, 'Re-roll failed wound rolls.', 'attacker', { woundRerolls: 'failed' }),
  manualRule('army-rule', 'Re-roll Wound Rolls of 1', undefined, 'Re-roll wound rolls of 1.', 'attacker', { woundRerolls: 'ones' }),
  manualRule('army-rule', '+1 to Hit', undefined, 'Add 1 to hit rolls (total modifiers are capped at ±1).', 'attacker', { hitModifier: 1 }),
  manualRule('army-rule', '+1 to Wound', undefined, 'Add 1 to wound rolls (total modifiers are capped at ±1).', 'attacker', { woundModifier: 1 }),
  manualRule('army-rule', '+1 Strength', undefined, 'Add 1 to the weapon’s S characteristic.', 'attacker', { strengthModifier: 1 }),
  manualRule('army-rule', '+1 Armour Penetration', undefined, 'Improve the weapon’s AP by 1.', 'attacker', { apModifier: 1 }),
  manualRule('army-rule', '+1 Damage', undefined, 'Add 1 to the weapon’s D characteristic.', 'attacker', { damageModifier: 1 }),
  manualRule('army-rule', 'Grant Lethal Hits', undefined, 'The unit’s weapons gain [LETHAL HITS].', 'attacker', { lethalHits: true }),
  manualRule('army-rule', 'Grant Sustained Hits 1', undefined, 'The unit’s weapons gain [SUSTAINED HITS 1].', 'attacker', { sustainedHits: 1 }),
  manualRule('army-rule', 'Grant Devastating Wounds', undefined, 'The unit’s weapons gain [DEVASTATING WOUNDS].', 'attacker', { devastatingWounds: true }),
  manualRule('army-rule', 'Grant Twin-linked', undefined, 'The unit’s weapons gain [TWIN-LINKED].', 'attacker', { woundRerolls: 'failed' }),
  manualRule('army-rule', 'Grant Ignores Cover', undefined, 'The unit’s weapons gain [IGNORES COVER].', 'attacker', { ignoresCover: true }),
  manualRule('army-rule', 'Critical Hits on 5+', undefined, 'Unmodified hit rolls of 5+ are critical hits.', 'attacker', { critHitOn: 5 }),
  manualRule('army-rule', 'Critical Wounds on 5+', undefined, 'Unmodified wound rolls of 5+ are critical wounds.', 'attacker', { critWoundOn: 5 }),
  manualRule('army-rule', 'Ignore Invulnerable Saves', undefined, 'The target cannot use an invulnerable save against these attacks.', 'attacker', { cannotUseInvulnerableSave: true }),

  manualRule('army-rule', '-1 to be Hit', undefined, 'Subtract 1 from hit rolls targeting this unit.', 'defender', { hitModifier: -1 }),
  manualRule('army-rule', '-1 to be Wounded', undefined, 'Subtract 1 from wound rolls targeting this unit.', 'defender', { woundModifier: -1 }),
  manualRule('army-rule', '+1 Toughness', undefined, 'Add 1 to this unit’s T characteristic.', 'defender', { toughnessModifier: 1 }),
  manualRule('army-rule', '+1 to Save Rolls', undefined, 'Add 1 to save rolls made for this unit.', 'defender', { saveModifier: 1 }),
  manualRule('army-rule', 'Reduce Damage by 1', undefined, 'Armour of Contempt-style: subtract 1 from the D characteristic (minimum 1).', 'defender', { damageReduction: 1 }),
  manualRule('army-rule', 'Halve Damage', undefined, 'Halve the D characteristic of attacks against this unit, rounding up.', 'defender', { halveDamage: true }),
  manualRule('army-rule', 'Grant 4+ Invulnerable Save', undefined, 'This unit has a 4+ invulnerable save.', 'defender', { invulnerableSave: 4 }),
  manualRule('army-rule', 'Grant 5+ Invulnerable Save', undefined, 'This unit has a 5+ invulnerable save.', 'defender', { invulnerableSave: 5 }),
  manualRule('army-rule', 'Grant Feel No Pain 4+', undefined, 'This unit has Feel No Pain 4+.', 'defender', { feelNoPain: 4 }),
  manualRule('army-rule', 'Grant Feel No Pain 5+', undefined, 'This unit has Feel No Pain 5+.', 'defender', { feelNoPain: 5 }),
  manualRule('army-rule', 'Grant Feel No Pain 6+', undefined, 'This unit has Feel No Pain 6+.', 'defender', { feelNoPain: 6 }),
  manualRule('army-rule', 'Grant Cover', undefined, 'This unit has the benefit of cover against ranged attacks.', 'defender', { grantsCover: true }, { weaponType: 'ranged' }),
]

export const STARTER_RULES: RuleDefinition[] = [
  ...WEAPON_ABILITY_RULES,
  ...UNIT_ABILITY_RULES,
  ...CORE_MECHANIC_RULES,
  ...STRATAGEM_RULES,
  ...BUFF_TEMPLATE_RULES,
]

export const STARTER_RULES_BY_ID = new Map(STARTER_RULES.map((rule) => [rule.id, rule]))

/** Library rules grouped for display. */
export const RULE_GROUPS: { label: string; rules: RuleDefinition[] }[] = [
  { label: 'Weapon abilities', rules: WEAPON_ABILITY_RULES },
  { label: 'Unit abilities (keyword-driven)', rules: UNIT_ABILITY_RULES },
  { label: 'Core mechanics', rules: CORE_MECHANIC_RULES },
  { label: 'Core stratagems', rules: STRATAGEM_RULES },
  { label: 'Buffs & debuffs', rules: BUFF_TEMPLATE_RULES },
]
