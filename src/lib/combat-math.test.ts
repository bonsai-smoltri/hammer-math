import { describe, expect, it } from 'vitest'
import {
  formatAttackDice,
  formatHitLine,
  formatSaveLine,
  formatWoundLine,
  resolveAttack,
  splitBracketed,
} from './combat-math'
import { kw, unit, weapon } from './rules/fixtures'

describe('splitBracketed', () => {
  it('marks parenthesised detail as dimmable', () => {
    expect(splitBracketed('Hitting on 3+ (3+ base, +1 Heavy)')).toEqual([
      { text: 'Hitting on 3+ ', dim: false },
      { text: '(3+ base, +1 Heavy)', dim: true },
    ])
  })

  it('handles several bracket groups and trailing text', () => {
    expect(splitBracketed('3+ save (AP -1) or invuln (4+)')).toEqual([
      { text: '3+ save ', dim: false },
      { text: '(AP -1)', dim: true },
      { text: ' or invuln ', dim: false },
      { text: '(4+)', dim: true },
    ])
  })

  it('leaves plain text alone', () => {
    expect(splitBracketed('Automatically hits')).toEqual([{ text: 'Automatically hits', dim: false }])
    expect(splitBracketed('')).toEqual([{ text: '', dim: false }])
  })
})

describe('breakdown lines', () => {
  const resolved = resolveAttack({
    attacker: unit({ modelCount: 5 }),
    weapon: weapon({ attacks: '2', count: 5, skill: 4, keywords: [kw('Heavy')] }),
    defender: unit({ id: 'target', save: 3 }),
    options: { remainedStationary: true, unengaged: true },
  })

  it('puts the supporting detail in brackets so it can be dimmed', () => {
    expect(formatAttackDice(resolved.profile)).toBe('10 dice — 2 × 5 weapons')
    expect(formatHitLine(resolved.profile)).toBe('Hitting on 3+ (4+ base, +1 Heavy)')
    expect(formatWoundLine(resolved.profile)).toBe('Wounding on 4+ (S4 vs T4)')
    expect(formatSaveLine(resolved.profile)).toBe('3+ save')

    for (const line of [formatHitLine(resolved.profile), formatWoundLine(resolved.profile)]) {
      expect(splitBracketed(line).some((segment) => segment.dim)).toBe(true)
    }
  })
})
