import { describe, expect, it } from 'vitest'
import {
  hasMathematicalEffect,
  resolveAttack,
  resolveUnitAbilities,
  woundThresholdFor,
} from './engine'
import { attachment, kw, rule, unit, weapon } from './fixtures'

const opts = { unengaged: true, singleTarget: true }

function attack(input: Parameters<typeof resolveAttack>[0]) {
  return resolveAttack({ ...input, options: { ...opts, ...(input.options ?? {}) } })
}

describe('wound threshold table (05.02)', () => {
  it.each([
    [8, 4, 2],
    [5, 4, 3],
    [4, 4, 4],
    [3, 4, 5],
    [2, 4, 6],
    [1, 4, 6],
  ])('S%i vs T%i needs %i+', (s, t, expected) => {
    expect(woundThresholdFor(s, t)).toBe(expected)
  })
})

describe('baseline attack', () => {
  it('multiplies attacks by the number of weapons, not models', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 5 }),
      weapon: weapon({ attacks: '2', count: 5 }),
      defender: unit({ id: 'target' }),
    })
    expect(resolved.profile.weaponCount).toBe(5)
    expect(resolved.profile.totalAttacks).toBe(10)
    expect(resolved.profile.hitThreshold).toBe(3)
    expect(resolved.profile.woundThreshold).toBe(4)
    // 10 attacks * 4/6 hit * 3/6 wound * 2/6 fail save * 1 damage
    expect(resolved.estimate.expectedDamage).toBeCloseTo(10 * (4 / 6) * (3 / 6) * (2 / 6), 6)
  })

  it('uses the roster weapon count when the unit has fewer weapons than models', () => {
    // One heavy weapon in a five-model squad fires once, not five times.
    const resolved = attack({
      attacker: unit({ modelCount: 5 }),
      weapon: weapon({ attacks: '3', count: 1 }),
      defender: unit({ id: 'target' }),
    })
    expect(resolved.profile.totalAttacks).toBe(3)
  })

  it('handles more weapons than models (twin loadouts)', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ attacks: '1', count: 2 }),
      defender: unit({ id: 'target' }),
    })
    expect(resolved.profile.totalAttacks).toBe(2)
  })

  it('honours an explicit weapon count override', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 5 }),
      weapon: weapon({ attacks: '3', count: 5 }),
      defender: unit({ id: 'target' }),
      weaponCount: 1,
    })
    expect(resolved.profile.totalAttacks).toBe(3)
  })

  it('averages variable attack characteristics', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ attacks: '2D3' }),
      defender: unit({ id: 'target' }),
    })
    expect(resolved.profile.totalAttacks).toBeCloseTo(4, 6)
  })
})

