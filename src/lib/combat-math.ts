import type { ResolvedAttack, ResolvedProfile } from './rules/engine'
import { estimateExpectedDamage, resolveAttack } from './rules/engine'
import type { AttackInput } from './rules/engine'
import { averageDice, isFixedExpression } from './rules/dice'

/**
 * Presentation layer over the rules engine.
 *
 * All game logic lives in `lib/rules`; this module only turns a resolved attack
 * into the strings the UI shows. Nothing here parses state back out of text.
 */

export type { AttackInput, ResolvedAttack, ResolvedProfile }
export { resolveAttack }

/** Expected total damage for a target-priority comparison. */
export function estimateWounds(input: AttackInput): number {
  return estimateExpectedDamage(input)
}

export function formatAttackDice(profile: ResolvedProfile): string {
  const { attacksExpression, attacksPerWeapon, weaponCount, extraAttackDice } = profile
  const total = attacksPerWeapon * weaponCount

  if (isFixedExpression(attacksExpression)) {
    const suffix = extraAttackDice > 0 ? ` (incl. +${extraAttackDice} extra dice per weapon)` : ''
    return `${round(total)} dice — ${attacksPerWeapon} × ${weaponCount} weapon${weaponCount === 1 ? '' : 's'}${suffix}`
  }

  const base = averageDice(attacksExpression) ?? 1
  const bonus = attacksPerWeapon - base
  const expr = bonus > 0 ? `(${attacksExpression}+${round(bonus)})` : attacksExpression
  return `${expr} × ${weaponCount} weapon${weaponCount === 1 ? '' : 's'} — about ${round(total)} dice`
}

export function formatHitLine(profile: ResolvedProfile): string {
  if (profile.autoHit) return 'Automatically hits'

  if (profile.unmodifiedHitFloor !== null) {
    const parts = [`Unmodified ${profile.unmodifiedHitFloor}+ to hit`]
    if (profile.hitReroll === 'none') parts.push('no hit re-rolls')
    return parts.join(' — ')
  }

  const parts = [`Hitting on ${profile.hitThreshold}+`]
  const detail: string[] = []
  if (profile.hitModifierSources.length > 0) {
    detail.push(`${profile.baseHitThreshold}+ base, ${profile.hitModifierSources.join(', ')}`)
  }
  if (profile.hitReroll === 'failed') detail.push('re-roll failed hits')
  if (profile.hitReroll === 'ones') detail.push('re-roll hit rolls of 1')
  if (detail.length > 0) parts.push(`(${detail.join('; ')})`)
  return parts.join(' ')
}

export function formatCritHitLine(profile: ResolvedProfile): string | null {
  const parts: string[] = []
  if (profile.critHitOn !== 6) parts.push(`Critical hits on ${profile.critHitOn}+`)
  if (profile.sustainedHits > 0) parts.push(`Sustained Hits ${round(profile.sustainedHits)}`)
  if (profile.lethalHits) parts.push('Lethal Hits')
  if (parts.length === 0) return null
  return parts.join(', ')
}

export function formatWoundLine(profile: ResolvedProfile): string {
  if (profile.autoWound) return 'Automatically wounds'
  const parts = [`Wounding on ${profile.woundThreshold}+`]
  const detail: string[] = [`S${profile.strength} vs T${profile.toughness}`]
  if (profile.woundModifierSources.length > 0) detail.push(profile.woundModifierSources.join(', '))
  if (profile.woundReroll === 'failed') detail.push('re-roll failed wounds')
  if (profile.woundReroll === 'ones') detail.push('re-roll wound rolls of 1')
  parts.push(`(${detail.join('; ')})`)
  return parts.join(' ')
}

export function formatCritWoundLine(profile: ResolvedProfile): string | null {
  const parts: string[] = []
  if (profile.critWoundOn !== 6) parts.push(`Critical wounds on ${profile.critWoundOn}+`)
  if (profile.devastatingWounds) parts.push('Devastating Wounds (crits become mortal wounds)')
  if (parts.length === 0) return null
  return parts.join(', ')
}

export function formatSaveLine(profile: ResolvedProfile): string {
  const ap = profile.ap > 0 ? ` (AP -${profile.ap})` : ''
  if (profile.effectiveSave === null) return `No save possible${ap}`

  if (profile.savingWith === 'invulnerable') {
    const armour = profile.armourSave <= 6 ? `${profile.armourSave}+ armour, ` : 'armour negated, '
    return `${armour}${profile.invulnerableSave}+ invulnerable save${ap}`
  }

  const invuln =
    profile.invulnerableSave !== null ? ` (${profile.invulnerableSave}+ invulnerable is worse)` : ''
  return `${profile.effectiveSave}+ save${ap}${invuln}`
}

export function formatDamageLine(profile: ResolvedProfile): string {
  return `${profile.damageExpression} damage per unsaved wound (avg ${round(profile.damagePerWound)})`
}

export function formatFeelNoPain(profile: ResolvedProfile): string | null {
  return profile.feelNoPain === null ? null : `Feel No Pain ${profile.feelNoPain}+`
}

/** One-line reminders: rule notes plus the engine's own warnings. */
export function collectNotes(resolved: ResolvedAttack): string[] {
  const notes = [...resolved.profile.notes]
  if (resolved.profile.targetHasCover) notes.push('Target has the benefit of cover (-1 to hit).')
  return notes
}

export interface TextSegment {
  text: string
  /** Supporting detail — rendered dimmed so the rule text reads first. */
  dim: boolean
}

/**
 * Splits a breakdown line into rule text and the parenthesised detail behind it,
 * e.g. "Hitting on 3+ (3+ base, +1 Heavy)" → ["Hitting on 3+ ", "(3+ base, +1 Heavy)"].
 */
export function splitBracketed(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  const pattern = /\([^)]*\)/g
  let index = 0

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > index) segments.push({ text: text.slice(index, start), dim: false })
    segments.push({ text: match[0], dim: true })
    index = start + match[0].length
  }

  if (index < text.length) segments.push({ text: text.slice(index), dim: false })
  return segments.length > 0 ? segments : [{ text, dim: false }]
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
