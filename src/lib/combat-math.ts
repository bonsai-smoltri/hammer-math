import type { ParsedUnit, ParsedWeapon } from '../types/roster'
import type { CustomRule } from '../types/rules'

// --- Pipeline Types ---

export interface CombatOptions {
  inHalfRange: boolean
  remainedStationary: boolean
  targetInCover: boolean
  advanced: boolean
  charged: boolean // for Lance
  indirectFiring: boolean // for Indirect Fire (not visible)
  spotterAvailable: boolean // for Indirect Fire (friendly unit can see target)
}

/** Context passed to modifiers so they can check conditions */
export interface AttackContext {
  attacker: ParsedUnit
  weapon: ParsedWeapon
  defender: ParsedUnit
  options: CombatOptions
}

/** Mutable state that modifiers transform through the pipeline */
export interface AttackState {
  // Attacks
  attacksPerModel: number | null // null if variable (D6 etc.)
  attacksExpression: string
  bonusAttacksPerModel: number
  blastBonus: number

  // Hit
  hitThreshold: number
  hitModifiers: string[]
  autoHit: boolean
  critHitEffects: string[]
  overrideHitMinimum: number | null // for Indirect Fire (min roll to hit)
  hitOverrideNote: string | null
  cannotRerollHits: boolean

  // Wound
  woundThreshold: number
  woundModifiers: string[]
  critWoundThreshold: number // default 6, Anti can lower it
  critWoundEffects: string[]
  rerollWounds: boolean

  // Save
  apValue: number
  ignoreCover: boolean

  // Damage
  damageExpression: string
  bonusDamage: number
  bonusDamageNote: string | null

  // Informational notes
  notes: string[]
}

/** A single modifier in the pipeline */
export interface AttackModifier {
  name: string
  isActive: (ctx: AttackContext) => boolean
  apply: (state: AttackState, ctx: AttackContext) => AttackState
}

// --- Output type ---

export interface AttackResult {
  numberOfDice: string
  autoHit: boolean
  hitThreshold: number
  hitModifierNote: string | null
  hitOverrideNote: string | null // e.g. "Indirect Fire: 5+ to hit (4+ if stationary with spotter)"
  critHitEffects: string[]
  woundThreshold: number
  woundModifierNote: string | null
  critWoundThreshold: number
  critWoundEffects: string[]
  rerollWounds: boolean
  cannotRerollHits: boolean
  saveDisplay: string
  feelNoPainDisplay: string | null
  weaponDamage: string
  notes: string[]
}

// --- All Modifiers ---

