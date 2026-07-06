import type { ParsedUnit, ParsedWeapon } from '../types/roster'

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
  options: CombatOptions
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