describe('weapon abilities', () => {
  it('Rapid Fire X only adds dice within half range', () => {
    const base = {
      attacker: unit({ modelCount: 2 }),
      weapon: weapon({ attacks: '1', count: 2, keywords: [kw('Rapid Fire', 2)] }),
      defender: unit({ id: 'target' }),
    }
    expect(attack(base).profile.totalAttacks).toBe(2)
    expect(attack({ ...base, options: { inHalfRange: true } }).profile.totalAttacks).toBe(6)
  })

  it('Blast adds a dice per five models in the target unit', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ attacks: '3', keywords: [kw('Blast')] }),
      defender: unit({ id: 'target', modelCount: 12 }),
    })
    expect(resolved.profile.totalAttacks).toBe(5)
  })

  it('Cleave needs all attacks on a single target', () => {
    const base = {
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ attacks: '3', type: 'melee' as const, keywords: [kw('Cleave', 1)] }),
      defender: unit({ id: 'target', modelCount: 10 }),
    }
    expect(attack(base).profile.totalAttacks).toBe(5)
    expect(attack({ ...base, options: { singleTarget: false } }).profile.totalAttacks).toBe(3)
  })

  it('Torrent auto-hits and cannot generate critical hits', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ attacks: '6', skill: 5, keywords: [kw('Torrent'), kw('Sustained Hits', 1)] }),
      defender: unit({ id: 'target' }),
    })
    expect(resolved.profile.autoHit).toBe(true)
    expect(resolved.estimate.hits).toBe(6)
    expect(resolved.estimate.criticalHits).toBe(0)
  })

  it('Heavy needs a stationary, unengaged unit in the Shooting phase', () => {
    const base = {
      attacker: unit(),
      weapon: weapon({ skill: 4, keywords: [kw('Heavy')] }),
      defender: unit({ id: 'target' }),
    }
    expect(attack(base).profile.hitThreshold).toBe(4)
    expect(attack({ ...base, options: { remainedStationary: true } }).profile.hitThreshold).toBe(3)
    // 24.16 also excludes units that were set up on the battlefield this turn.
    expect(
      attack({ ...base, options: { remainedStationary: true, setUpThisTurn: true } }).profile
        .hitThreshold
    ).toBe(4)
    expect(
      attack({ ...base, options: { remainedStationary: true, unengaged: false } }).profile
        .hitThreshold
    ).toBe(4)
  })

  it('Melta adds damage only within half range', () => {
    const base = {
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ damage: 'D6', keywords: [kw('Melta', 2)] }),
      defender: unit({ id: 'target' }),
    }
    expect(attack(base).profile.damagePerWound).toBeCloseTo(3.5, 6)
    expect(attack({ ...base, options: { inHalfRange: true } }).profile.damagePerWound).toBeCloseTo(5.5, 6)
  })

  it('Lance adds +1 to wound on the charge', () => {
    const base = {
      attacker: unit(),
      weapon: weapon({ type: 'melee' as const, keywords: [kw('Lance')] }),
      defender: unit({ id: 'target' }),
    }
    expect(attack(base).profile.woundThreshold).toBe(4)
    expect(attack({ ...base, options: { charged: true } }).profile.woundThreshold).toBe(3)
  })

  it('Twin-linked re-rolls failed wound rolls', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ attacks: '6', keywords: [kw('Twin-linked')] }),
      defender: unit({ id: 'target' }),
    })
    // 6 attacks * 4/6 hits = 4 hits, wound on 4+ with a re-roll => 0.75
    expect(resolved.estimate.wounds).toBeCloseTo(4 * 0.75, 6)
  })

  it('Anti-X only applies against a matching target keyword', () => {
    const antiWeapon = weapon({ keywords: [kw('Anti-Vehicle', 4)] })
    const vsInfantry = attack({
      attacker: unit(),
      weapon: antiWeapon,
      defender: unit({ id: 'target', keywords: ['Infantry'] }),
    })
    const vsVehicle = attack({
      attacker: unit(),
      weapon: antiWeapon,
      defender: unit({ id: 'target', keywords: ['Vehicle'] }),
    })
    expect(vsInfantry.profile.critWoundOn).toBe(6)
    expect(vsVehicle.profile.critWoundOn).toBe(4)
  })

  it('picks the Anti ability that matches the target', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ keywords: [kw('Anti-Vehicle', 4), kw('Anti-Infantry', 2)] }),
      defender: unit({ id: 'target', keywords: ['Infantry'] }),
    })
    expect(resolved.profile.critWoundOn).toBe(2)
  })

  it('restricts abilities that name target keywords (24.01)', () => {
    const restricted = weapon({ keywords: [kw('Lethal Hits', undefined, ['Vehicle'])] })
    expect(
      attack({ attacker: unit(), weapon: restricted, defender: unit({ id: 't', keywords: ['Infantry'] }) })
        .profile.lethalHits
    ).toBe(false)
    expect(
      attack({ attacker: unit(), weapon: restricted, defender: unit({ id: 't', keywords: ['Vehicle'] }) })
        .profile.lethalHits
    ).toBe(true)
  })

  it('Sustained Hits adds hits on critical hits only', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ attacks: '6', keywords: [kw('Sustained Hits', 2)] }),
      defender: unit({ id: 'target' }),
    })
    // 6 attacks: 4 hits, 1 crit hit, +2 hits from the crit
    expect(resolved.estimate.hits).toBeCloseTo(6, 6)
  })

  it('Lethal Hits converts critical hits into automatic wounds', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ attacks: '6', strength: 4, keywords: [kw('Lethal Hits')] }),
      defender: unit({ id: 'target', toughness: 10 }),
    })
    // Wounding a T10 target with S4 needs 6s; the crit hit auto-wounds instead.
    const criticalHits = 1
    const normalHits = 6 * (4 / 6) - criticalHits
    expect(resolved.estimate.wounds).toBeCloseTo(normalHits * (1 / 6) + criticalHits, 6)
  })

  it('Devastating Wounds turns critical wounds into capped mortal wounds', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ attacks: '6', damage: '6', keywords: [kw('Devastating Wounds')] }),
      defender: unit({ id: 'target', wounds: 2, save: 2 }),
    })
    const critWounds = 6 * (4 / 6) * (1 / 6)
    // 6 damage against a 2W model only ever kills one model per critical wound.
    expect(resolved.estimate.mortalWounds).toBeCloseTo(critWounds * 2, 6)
  })

  it('Indirect Fire needs a 6, or a 4 when stationary with a spotter', () => {
    const base = {
      attacker: unit(),
      weapon: weapon({ keywords: [kw('Indirect Fire')] }),
      defender: unit({ id: 'target' }),
      options: { indirectFiring: true },
    }
    expect(attack(base).profile.unmodifiedHitFloor).toBe(6)
    const spotted = attack({
      ...base,
      options: { indirectFiring: true, remainedStationary: true, spotterAvailable: true },
    })
    expect(spotted.profile.unmodifiedHitFloor).toBe(4)
    // Indirect fire also gives the target the benefit of cover.
    expect(spotted.profile.targetHasCover).toBe(true)
  })

  it('offers the toggles Indirect Fire depends on, not just its own', () => {
    // The 4+ branch is unreachable unless the UI can offer stationary + spotter.
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ keywords: [kw('Indirect Fire')] }),
      defender: unit({ id: 'target' }),
    })
    expect(resolved.relevantOptions).toContain('indirectFiring')
    expect(resolved.relevantOptions).toContain('remainedStationary')
    expect(resolved.relevantOptions).toContain('spotterAvailable')
  })

  it('Psychic ignores hit roll modifiers', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ skill: 3, keywords: [kw('Psychic')] }),
      defender: unit({ id: 'target' }),
      options: { targetInCover: true },
    })
    expect(resolved.profile.hitThreshold).toBe(3)
  })

  it('Psychic keeps modifiers that help the attacker (24.29: any or all)', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ skill: 4, keywords: [kw('Psychic')] }),
      defender: unit({ id: 'target' }),
      rules: [rule({ id: 'buff', name: 'Guided', effects: { hitModifier: 1 } })],
    })
    expect(resolved.profile.hitThreshold).toBe(3)
  })
})