const MODIFIERS: AttackModifier[] = [
  // === Attack count modifiers ===
  {
    name: 'Rapid Fire',
    isActive: (ctx) => ctx.options.inHalfRange && hasKeyword(ctx.weapon, 'Rapid Fire'),
    apply: (state, ctx) => {
      const value = getKeywordValue(ctx.weapon, 'Rapid Fire') ?? 1
      return { ...state, bonusAttacksPerModel: state.bonusAttacksPerModel + value }
    },
  },
  {
    name: 'Blast',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Blast'),
    apply: (state, ctx) => {
      const value = getKeywordValue(ctx.weapon, 'Blast') ?? 1
      const bonus = Math.floor(ctx.defender.modelCount / 5) * value
      return { ...state, blastBonus: bonus }
    },
  },
  {
    name: 'Cleave',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Cleave'),
    apply: (state, ctx) => {
      const value = getKeywordValue(ctx.weapon, 'Cleave') ?? 1
      const bonus = Math.floor(ctx.defender.modelCount / 5) * value
      return { ...state, blastBonus: state.blastBonus + bonus }
    },
  },

  // === Hit modifiers ===
  {
    name: 'Torrent',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Torrent'),
    apply: (state) => ({ ...state, autoHit: true }),
  },
  {
    name: 'Heavy',
    isActive: (ctx) => ctx.options.remainedStationary && hasKeyword(ctx.weapon, 'Heavy'),
    apply: (state) => ({
      ...state,
      hitThreshold: state.hitThreshold - 1,
      hitModifiers: [...state.hitModifiers, '+1 Heavy'],
    }),
  },
  {
    name: 'Cover',
    isActive: (ctx) =>
      ctx.options.targetInCover &&
      ctx.weapon.type === 'ranged' &&
      !hasKeyword(ctx.weapon, 'Ignores Cover') &&
      !ctx.options.indirectFiring, // Indirect already applies cover penalty differently
    apply: (state) => ({
      ...state,
      hitThreshold: state.hitThreshold + 1,
      hitModifiers: [...state.hitModifiers, '-1 Cover'],
    }),
  },
  {
    name: 'Indirect Fire',
    isActive: (ctx) => ctx.options.indirectFiring && hasKeyword(ctx.weapon, 'Indirect Fire'),
    apply: (state, ctx) => {
      // Indirect Fire: unmodified 1-5 fails (so need 6+ effectively)
      // Unless stationary AND spotter available, then 1-3 fails (need 4+)
      let minHit = 6
      let note = 'Indirect Fire: 6+ to hit'
      if (ctx.options.remainedStationary && ctx.options.spotterAvailable) {
        minHit = 4
        note = 'Indirect Fire: 4+ to hit (stationary + spotter)'
      }
      return {
        ...state,
        overrideHitMinimum: minHit,
        hitOverrideNote: note,
        cannotRerollHits: true,
        notes: [...state.notes, 'Target has benefit of cover (Indirect Fire)'],
      }
    },
  },
  {
    name: 'Psychic',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Psychic'),
    apply: (state) => ({
      ...state,
      hitModifiers: [], // Psychic ignores all hit modifiers
      hitThreshold: state.hitThreshold, // Reset would need base — we'll just add a note
      notes: [...state.notes, 'Psychic — can ignore hit modifiers'],
    }),
  },

  // === Crit hit effects ===
  {
    name: 'Lethal Hits',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Lethal Hits'),
    apply: (state) => ({
      ...state,
      critHitEffects: [...state.critHitEffects, 'Lethal Hits on 6'],
    }),
  },
  {
    name: 'Sustained Hits',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Sustained Hits'),
    apply: (state, ctx) => {
      const value = getKeywordValue(ctx.weapon, 'Sustained Hits') ?? 1
      return {
        ...state,
        critHitEffects: [...state.critHitEffects, `Sustained Hits ${value} on 6`],
      }
    },
  },

  // === Wound modifiers ===
  {
    name: 'Lance',
    isActive: (ctx) => ctx.options.charged && hasKeyword(ctx.weapon, 'Lance'),
    apply: (state) => ({
      ...state,
      woundThreshold: Math.max(2, state.woundThreshold - 1),
      woundModifiers: [...state.woundModifiers, '+1 Lance (charged)'],
    }),
  },
  {
    name: 'Twin-linked',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Twin-linked'),
    apply: (state) => ({ ...state, rerollWounds: true }),
  },

  // === Crit wound effects ===
  {
    name: 'Anti',
    isActive: (ctx) => hasAntiKeyword(ctx.weapon, ctx.defender),
    apply: (state, ctx) => {
      const antiValue = getAntiValue(ctx.weapon, ctx.defender)
      if (antiValue !== null) {
        return {
          ...state,
          critWoundThreshold: Math.min(state.critWoundThreshold, antiValue),
          critWoundEffects: [...state.critWoundEffects, `Anti: critical wound on ${antiValue}+`],
        }
      }
      return state
    },
  },
  {
    name: 'Devastating Wounds',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Devastating Wounds'),
    apply: (state) => ({
      ...state,
      critWoundEffects: [...state.critWoundEffects, 'Devastating Wounds (crit wounds skip saves)'],
    }),
  },

  // === Save modifiers ===
  {
    name: 'Ignores Cover',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Ignores Cover'),
    apply: (state) => ({ ...state, ignoreCover: true }),
  },

  // === Damage modifiers ===
  {
    name: 'Melta',
    isActive: (ctx) => ctx.options.inHalfRange && hasKeyword(ctx.weapon, 'Melta'),
    apply: (state, ctx) => {
      const value = getKeywordValue(ctx.weapon, 'Melta') ?? 2
      return {
        ...state,
        bonusDamage: state.bonusDamage + value,
        bonusDamageNote: `+${value} Melta (half range)`,
      }
    },
  },

  // === Informational modifiers ===
  {
    name: 'One Shot',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'One Shot'),
    apply: (state) => ({
      ...state,
      notes: [...state.notes, 'One Shot — once per battle'],
    }),
  },
  {
    name: 'Pistol',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Pistol') || hasKeyword(ctx.weapon, 'Close-Quarters'),
    apply: (state) => ({
      ...state,
      notes: [...state.notes, 'Close-Quarters — can fire in Engagement Range'],
    }),
  },
  {
    name: 'Assault',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Assault'),
    apply: (state) => ({
      ...state,
      notes: [...state.notes, 'Assault — can fire after Advancing'],
    }),
  },
  {
    name: 'Extra Attacks',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Extra Attacks'),
    apply: (state) => ({
      ...state,
      notes: [...state.notes, 'Extra Attacks — used in addition to other melee weapons'],
    }),
  },
  {
    name: 'Hazardous',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Hazardous'),
    apply: (state) => ({
      ...state,
      notes: [...state.notes, 'Hazardous — risk mortal wounds to self after attacking'],
    }),
  },
  {
    name: 'Precision',
    isActive: (ctx) => hasKeyword(ctx.weapon, 'Precision'),
    apply: (state) => ({
      ...state,
      notes: [...state.notes, 'Precision — can allocate to Character models'],
    }),
  },
]

