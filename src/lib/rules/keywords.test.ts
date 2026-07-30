import { describe, expect, it } from 'vitest'
import {
  collectKeywords,
  expandKeywordAlternatives,
  matchesKeywordQuery,
  normalizeKeyword,
  parseAntiKeyword,
  resolveUnitKeywords,
  targetMatchesUnit,
} from './keywords'
import { addToExpression, averageDice, isFixedExpression, parseDiceExpression } from './dice'
import { parseRuleDefinitions } from './validate'
import { attachment, kw, unit } from './fixtures'
import { STARTER_RULES } from './library'

describe('normalizeKeyword', () => {
  it.each([
    ['INFANTRY', 'infantry'],
    ['Faction: T’au Empire', "t'au empire"],
    ["Faction: T'au Empire", "t'au empire"],
    ['[SUSTAINED HITS]', 'sustained hits'],
    ['Twin‑linked', 'twin-linked'],
    ['Vehicles', 'vehicle'],
    ['Characters', 'character'],
    ['  Adeptus   Astartes ', 'adeptus astartes'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeKeyword(input)).toBe(expected)
  })

  it('leaves keywords ending in double s alone', () => {
    expect(normalizeKeyword('Boss')).toBe('boss')
  })
})

describe('keyword queries', () => {
  it('treats slashes as alternatives', () => {
    expect(expandKeywordAlternatives('Infantry/Beasts/Swarm')).toEqual(['Infantry', 'Beasts', 'Swarm'])
    expect(matchesKeywordQuery(['Swarm'], { any: ['Infantry/Beasts/Swarm'] })).toBe(true)
  })

  it('supports all and none', () => {
    expect(matchesKeywordQuery(['Infantry', 'Character'], { all: ['Infantry', 'Character'] })).toBe(true)
    expect(matchesKeywordQuery(['Infantry'], { all: ['Infantry', 'Character'] })).toBe(false)
    expect(matchesKeywordQuery(['Vehicle'], { none: ['Vehicle'] })).toBe(false)
  })
})

describe('parseAntiKeyword', () => {
  it('reads the target keyword and threshold', () => {
    expect(parseAntiKeyword(kw('Anti-Vehicle', 4))).toEqual({ keyword: 'Vehicle', threshold: 4 })
  })

  it('returns null without a threshold', () => {
    expect(parseAntiKeyword(kw('Anti-Vehicle'))).toBe(null)
    expect(parseAntiKeyword(kw('Lethal Hits'))).toBe(null)
  })
})

describe('resolveUnitKeywords', () => {
  const leader = unit({ id: 'leader', keywords: ['Infantry', 'Character'] })
  const squad = unit({ id: 'squad', keywords: ['Infantry', 'Battleline'] })
  const unitsById = new Map([
    [leader.id, leader],
    [squad.id, squad],
  ])

  it('merges keywords in both directions', () => {
    const att = attachment({ sourceUnitId: 'leader', unitIds: ['squad'], keywords: ['Oathsworn'] })
    const squadKw = resolveUnitKeywords(squad, [att], unitsById)
    const leaderKw = resolveUnitKeywords(leader, [att], unitsById)

    expect(squadKw.keywords.map(normalizeKeyword)).toContain('character')
    expect(squadKw.keywords.map(normalizeKeyword)).toContain('oathsworn')
    expect(leaderKw.keywords.map(normalizeKeyword)).toContain('battleline')
    expect(squadKw.attachmentNames).toEqual(['Test Attachment'])
  })

  it('does not duplicate keywords the unit already has', () => {
    const att = attachment({ unitIds: ['squad'], keywords: ['INFANTRY'] })
    const result = resolveUnitKeywords(squad, [att], unitsById)
    expect(result.keywords.filter((k) => normalizeKeyword(k) === 'infantry')).toHaveLength(1)
  })

  it('collects granted rule ids', () => {
    const att = attachment({ unitIds: ['squad'], ruleIds: ['a', 'b', 'a'] })
    expect(resolveUnitKeywords(squad, [att], unitsById).grantedRuleIds).toEqual(['a', 'b'])
  })

  it('leaves unrelated units untouched', () => {
    const att = attachment({ unitIds: ['other'], keywords: ['Tagged'] })
    expect(resolveUnitKeywords(squad, [att], unitsById).keywords).toEqual(squad.keywords)
  })
})

describe('targetMatchesUnit', () => {
  it('matches global targets', () => {
    expect(targetMatchesUnit({ type: 'global' }, 'x', [])).toBe(true)
    expect(targetMatchesUnit(undefined, 'x', [])).toBe(true)
  })

  it('requires a keyword list for keyword targets', () => {
    expect(targetMatchesUnit({ type: 'keyword', keywords: [] }, 'x', ['Infantry'])).toBe(false)
  })

  it('matches unit ids', () => {
    expect(targetMatchesUnit({ type: 'unit', unitIds: ['a'] }, 'a', [])).toBe(true)
    expect(targetMatchesUnit({ type: 'unit', unitIds: ['a'] }, 'b', [])).toBe(false)
  })
})