describe('cover', () => {
  it('worsens the hit roll by 1 for ranged attacks (13.08)', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ skill: 3 }),
      defender: unit({ id: 'target' }),
      options: { targetInCover: true },
    })
    expect(resolved.profile.hitThreshold).toBe(4)
    expect(resolved.profile.effectiveSave).toBe(3)
  })

  it('does not apply to melee attacks', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ type: 'melee', skill: 3 }),
      defender: unit({ id: 'target' }),
      options: { targetInCover: true },
    })
    expect(resolved.profile.hitThreshold).toBe(3)
  })

  it('is cancelled by Ignores Cover', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ skill: 3, keywords: [kw('Ignores Cover')] }),
      defender: unit({ id: 'target' }),
      options: { targetInCover: true },
    })
    expect(resolved.profile.hitThreshold).toBe(3)
    expect(resolved.profile.targetHasCover).toBe(false)
  })
})

describe('saves', () => {
  it('applies AP and falls back to the invulnerable save', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ ap: 3 }),
      defender: unit({ id: 'target', save: 3, invulnerableSave: 4 }),
    })
    expect(resolved.profile.armourSave).toBe(6)
    expect(resolved.profile.savingWith).toBe('invulnerable')
    expect(resolved.profile.effectiveSave).toBe(4)
  })

  it('reports no save when armour is out of range and there is no invulnerable', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ ap: 4 }),
      defender: unit({ id: 'target', save: 4 }),
    })
    expect(resolved.profile.effectiveSave).toBe(null)
    expect(resolved.profile.savingWith).toBe('none')
  })
})