// --- Main calculation ---

export function calculateAttack(
  attacker: ParsedUnit,
  weapon: ParsedWeapon,
  defender: ParsedUnit,
  options: CombatOptions,
  customRules: CustomRule[] = []
): AttackResult {
  const ctx: AttackContext = { attacker, weapon, defender, options }

  // Build initial state
  const numericAttacks = parseInt(weapon.attacks)
  let state: AttackState = {
    attacksPerModel: isNaN(numericAttacks) ? null : numericAttacks,
    attacksExpression: weapon.attacks,
    bonusAttacksPerModel: 0,
    blastBonus: 0,
    hitThreshold: weapon.skill,
    hitModifiers: [],
    autoHit: false,
    critHitEffects: [],
    overrideHitMinimum: null,
    hitOverrideNote: null,
    cannotRerollHits: false,
    woundThreshold: getWoundThreshold(weapon.strength, defender.toughness),
    woundModifiers: [],
    critWoundThreshold: 6,
    critWoundEffects: [],
    rerollWounds: false,
    apValue: weapon.ap,
    ignoreCover: false,
    damageExpression: weapon.damage,
    bonusDamage: 0,
    bonusDamageNote: null,
    notes: [],
  }

  // Run pipeline
  for (const modifier of MODIFIERS) {
    if (modifier.isActive(ctx)) {
      state = modifier.apply(state, ctx)
    }
  }

  // Apply custom rules
  state = applyCustomRules(state, customRules)

  // Clamp hit threshold (before override check)
  state.hitThreshold = Math.max(2, Math.min(6, state.hitThreshold))

  // If indirect fire overrides the hit threshold
  const effectiveHitThreshold = state.overrideHitMinimum !== null
    ? state.overrideHitMinimum
    : state.hitThreshold

  // Build output
  return {
    numberOfDice: formatDiceCount(attacker.modelCount, state),
    autoHit: state.autoHit,
    hitThreshold: effectiveHitThreshold,
    hitModifierNote: state.hitModifiers.length > 0
      ? `${weapon.skill}+ base, ${state.hitModifiers.join(', ')}`
      : null,
    hitOverrideNote: state.overrideHitMinimum !== null
      ? state.hitOverrideNote
      : null,
    critHitEffects: state.critHitEffects,
    woundThreshold: state.woundThreshold,
    woundModifierNote: state.woundModifiers.length > 0
      ? `${getWoundThreshold(weapon.strength, defender.toughness)}+ base, ${state.woundModifiers.join(', ')}`
      : null,
    critWoundThreshold: state.critWoundThreshold,
    critWoundEffects: state.critWoundEffects,
    rerollWounds: state.rerollWounds,
    cannotRerollHits: state.cannotRerollHits,
    saveDisplay: calculateSaveDisplay(state.apValue, defender.save, defender.invulnerableSave),
    feelNoPainDisplay: defender.feelNoPain
      ? `${defender.feelNoPain}+ Feel No Pain`
      : null,
    weaponDamage: formatDamage(state),
    notes: state.notes,
  }
}