describe('collectKeywords', () => {
  it('de-duplicates case-insensitively and sorts', () => {
    const result = collectKeywords([
      unit({ id: '1', keywords: ['Vehicle', 'infantry'] }),
      unit({ id: '2', keywords: ['INFANTRY', 'Character'] }),
    ])
    expect(result).toEqual(['Character', 'infantry', 'Vehicle'])
  })

  it('drops the BattleScribe category prefix so faction keywords read like any other', () => {
    const result = collectKeywords([
      unit({ id: '1', keywords: ['Faction: World Eaters', 'Khorne'] }),
      unit({ id: '2', keywords: ['World Eaters'] }),
    ])
    expect(result).toEqual(['Khorne', 'World Eaters'])
  })
})

describe('dice expressions', () => {
  it.each([
    ['D6', 3.5],
    ['D3', 2],
    ['2D6', 7],
    ['D6+1', 4.5],
    ['2D3+1', 5],
    ['3', 3],
    ['-1', -1],
  ])('averages %s', (expr, expected) => {
    expect(averageDice(expr)).toBeCloseTo(expected, 6)
  })

  it('returns null for unreadable expressions', () => {
    expect(averageDice('lots')).toBe(null)
    expect(parseDiceExpression('')).toBe(null)
  })

  it('does not read 2D3 as 2', () => {
    expect(isFixedExpression('2D3')).toBe(false)
    expect(averageDice('2D3')).toBe(4)
  })

  it('adds modifiers while keeping dice notation', () => {
    expect(addToExpression('D6', 2)).toBe('D6+2')
    expect(addToExpression('D6+1', -1)).toBe('D6')
    expect(addToExpression('2', 1)).toBe('3')
  })
})

describe('imported rule validation', () => {
  it('keeps well-formed rules and normalises their target', () => {
    const parsed = parseRuleDefinitions([
      {
        id: 'shared',
        name: 'Shared Rule',
        side: 'attacker',
        source: 'custom',
        effects: { hitRerolls: 'failed' },
        target: { type: 'keyword', keywords: ['Khorne', 5], keywordMatch: 'all' },
      },
    ])

    expect(parsed).toHaveLength(1)
    expect(parsed[0].target).toEqual({ type: 'keyword', keywords: ['Khorne'], keywordMatch: 'all' })
    expect(parsed[0].builtIn).toBe(false)
  })

  it('drops anything that is not a rule', () => {
    const parsed = parseRuleDefinitions([
      { id: 'bad-side', name: 'Bad', side: 'sideways', effects: {} },
      { id: 'bad-source', name: 'Bad', side: 'attacker', source: 'nonsense', effects: {} },
      { id: 'no-effects', name: 'Bad', side: 'attacker' },
      { nonsense: true },
      null,
      'nope',
    ])
    expect(parsed).toEqual([])
  })

  it('falls back to a global target when the selector is unusable', () => {
    const parsed = parseRuleDefinitions([
      { id: 'r', name: 'R', side: 'both', effects: {}, target: { type: 'nonsense' } },
    ])
    expect(parsed[0].target).toEqual({ type: 'global' })
    expect(parsed[0].source).toBe('custom')
  })

  it('keeps unit targets as a list of ids', () => {
    const parsed = parseRuleDefinitions([
      { id: 'r', name: 'R', side: 'both', effects: {}, target: { type: 'unit', unitIds: ['a', 2, 'b'] } },
    ])
    expect(parsed[0].target).toEqual({ type: 'unit', unitIds: ['a', 'b'] })
  })
})

describe('starter library', () => {
  it('has unique ids', () => {
    const ids = STARTER_RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every rule a name, side and effects', () => {
    for (const rule of STARTER_RULES) {
      expect(rule.name.length).toBeGreaterThan(0)
      expect(['attacker', 'defender', 'both']).toContain(rule.side)
      expect(rule.effects).toBeTypeOf('object')
      expect(rule.builtIn).toBe(true)
    }
  })

  it('covers every core weapon ability', () => {
    const names = STARTER_RULES.map((r) => normalizeKeyword(r.name))
    for (const ability of [
      'Anti',
      'Assault',
      'Blast',
      'Cleave',
      'Close-Quarters',
      'Devastating Wounds',
      'Extra Attacks',
      'Hazardous',
      'Heavy',
      'Ignores Cover',
      'Indirect Fire',
      'Lance',
      'Lethal Hits',
      'Melta',
      'One Shot',
      'Pistol',
      'Precision',
      'Psychic',
      'Rapid Fire',
      'Sustained Hits',
      'Torrent',
      'Twin-linked',
    ]) {
      expect(names).toContain(normalizeKeyword(ability))
    }
  })
})