describe('modifier cap', () => {
  it('clamps stacked hit modifiers to +1', () => {
    const buffs = [
      rule({ id: 'b1', name: 'Buff One', effects: { hitModifier: 1 } }),
      rule({ id: 'b2', name: 'Buff Two', effects: { hitModifier: 1 } }),
    ]
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ skill: 4 }),
      defender: unit({ id: 'target' }),
      rules: buffs,
    })
    expect(resolved.profile.rawHitModifier).toBe(2)
    expect(resolved.profile.hitModifier).toBe(1)
    expect(resolved.profile.hitThreshold).toBe(3)
  })

  it('clamps stacked wound modifiers to -1', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      rules: [
        rule({ id: 'd1', name: 'Debuff One', side: 'defender', effects: { woundModifier: -1 } }),
        rule({ id: 'd2', name: 'Debuff Two', side: 'defender', effects: { woundModifier: -1 } }),
      ],
    })
    expect(resolved.profile.woundThreshold).toBe(5)
  })
})

describe('duplicated abilities (24.02)', () => {
  it('does not stack two rules with the same name', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ keywords: [kw('Sustained Hits', 1)] }),
      defender: unit({ id: 'target' }),
      rules: [
        rule({ id: 'x1', name: 'Sustained Hits', effects: { sustainedHits: 1 } }),
      ],
    })
    expect(resolved.profile.sustainedHits).toBe(1)
  })

  it('applies a rule once even when both units own it', () => {
    const aura = rule({
      id: 'aura',
      name: 'Shared Aura',
      side: 'both',
      target: { type: 'keyword', keywords: ['Infantry'] },
      effects: { hitModifier: 1 },
    })
    const resolved = attack({
      attacker: unit({ id: 'a', keywords: ['Infantry'] }),
      weapon: weapon({ skill: 4 }),
      defender: unit({ id: 'b', keywords: ['Infantry'] }),
      rules: [aura],
    })
    expect(resolved.profile.rawHitModifier).toBe(1)
    expect(resolved.profile.appliedRules.filter((r) => r.rule.id === 'aura')).toHaveLength(1)
  })
})

describe('phase', () => {
  it('defaults to the fight phase for melee weapons', () => {
    const fightOnly = rule({
      id: 'fight-only',
      name: 'Fight Only',
      conditions: { phase: 'fight' },
      effects: { hitModifier: 1 },
    })
    const melee = attack({
      attacker: unit(),
      weapon: weapon({ type: 'melee' }),
      defender: unit({ id: 'target' }),
      rules: [fightOnly],
    })
    const ranged = attack({
      attacker: unit(),
      weapon: weapon({ type: 'ranged' }),
      defender: unit({ id: 'target' }),
      rules: [fightOnly],
    })
    expect(melee.profile.hitModifier).toBe(1)
    expect(ranged.profile.hitModifier).toBe(0)
  })
})