// --- Expected Wounds Estimation ---

/**
 * Estimate the expected number of unsaved wounds that get through.
 * Uses average values for variable dice expressions.
 */
export function estimateWounds(
  attacker: ParsedUnit,
  weapon: ParsedWeapon,
  defender: ParsedUnit,
  options: CombatOptions,
  customRules: CustomRule[] = []
): number {
  const ctx: AttackContext = { attacker, weapon, defender, options }

  // Build state through pipeline
  const numericAttacks = parseInt(weapon.attacks)
  let state: AttackState = {
    attacksPerModel: isNaN(numericAttacks) ? null : numericAttacks,
    attacksExpression: weapon.attacks,
    bonusAttacksPerModel: 0,
    blastBonus: 0,
    hitThreshold: weapon.skill,
    hitModifiers: [],
    autoHit: false,
    critHitEffects: [],
    overrideHitMinimum: null,
    hitOverrideNote: null,
    cannotRerollHits: false,
    woundThreshold: getWoundThreshold(weapon.strength, defender.toughness),
    woundModifiers: [],
    critWoundThreshold: 6,
    critWoundEffects: [],
    rerollWounds: false,
    apValue: weapon.ap,
    ignoreCover: false,
    damageExpression: weapon.damage,
    bonusDamage: 0,
    bonusDamageNote: null,
    notes: [],
  }

  for (const modifier of MODIFIERS) {
    if (modifier.isActive(ctx)) {
      state = modifier.apply(state, ctx)
    }
  }

  // Apply custom rules
  state = applyCustomRules(state, customRules)

  state.hitThreshold = Math.max(2, Math.min(6, state.hitThreshold))

  // Calculate number of attacks
  const attacksPerModel = state.attacksPerModel ?? averageDiceExpression(state.attacksExpression)
  const totalAttacks = (attacksPerModel + state.bonusAttacksPerModel + state.blastBonus) * attacker.modelCount

  // Hit probability
  const effectiveHitThreshold = state.overrideHitMinimum ?? state.hitThreshold
  let hitProb = state.autoHit ? 1 : (7 - effectiveHitThreshold) / 6

  // Re-roll hits from custom rules
  const hasRerollHits = customRules.some(r => r.effects.rerollHits)
  if (hasRerollHits && !state.autoHit) {
    hitProb = hitProb + (1 - hitProb) * hitProb
  }

  // Sustained hits bonus (extra hits on crit)
  const sustainedHits = getSustainedHitsValue(state)
  const critHitProb = 1 / 6
  const extraHitsPerAttack = sustainedHits > 0 ? critHitProb * sustainedHits : 0

  // Lethal hits: crits skip wound roll
  const hasLethal = state.critHitEffects.some(e => e.toLowerCase().includes('lethal'))

  let hitsToWound: number
  let autoWounds: number

  if (hasLethal) {
    // Non-crit hits go through wound roll, crit hits auto-wound
    const normalHitProb = hitProb - critHitProb
    hitsToWound = totalAttacks * Math.max(0, normalHitProb) + totalAttacks * extraHitsPerAttack
    autoWounds = totalAttacks * critHitProb
  } else {
    hitsToWound = totalAttacks * (hitProb + extraHitsPerAttack)
    autoWounds = 0
  }

  // Wound probability
  const woundProb = (7 - state.woundThreshold) / 6
  // Twin-linked rerolls failed wounds
  const effectiveWoundProb = state.rerollWounds
    ? woundProb + (1 - woundProb) * woundProb
    : woundProb

  const woundsFromRolls = hitsToWound * effectiveWoundProb
  const totalWoundsBeforeSave = woundsFromRolls + autoWounds

  // Save probability
  const modifiedSave = defender.save + state.apValue
  let invuln = defender.invulnerableSave

  // Check for custom rule invuln override
  for (const rule of customRules) {
    if (rule.effects.invulnOverride) {
      const ruleInvuln = rule.effects.invulnOverride
      if (invuln === null || ruleInvuln < invuln) {
        invuln = ruleInvuln
      }
    }
  }

  let effectiveSave: number

  if (invuln !== null) {
    effectiveSave = Math.min(modifiedSave, invuln)
  } else {
    effectiveSave = modifiedSave
  }

  const saveProb = effectiveSave <= 6 ? (7 - effectiveSave) / 6 : 0
  const unsavedWounds = totalWoundsBeforeSave * (1 - saveProb)

  // Feel No Pain
  let fnp = defender.feelNoPain
  // Check for custom rule FNP
  for (const rule of customRules) {
    if (rule.effects.feelNoPain) {
      const ruleFnp = rule.effects.feelNoPain
      if (fnp === null || ruleFnp < fnp) {
        fnp = ruleFnp
      }
    }
  }
  const fnpProb = fnp ? (7 - fnp) / 6 : 0
  const woundsAfterFnp = unsavedWounds * (1 - fnpProb)

  // Damage per wound
  const damageNum = parseInt(state.damageExpression)
  const damagePerWound = (isNaN(damageNum) ? averageDiceExpression(state.damageExpression) : damageNum) + state.bonusDamage

  return woundsAfterFnp * damagePerWound
}

/** Parse average value from dice expressions like "D6", "D3", "2D6", "D6+1" */
function averageDiceExpression(expr: string): number {
  const cleaned = expr.trim().toUpperCase()

  // Match patterns like "2D6+1", "D3", "D6"
  const match = cleaned.match(/^(\d*)D(\d+)([+-]\d+)?$/)
  if (match) {
    const count = match[1] ? parseInt(match[1]) : 1
    const sides = parseInt(match[2])
    const modifier = match[3] ? parseInt(match[3]) : 0
    return count * ((sides + 1) / 2) + modifier
  }

  // Plain number
  const num = parseInt(cleaned)
  if (!isNaN(num)) return num

  return 1 // fallback
}

/** Extract sustained hits value from crit effects */
function getSustainedHitsValue(state: AttackState): number {
  for (const effect of state.critHitEffects) {
    const match = effect.match(/sustained hits? (\d+)/i)
    if (match) return parseInt(match[1])
  }
  return 0
}

// --- Apply Custom Rules ---

function applyCustomRules(state: AttackState, rules: CustomRule[]): AttackState {
  for (const rule of rules) {
    const { effects } = rule

    if (effects.hitModifier) {
      state = {
        ...state,
        hitThreshold: state.hitThreshold - effects.hitModifier,
        hitModifiers: [...state.hitModifiers, `${effects.hitModifier > 0 ? '+' : ''}${effects.hitModifier} ${rule.name}`],
      }
    }

    if (effects.woundModifier) {
      state = {
        ...state,
        woundThreshold: Math.max(2, state.woundThreshold - effects.woundModifier),
        woundModifiers: [...state.woundModifiers, `${effects.woundModifier > 0 ? '+' : ''}${effects.woundModifier} ${rule.name}`],
      }
    }

    if (effects.ignoresCover) {
      state = { ...state, ignoreCover: true }
    }

    if (effects.apModifier) {
      state = { ...state, apValue: state.apValue + effects.apModifier }
    }

    if (effects.rerollHits) {
      state = {
        ...state,
        notes: [...state.notes, `Re-roll hits (${rule.name})`],
      }
    }

    if (effects.rerollWounds) {
      state = { ...state, rerollWounds: true }
    }

    if (effects.bonusDamage) {
      state = {
        ...state,
        bonusDamage: state.bonusDamage + effects.bonusDamage,
        bonusDamageNote: `+${state.bonusDamage + effects.bonusDamage} (${rule.name})`,
      }
    }

    if (effects.critHitOn) {
      const threshold = effects.critHitOn
      state = {
        ...state,
        critHitEffects: [...state.critHitEffects, `Critical hits on ${threshold}+ (${rule.name})`],
      }
    }

    if (effects.critWoundOn) {
      state = {
        ...state,
        critWoundThreshold: Math.min(state.critWoundThreshold, effects.critWoundOn),
        critWoundEffects: [...state.critWoundEffects, `Critical wounds on ${effects.critWoundOn}+ (${rule.name})`],
      }
    }

    if (effects.sustainedHits) {
      state = {
        ...state,
        critHitEffects: [...state.critHitEffects, `Sustained Hits ${effects.sustainedHits} (${rule.name})`],
      }
    }

    if (effects.lethalHits) {
      state = {
        ...state,
        critHitEffects: [...state.critHitEffects, `Lethal Hits (${rule.name})`],
      }
    }

    if (effects.saveModifier) {
      state = {
        ...state,
        apValue: state.apValue - effects.saveModifier,
        notes: [...state.notes, `Save modified by ${effects.saveModifier > 0 ? '+' : ''}${effects.saveModifier} (${rule.name})`],
      }
    }

    if (effects.feelNoPain) {
      state = {
        ...state,
        notes: [...state.notes, `Feel No Pain ${effects.feelNoPain}+ (${rule.name})`],
      }
    }

    if (effects.invulnOverride) {
      state = {
        ...state,
        notes: [...state.notes, `Invulnerable Save ${effects.invulnOverride}+ (${rule.name})`],
      }
    }
  }

  return state
}