describe('rule targeting', () => {
  const buff = rule({
    id: 'oath',
    name: 'Chapter Doctrine',
    target: { type: 'keyword', keywords: ['Adeptus Astartes'] },
    effects: { hitRerolls: 'failed' },
  })

  it('applies to units holding the keyword', () => {
    const resolved = attack({
      attacker: unit({ keywords: ['Infantry', 'Adeptus Astartes'] }),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      rules: [buff],
    })
    expect(resolved.profile.hitReroll).toBe('failed')
  })

  it('does not apply to units without it', () => {
    const resolved = attack({
      attacker: unit({ keywords: ['Infantry'] }),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      rules: [buff],
    })
    expect(resolved.profile.hitReroll).toBe('none')
  })

  it('matches faction keywords through BattleScribe category prefixes', () => {
    const resolved = attack({
      attacker: unit({ keywords: ["Faction: T'au Empire"] }),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      rules: [
        rule({
          id: 'fac',
          name: 'For the Greater Good',
          target: { type: 'keyword', keywords: ['T’au Empire'] },
          effects: { hitModifier: 1 },
        }),
      ],
    })
    expect(resolved.profile.hitModifier).toBe(1)
  })

  it('only applies defender-side rules to the defending unit', () => {
    const fnp = rule({
      id: 'fnp',
      name: 'Granted FNP',
      side: 'defender',
      target: { type: 'unit', unitIds: ['attacker-unit'] },
      effects: { feelNoPain: 5 },
    })
    const resolved = attack({
      attacker: unit({ id: 'attacker-unit' }),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      rules: [fnp],
    })
    // The rule belongs to the attacking unit, so it must not protect the target.
    expect(resolved.profile.feelNoPain).toBe(null)
  })
})