// --- Helpers ---

function formatDiceCount(models: number, state: AttackState): string {
  const { attacksPerModel, attacksExpression, bonusAttacksPerModel, blastBonus } = state

  if (attacksPerModel === null) {
    const totalBonus = bonusAttacksPerModel + blastBonus
    if (totalBonus > 0) {
      return `(${attacksExpression}+${totalBonus}) × ${models} models`
    }
    return `${attacksExpression} × ${models} models`
  }

  const perModel = attacksPerModel + bonusAttacksPerModel + blastBonus
  return `${perModel * models} dice`
}

function formatDamage(state: AttackState): string {
  if (state.bonusDamage > 0) {
    return `${state.damageExpression}+${state.bonusDamage} ${state.bonusDamageNote ? `(${state.bonusDamageNote})` : ''}`
  }
  return state.damageExpression
}

function getWoundThreshold(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2
  if (strength > toughness) return 3
  if (strength === toughness) return 4
  if (strength * 2 <= toughness) return 6
  return 5
}

function calculateSaveDisplay(ap: number, save: number, invuln: number | null): string {
  const modifiedSave = save + ap

  if (invuln !== null) {
    if (modifiedSave > 6) {
      return `${invuln}+ Invulnerable Save (regular save negated)`
    }
    if (invuln <= modifiedSave) {
      return `${modifiedSave}+ Save or ${invuln}+ Invulnerable Save ✓`
    }
    return `${modifiedSave}+ Save ✓ or ${invuln}+ Invulnerable Save`
  }

  if (modifiedSave > 6) {
    return 'No save'
  }

  return `${modifiedSave}+ Save`
}

function hasKeyword(weapon: ParsedWeapon, keyword: string): boolean {
  return weapon.keywords.some((k) => k.name.toLowerCase() === keyword.toLowerCase())
}

function getKeywordValue(weapon: ParsedWeapon, keyword: string): number | null {
  const kw = weapon.keywords.find((k) => k.name.toLowerCase() === keyword.toLowerCase())
  return kw?.value ?? null
}

/**
 * Check if weapon has an Anti-X keyword that matches a defender keyword.
 * Anti keywords are stored as e.g. { name: "Anti-Vehicle", value: 4 }
 */
function hasAntiKeyword(weapon: ParsedWeapon, defender: ParsedUnit): boolean {
  return weapon.keywords.some((k) => {
    if (!k.name.toLowerCase().startsWith('anti-')) return false
    const targetKeyword = k.name.slice(5) // remove "Anti-"
    return defender.keywords.some(
      (dk) => dk.toLowerCase() === targetKeyword.toLowerCase()
    )
  })
}

function getAntiValue(weapon: ParsedWeapon, defender: ParsedUnit): number | null {
  for (const kw of weapon.keywords) {
    if (!kw.name.toLowerCase().startsWith('anti-')) continue
    const targetKeyword = kw.name.slice(5)
    if (defender.keywords.some((dk) => dk.toLowerCase() === targetKeyword.toLowerCase())) {
      return kw.value ?? null
    }
  }
  return null
}