describe('keyword attachments', () => {
  const leader = unit({ id: 'captain', name: 'Captain', modelCount: 1, keywords: ['Infantry', 'Character', 'Psyker'] })
  const squad = unit({ id: 'squad', name: 'Intercessors', keywords: ['Infantry', 'Battleline'] })

  it('confers the leader keywords onto the bodyguard unit (19.03)', () => {
    const resolved = attack({
      attacker: unit({ id: 'shooter' }),
      weapon: weapon({ keywords: [kw('Anti-Psyker', 2)] }),
      defender: squad,
      attachments: [attachment({ sourceUnitId: leader.id, unitIds: [squad.id] })],
      allUnits: [leader, squad],
    })
    expect(resolved.defenderKeywords.map((k) => k.toLowerCase())).toContain('psyker')
    expect(resolved.profile.critWoundOn).toBe(2)
  })

  it('applies keyword-targeted rules to every attached unit', () => {
    const doctrine = rule({
      id: 'oath',
      name: 'Oath',
      target: { type: 'keyword', keywords: ['Oathsworn'] },
      effects: { hitRerolls: 'failed' },
    })
    const att = attachment({
      name: 'Oathsworn tag',
      keywords: ['Oathsworn'],
      unitIds: ['squad-a', 'squad-b'],
    })
    for (const id of ['squad-a', 'squad-b']) {
      const resolved = attack({
        attacker: unit({ id }),
        weapon: weapon(),
        defender: unit({ id: 'target' }),
        rules: [doctrine],
        attachments: [att],
      })
      expect(resolved.profile.hitReroll).toBe('failed')
    }
    const untagged = attack({
      attacker: unit({ id: 'squad-c' }),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      rules: [doctrine],
      attachments: [att],
    })
    expect(untagged.profile.hitReroll).toBe('none')
  })

  it('grants the leader’s rules to the attached unit', () => {
    const leaderRule = rule({
      id: 'leader-rule',
      name: 'Tactical Precision',
      target: { type: 'unit', unitIds: ['captain'] },
      effects: { critHitOn: 5 },
    })
    const resolved = attack({
      attacker: squad,
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      rules: [leaderRule],
      attachments: [
        attachment({ sourceUnitId: 'captain', unitIds: ['squad'], ruleIds: ['leader-rule'] }),
      ],
      allUnits: [leader, squad],
    })
    expect(resolved.profile.critHitOn).toBe(5)
    expect(resolved.profile.appliedRules.some((r) => r.viaAttachment)).toBe(true)
  })

  it('ignores disabled attachments', () => {
    const resolved = attack({
      attacker: unit({ id: 'squad' }),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      rules: [rule({ id: 'r', name: 'R', target: { type: 'keyword', keywords: ['Tagged'] }, effects: { hitModifier: 1 } })],
      attachments: [attachment({ keywords: ['Tagged'], unitIds: ['squad'], enabled: false })],
    })
    expect(resolved.profile.hitModifier).toBe(0)
  })

  describe('a rule named against one unit of an attached unit (19.04)', () => {
    // Reproduces data/Custom-technomancer-rule.json: a defender-side Feel No Pain
    // rule aimed at the Technomancer, which is leading the Canoptek Wraiths.
    const technomancer = unit({ id: 'tech', name: 'Technomancer', modelCount: 1 })
    const wraiths = unit({ id: 'wraiths', name: 'Canoptek Wraiths', modelCount: 6, wounds: 4 })
    const leaderFnp = rule({
      id: 'tech-fnp',
      name: 'Technomancer FNP',
      side: 'defender',
      target: { type: 'unit', unitIds: ['tech'] },
      effects: { feelNoPain: 5 },
    })
    const leads = attachment({
      name: 'Technomancer leads Canoptek Wraiths',
      sourceUnitId: 'tech',
      unitIds: ['wraiths'],
    })

    it('applies to the unit being led', () => {
      const resolved = attack({
        attacker: unit({ id: 'shooter' }),
        weapon: weapon(),
        defender: wraiths,
        rules: [leaderFnp],
        attachments: [leads],
        allUnits: [technomancer, wraiths],
      })
      expect(resolved.profile.feelNoPain).toBe(5)
      const applied = resolved.profile.appliedRules.find((r) => r.rule.id === 'tech-fnp')
      expect(applied?.viaAttachment).toBe(true)
    })

    it('still applies to the leader itself', () => {
      const resolved = attack({
        attacker: unit({ id: 'shooter' }),
        weapon: weapon(),
        defender: technomancer,
        rules: [leaderFnp],
        attachments: [leads],
        allUnits: [technomancer, wraiths],
      })
      expect(resolved.profile.feelNoPain).toBe(5)
    })

    it('does not apply without the attachment', () => {
      const resolved = attack({
        attacker: unit({ id: 'shooter' }),
        weapon: weapon(),
        defender: wraiths,
        rules: [leaderFnp],
        allUnits: [technomancer, wraiths],
      })
      expect(resolved.profile.feelNoPain).toBe(null)
    })

    it('offers it as a toggle when the rule needs activating', () => {
      const manualFnp = { ...leaderFnp, manual: true }
      const resolved = attack({
        attacker: unit({ id: 'shooter' }),
        weapon: weapon(),
        defender: wraiths,
        rules: [manualFnp],
        attachments: [leads],
        allUnits: [technomancer, wraiths],
        availableManualRuleIds: ['tech-fnp'],
      })
      expect(resolved.manualRules.map((r) => r.id)).toContain('tech-fnp')
      expect(resolved.profile.feelNoPain).toBe(null)

      const switchedOn = attack({
        attacker: unit({ id: 'shooter' }),
        weapon: weapon(),
        defender: wraiths,
        rules: [manualFnp],
        attachments: [leads],
        allUnits: [technomancer, wraiths],
        availableManualRuleIds: ['tech-fnp'],
        activeManualRuleIds: ['tech-fnp'],
      })
      expect(switchedOn.profile.feelNoPain).toBe(5)
    })

    it('carries a bodyguard unit rule up to the leader', () => {
      const squadRule = rule({
        id: 'wraith-form',
        name: 'Wraith Form',
        side: 'defender',
        target: { type: 'unit', unitIds: ['wraiths'] },
        effects: { invulnerableSave: 4 },
      })
      const resolved = attack({
        attacker: unit({ id: 'shooter' }),
        weapon: weapon({ ap: 3 }),
        defender: technomancer,
        rules: [squadRule],
        attachments: [leads],
        allUnits: [technomancer, wraiths],
      })
      expect(resolved.profile.invulnerableSave).toBe(4)
    })

    it('does not leak to an unrelated unit', () => {
      const resolved = attack({
        attacker: unit({ id: 'shooter' }),
        weapon: weapon(),
        defender: unit({ id: 'immortals', name: 'Immortals' }),
        rules: [leaderFnp],
        attachments: [leads],
        allUnits: [technomancer, wraiths],
      })
      expect(resolved.profile.feelNoPain).toBe(null)
    })
  })

  it('requires all keywords when keywordMatch is all', () => {
    const strict = rule({
      id: 'strict',
      name: 'Strict',
      target: { type: 'keyword', keywords: ['Infantry', 'Character'], keywordMatch: 'all' },
      effects: { hitModifier: 1 },
    })
    const withoutCharacter = attack({
      attacker: unit({ keywords: ['Infantry'] }),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      rules: [strict],
    })
    expect(withoutCharacter.profile.hitModifier).toBe(0)

    const withBoth = attack({
      attacker: unit({ keywords: ['Infantry'] }),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      rules: [strict],
      attachments: [attachment({ keywords: ['Character'], unitIds: ['unit-1'] })],
    })
    expect(withBoth.profile.hitModifier).toBe(1)
  })
})

describe('manual rules', () => {
  it('are listed but not applied until switched on', () => {
    const input = {
      attacker: unit({ keywords: ['Infantry'] }),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
    }
    const off = attack(input)
    expect(off.manualRules.some((r) => r.id === 'core.army-rule.1-to-hit')).toBe(true)
    expect(off.profile.hitModifier).toBe(0)

    const on = attack({ ...input, activeManualRuleIds: ['core.army-rule.1-to-hit'] })
    expect(on.profile.hitModifier).toBe(1)
  })

  it('exposes the options its candidate rules depend on', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ keywords: [kw('Rapid Fire', 1), kw('Melta', 2)] }),
      defender: unit({ id: 'target' }),
    })
    expect(resolved.relevantOptions).toContain('inHalfRange')
  })

  it('hides manual rules the user has not made available', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      availableManualRuleIds: [],
    })
    expect(resolved.manualRules).toHaveLength(0)
    // 'Marked target' only exists for an unpinned stratagem-style rule, so it
    // must not clutter the combat toggles.
    expect(resolved.relevantOptions).not.toContain('targetIsMarked')
  })

  it('offers the options of a rule once it is available', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      availableManualRuleIds: ['core.army-rule.re-roll-hits-vs-marked-target'],
    })
    expect(resolved.manualRules.map((r) => r.id)).toEqual([
      'core.army-rule.re-roll-hits-vs-marked-target',
    ])
    expect(resolved.relevantOptions).toContain('targetIsMarked')
  })
})

describe('combat relevance', () => {
  it('treats re-rolls as combat effects', () => {
    expect(hasMathematicalEffect({ hitRerolls: 'ones' })).toBe(true)
    expect(hasMathematicalEffect({ woundRerolls: 'failed' })).toBe(true)
    expect(hasMathematicalEffect({ cannotRerollHits: true })).toBe(true)
    expect(hasMathematicalEffect({ hitRerolls: 'none' })).toBe(false)
    expect(hasMathematicalEffect({ notes: ['just a reminder'] })).toBe(false)
    expect(hasMathematicalEffect({})).toBe(false)
  })

  it('does not raise combat options for reminder-only rules', () => {
    const reminder = rule({
      id: 'reminder',
      name: 'Reminder',
      manual: false,
      conditions: { options: ['targetBattleShocked'] },
      effects: { notes: ['target is shaken'] },
    })
    const resolved = attack({
      attacker: unit(),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      rules: [reminder],
    })
    expect(resolved.relevantOptions).not.toContain('targetBattleShocked')
  })

  it('does raise the option when a rule keys maths off it', () => {
    const real = rule({
      id: 'kick-them-while-down',
      name: 'Kick Them While Down',
      manual: false,
      conditions: { options: ['targetBattleShocked'] },
      effects: { woundRerolls: 'failed' },
    })
    const resolved = attack({
      attacker: unit(),
      weapon: weapon(),
      defender: unit({ id: 'target' }),
      rules: [real],
    })
    expect(resolved.relevantOptions).toContain('targetBattleShocked')
  })
})

describe('resolveUnitAbilities', () => {
  it('returns the unit-level reminder rules and keywords, not weapon abilities', () => {
    const summary = resolveUnitAbilities(
      unit({ id: 'squad', keywords: ['Infantry', 'Stealth', 'Lone Operative'] })
    )
    const names = summary.rules.map((r) => r.name)
    expect(names).toContain('Lone Operative')
    // Stealth changes the maths, so it belongs to the combat readout instead.
    expect(names).not.toContain('Stealth')
    expect(names).not.toContain('Rapid Fire')
    expect(summary.keywords).toContain('Stealth')
  })

  it('leaves stratagems and toggled buffs out of the profile', () => {
    const summary = resolveUnitAbilities(unit({ keywords: ['Infantry', 'Character'] }))
    const sources = summary.rules.map((r) => r.source)
    expect(sources).not.toContain('stratagem')
    expect(sources).not.toContain('army-rule')
    expect(summary.rules.every((r) => !r.manual)).toBe(true)
  })

  it('includes abilities conferred by an attachment', () => {
    const summary = resolveUnitAbilities(unit({ id: 'squad', keywords: ['Infantry'] }), {
      attachments: [attachment({ name: 'Captain leads', keywords: ['Lone Operative'], unitIds: ['squad'] })],
    })
    expect(summary.rules.map((r) => r.name)).toContain('Lone Operative')
    expect(summary.attachmentNames).toEqual(['Captain leads'])
  })
})

describe('defensive rules', () => {
  it('reduces damage to a minimum of 1', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ damage: '1' }),
      defender: unit({ id: 'target' }),
      rules: [rule({ id: 'aoc', name: 'AoC', side: 'defender', effects: { damageReduction: 2 } })],
    })
    expect(resolved.profile.damagePerWound).toBe(1)
  })

  it('halves damage rounding up before flat modifiers', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ damage: '3' }),
      defender: unit({ id: 'target' }),
      rules: [rule({ id: 'halve', name: 'Halve', side: 'defender', effects: { halveDamage: true } })],
    })
    expect(resolved.profile.damagePerWound).toBe(2)
  })

  it('applies Feel No Pain to mortal wounds as well as normal damage', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ attacks: '6', keywords: [kw('Devastating Wounds')] }),
      defender: unit({ id: 'target', feelNoPain: 5, save: 2, wounds: 3 }),
    })
    const noFnp = attack({
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ attacks: '6', keywords: [kw('Devastating Wounds')] }),
      defender: unit({ id: 'target', save: 2, wounds: 3 }),
    })
    expect(resolved.estimate.expectedDamage).toBeCloseTo(noFnp.estimate.expectedDamage * (1 - 2 / 6), 6)
  })

  it('can remove the invulnerable save', () => {
    const resolved = attack({
      attacker: unit(),
      weapon: weapon({ ap: 4 }),
      defender: unit({ id: 'target', save: 3, invulnerableSave: 4 }),
      rules: [rule({ id: 'no-inv', name: 'No Invuln', effects: { cannotUseInvulnerableSave: true } })],
    })
    expect(resolved.profile.effectiveSave).toBe(null)
  })
})

describe('estimate sanity', () => {
  it('never returns negative or NaN damage for an unkillable target', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 10 }),
      weapon: weapon({ strength: 1, ap: 0 }),
      defender: unit({ id: 'target', toughness: 12, save: 2, invulnerableSave: 2, feelNoPain: 4 }),
    })
    expect(Number.isFinite(resolved.estimate.expectedDamage)).toBe(true)
    expect(resolved.estimate.expectedDamage).toBeGreaterThanOrEqual(0)
  })

  it('reports models slain without letting damage spill between models', () => {
    const resolved = attack({
      attacker: unit({ modelCount: 1 }),
      weapon: weapon({ attacks: '6', damage: '6', skill: 2, strength: 10 }),
      defender: unit({ id: 'target', toughness: 4, wounds: 1, save: 7, modelCount: 10 }),
    })
    expect(resolved.estimate.expectedModelsSlain).toBeLessThanOrEqual(resolved.estimate.attacks)
  })
})
