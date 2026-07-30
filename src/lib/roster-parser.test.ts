import { describe, expect, it } from 'vitest'
import { parseAttachableUnits, parseRoster, parseWeaponKeywords } from './roster-parser'

describe('parseWeaponKeywords', () => {
  it('returns nothing for empty or placeholder values', () => {
    expect(parseWeaponKeywords('')).toEqual([])
    expect(parseWeaponKeywords('-')).toEqual([])
  })

  it('reads plain and valued abilities', () => {
    expect(parseWeaponKeywords('Assault, Rapid Fire 2, Melta 2')).toEqual([
      { name: 'Assault' },
      { name: 'Rapid Fire', value: 2 },
      { name: 'Melta', value: 2 },
    ])
  })

  it('strips brackets used on datasheets', () => {
    expect(parseWeaponKeywords('[SUSTAINED HITS 1]')).toEqual([{ name: 'SUSTAINED HITS', value: 1 }])
  })

  it('reads Anti-X Y+', () => {
    expect(parseWeaponKeywords('Anti-Vehicle 4+, Anti-Fly 2+')).toEqual([
      { name: 'Anti-Vehicle', value: 4 },
      { name: 'Anti-Fly', value: 2 },
    ])
  })

  it('reads target restrictions (24.01)', () => {
    expect(parseWeaponKeywords('Lethal Hits: Vehicle/Monster')).toEqual([
      { name: 'Lethal Hits', restrictedTo: ['Vehicle', 'Monster'] },
    ])
    expect(parseWeaponKeywords('Sustained Hits 1: Infantry')).toEqual([
      { name: 'Sustained Hits', value: 1, restrictedTo: ['Infantry'] },
    ])
  })
})

describe('parseAttachableUnits', () => {
  it('reads the bold unit list from a Leader ability', () => {
    const text =
      'This model can be attached to the following units: - **CRISIS BATTLESUITS** - **CRISIS SUNFORGE BATTLESUITS**'
    expect(parseAttachableUnits(text)).toEqual(['CRISIS BATTLESUITS', 'CRISIS SUNFORGE BATTLESUITS'])
  })

  it('reads the square-bullet list used by Support abilities', () => {
    const text =
      'This model can be attached to the following units:\n■ CANOPTEK WRAITHS\n■ IMMORTALS\n■ NECRON WARRIORS'
    expect(parseAttachableUnits(text)).toEqual([
      'CANOPTEK WRAITHS',
      'IMMORTALS',
      'NECRON WARRIORS',
    ])
  })

  it('splits a bold-wrapped comma list and drops footnote markers', () => {
    const text =
      'This model can be attached to the following units: ^^**Canoptek Macrocytes, Immortals, Necron Warriors^^**.'
    expect(parseAttachableUnits(text)).toEqual([
      'Canoptek Macrocytes',
      'Immortals',
      'Necron Warriors',
    ])
  })

  it('returns nothing for an unrelated ability', () => {
    expect(parseAttachableUnits('Each time this model makes an attack, re-roll the hit roll.')).toEqual([])
  })
})

// --- Roster shape fixtures ------------------------------------------------

const unitProfile = (stats: Record<string, string>) => ({
  typeName: 'Unit',
  name: 'profile',
  characteristics: Object.entries(stats).map(([name, $text]) => ({ name, $text })),
})

const weaponProfile = (name: string, ranged: boolean, chars: Record<string, string>) => ({
  typeName: ranged ? 'Ranged Weapons' : 'Melee Weapons',
  name,
  characteristics: Object.entries(chars).map(([key, $text]) => ({ name: key, $text })),
})

/** Mirrors the Crisis Sunforge shape in data/: two model groups, doubled guns. */
function crisisRoster() {
  return {
    roster: {
      name: 'Test Army',
      costs: [{ value: 500 }],
      forces: [
        {
          selections: [
            {
              id: 'config',
              name: 'Battle Size',
              type: 'upgrade',
              categories: [{ name: 'Configuration' }],
            },
            {
              id: 'crisis',
              name: 'Crisis Sunforge Battlesuits',
              type: 'unit',
              number: 1,
              costs: [{ value: 150 }],
              categories: [{ name: 'Vehicle' }, { name: 'Battlesuit' }],
              profiles: [
                {
                  typeName: 'Abilities',
                  name: 'Stealth Field',
                  characteristics: [{ name: 'Description', $text: 'This unit has a 4+ invulnerable save.' }],
                },
              ],
              selections: [
                {
                  id: 'vre',
                  name: 'Shas’vre',
                  type: 'model',
                  number: 1,
                  profiles: [unitProfile({ M: '10"', T: '5', Sv: '3+', W: '3', LD: '6+', OC: '2' })],
                  selections: [
                    {
                      id: 'vre-fusion',
                      name: 'Fusion blaster',
                      type: 'upgrade',
                      number: 2,
                      profiles: [
                        weaponProfile('Fusion blaster', true, {
                          Range: '12"',
                          A: '1',
                          BS: '4+',
                          S: '9',
                          AP: '-4',
                          D: 'D6',
                          Keywords: 'Melta 2',
                        }),
                      ],
                    },
                    {
                      id: 'vre-fists',
                      name: 'Battlesuit fists',
                      type: 'upgrade',
                      number: 1,
                      profiles: [
                        weaponProfile('Battlesuit fists', false, {
                          A: '3',
                          WS: '4+',
                          S: '5',
                          AP: '0',
                          D: '1',
                          Keywords: '-',
                        }),
                      ],
                    },
                  ],
                },
                {
                  id: 'ui',
                  name: 'Shas’ui',
                  type: 'model',
                  number: 2,
                  profiles: [unitProfile({ M: '10"', T: '5', Sv: '3+', W: '3', LD: '6+', OC: '2' })],
                  selections: [
                    {
                      id: 'ui-fusion',
                      name: 'Fusion blaster',
                      type: 'upgrade',
                      number: 4,
                      profiles: [
                        weaponProfile('Fusion blaster', true, {
                          Range: '12"',
                          A: '1',
                          BS: '4+',
                          S: '9',
                          AP: '-4',
                          D: 'D6',
                          Keywords: 'Melta 2',
                        }),
                      ],
                    },
                    {
                      id: 'ui-fists',
                      name: 'Battlesuit fists',
                      type: 'upgrade',
                      number: 2,
                      profiles: [
                        weaponProfile('Battlesuit fists', false, {
                          A: '3',
                          WS: '4+',
                          S: '5',
                          AP: '0',
                          D: '1',
                          Keywords: '-',
                        }),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  }
}

describe('parseRoster', () => {
  const roster = parseRoster(crisisRoster())

  it('skips configuration selections', () => {
    expect(roster.units.map((u) => u.name)).toEqual(['Crisis Sunforge Battlesuits'])
  })

  it('counts models across model groups', () => {
    expect(roster.units[0].modelCount).toBe(3)
  })

  it('sums weapon counts instead of assuming one per model', () => {
    const unit = roster.units[0]
    const fusion = unit.weapons.find((w) => w.name === 'Fusion blaster')!
    const fists = unit.weapons.find((w) => w.name === 'Battlesuit fists')!
    // Two on the Shas'vre plus four across the two Shas'ui.
    expect(fusion.count).toBe(6)
    expect(fists.count).toBe(3)
  })

  it('reads the full stat line', () => {
    const unit = roster.units[0]
    expect(unit.move).toBe('10"')
    expect(unit.toughness).toBe(5)
    expect(unit.save).toBe(3)
    expect(unit.wounds).toBe(3)
    expect(unit.leadership).toBe('6+')
    expect(unit.objectiveControl).toBe(2)
  })

  it('reads an invulnerable save out of the ability text', () => {
    expect(roster.units[0].invulnerableSave).toBe(4)
  })

  it('keeps weapon range and abilities', () => {
    const fusion = roster.units[0].weapons.find((w) => w.name === 'Fusion blaster')!
    expect(fusion.range).toBe('12"')
    expect(fusion.keywords).toEqual([{ name: 'Melta', value: 2 }])
  })

  it('records no attachments when nothing is attached', () => {
    expect(roster.attachments).toEqual([])
    expect(roster.units[0].isLeader).toBe(false)
  })

  it('warns instead of silently guessing when a roster is unusable', () => {
    const empty = parseRoster({ roster: { name: 'Empty', forces: [] } })
    expect(empty.units).toEqual([])
    expect(empty.warnings.length).toBeGreaterThan(0)
  })

  it('reports its guesses rather than hiding them', () => {
    const base = crisisRoster()
    const crisis = base.roster.forces[0].selections[1] as any
    // Drop the Toughness and the weapon's BS.
    const stats = crisis.selections[0].profiles[0].characteristics as any[]
    crisis.selections[0].profiles[0].characteristics = stats.filter((c) => c.name !== 'T')
    const fusion = crisis.selections[0].selections[0].profiles[0].characteristics as any[]
    crisis.selections[0].selections[0].profiles[0].characteristics = fusion.filter(
      (c) => c.name !== 'BS'
    )

    const roster = parseRoster(base)
    expect(roster.warnings.some((w) => w.includes('Toughness'))).toBe(true)
    expect(roster.warnings.some((w) => w.includes('BS'))).toBe(true)
    expect(roster.warnings.some((w) => w.includes('Fusion blaster'))).toBe(true)
  })

  it('warns when a selection has no stat line to read', () => {
    const base = crisisRoster()
    const crisis = base.roster.forces[0].selections[1] as any
    for (const model of crisis.selections) model.profiles = []

    const roster = parseRoster(base)
    expect(roster.units).toEqual([])
    expect(roster.warnings.some((w) => w.includes('was skipped'))).toBe(true)
  })

  it('does not warn about N/A characteristics on Torrent weapons', () => {
    const base = crisisRoster()
    const crisis = base.roster.forces[0].selections[1] as any
    const fusion = crisis.selections[0].selections[0].profiles[0]
    fusion.characteristics = (fusion.characteristics as any[]).map((c) =>
      c.name === 'BS' ? { name: 'BS', $text: 'N/A' } : c
    )

    const roster = parseRoster(base)
    expect(roster.warnings).toEqual([])
  })
})

describe('parseRoster with an attached leader', () => {
  function attachedRoster() {
    const base = crisisRoster()
    const bodyguard = base.roster.forces[0].selections[1] as any
    bodyguard.selections.push({
      id: 'farsight',
      name: 'Commander Farsight',
      type: 'model',
      number: 1,
      costs: [{ value: 105 }],
      categories: [{ name: 'Character' }, { name: 'Epic Hero' }, { name: 'Leader' }],
      profiles: [
        unitProfile({ M: '10"', T: '5', Sv: '2+', W: '8', LD: '6+', OC: '2', InSv: '4+' }),
        {
          typeName: 'Abilities',
          name: 'Leader',
          characteristics: [
            {
              name: 'Description',
              $text:
                'This model can be attached to the following units: - **CRISIS SUNFORGE BATTLESUITS**',
            },
          ],
        },
      ],
      selections: [
        {
          id: 'dawn-blade',
          name: 'Dawn Blade',
          type: 'upgrade',
          number: 1,
          profiles: [
            weaponProfile('Dawn Blade', false, {
              A: '4',
              WS: '2+',
              S: '10',
              AP: '-2',
              D: '3',
              Keywords: '-',
            }),
          ],
        },
      ],
    })
    return base
  }

  const roster = parseRoster(attachedRoster())
  const bodyguard = roster.units.find((u) => u.name === 'Crisis Sunforge Battlesuits')!
  const leader = roster.units.find((u) => u.name === 'Commander Farsight')!

  it('emits the leader as its own unit', () => {
    expect(roster.units).toHaveLength(2)
    expect(leader.isLeader).toBe(true)
    expect(leader.wounds).toBe(8)
    expect(leader.invulnerableSave).toBe(4)
  })

  it('records the attachment link', () => {
    expect(roster.attachments).toEqual([
      {
        leaderUnitId: leader.id,
        leaderName: 'Commander Farsight',
        bodyguardUnitId: bodyguard.id,
        bodyguardName: 'Crisis Sunforge Battlesuits',
        source: 'nested',
      },
    ])
    expect(leader.attachedToUnitId).toBe(bodyguard.id)
  })

  it('reads which units the leader can join', () => {
    expect(leader.attachableTo).toEqual(['CRISIS SUNFORGE BATTLESUITS'])
  })

  it('does not fold the leader into the bodyguard unit', () => {
    // The bodyguard keeps its own three models, stats and weapons.
    expect(bodyguard.modelCount).toBe(3)
    expect(bodyguard.wounds).toBe(3)
    expect(bodyguard.weapons.map((w) => w.name).sort()).toEqual(['Battlesuit fists', 'Fusion blaster'])
    expect(leader.weapons.map((w) => w.name)).toEqual(['Dawn Blade'])
  })
})

describe('parseRoster with a separately listed leader', () => {
  /**
   * Mirrors data/example-attached-unit.json: BattleScribe lists the Support
   * model as its own selection, so the pairing has to come from the ability text.
   */
  function necronRoster(extraUnitName?: string) {
    const wraiths = {
      id: 'wraiths',
      name: 'Canoptek Wraiths',
      type: 'unit',
      number: 1,
      costs: [{ value: 110 }],
      categories: [{ name: 'Faction: Necrons' }, { name: 'Beast' }, { name: 'Canoptek' }],
      profiles: [unitProfile({ M: '10"', T: '6', Sv: '3+', W: '4', LD: '7+', OC: '2' })],
      selections: [
        {
          id: 'wraith-1',
          name: 'Wraith w/ claws',
          type: 'model',
          number: 3,
          selections: [
            {
              id: 'claws',
              name: 'Vicious claws',
              type: 'upgrade',
              number: 3,
              profiles: [
                weaponProfile('Vicious claws', false, {
                  A: '4',
                  WS: '3+',
                  S: '6',
                  AP: '-2',
                  D: '2',
                  Keywords: '-',
                }),
              ],
            },
          ],
        },
      ],
    }

    const technomancer = {
      id: 'tech',
      name: 'Technomancer',
      type: 'model',
      number: 1,
      costs: [{ value: 70 }],
      categories: [{ name: 'Faction: Necrons' }, { name: 'Infantry' }, { name: 'Character' }],
      profiles: [
        {
          typeName: 'Abilities',
          name: 'Support',
          characteristics: [
            {
              name: 'Description',
              $text:
                'This model can be attached to the following units:\n■ CANOPTEK WRAITHS\n■ IMMORTALS\n■ NECRON WARRIORS',
            },
          ],
        },
        unitProfile({ M: '10"', T: '4', Sv: '4+', W: '4', LD: '6+', OC: '1', InSv: '-' }),
      ],
      selections: [],
    }

    const selections: any[] = [technomancer, wraiths]
    if (extraUnitName) {
      selections.push({
        ...wraiths,
        id: 'immortals',
        name: extraUnitName,
        selections: [],
        profiles: [unitProfile({ M: '6"', T: '4', Sv: '3+', W: '1', LD: '7+', OC: '2' })],
      })
    }

    return { roster: { name: 'Necrons', costs: [{ value: 180 }], forces: [{ selections }] } }
  }

  it('treats a Support ability as leader-style attachment', () => {
    const roster = parseRoster(necronRoster())
    const tech = roster.units.find((u) => u.name === 'Technomancer')!
    expect(tech.isLeader).toBe(true)
    expect(tech.attachableTo).toEqual(['CANOPTEK WRAITHS', 'IMMORTALS', 'NECRON WARRIORS'])
  })

  it('never attaches anything on its own', () => {
    const roster = parseRoster(necronRoster())
    // The roster does not say the Technomancer joined anything, only that it could.
    expect(roster.attachments).toEqual([])
  })

  it('offers the pairing as a candidate instead', () => {
    const roster = parseRoster(necronRoster())
    expect(roster.attachmentCandidates).toEqual([
      {
        leaderUnitId: 'tech',
        leaderName: 'Technomancer',
        bodyguardUnitId: 'wraiths',
        bodyguardName: 'Canoptek Wraiths',
        source: 'name-match',
      },
    ])
  })

  it('offers every unit the ability allows', () => {
    const roster = parseRoster(necronRoster('Immortals'))
    expect(roster.attachments).toEqual([])
    expect(roster.attachmentCandidates.map((a) => a.bodyguardName).sort()).toEqual([
      'Canoptek Wraiths',
      'Immortals',
    ])
  })

  it('offers a candidate per leader when several could join the same unit', () => {
    const base = necronRoster()
    const selections = base.roster.forces[0].selections as any[]
    selections.push({ ...selections[0], id: 'tech-2', name: 'Plasmancer' })

    const roster = parseRoster(base)
    expect(roster.attachments).toEqual([])
    expect(roster.attachmentCandidates.map((a) => a.leaderName).sort()).toEqual([
      'Plasmancer',
      'Technomancer',
    ])
  })

  it('does not give a Leader the abilities it confers on the unit it joins', () => {
    const base = necronRoster()
    const tech = (base.roster.forces[0].selections as any[])[0]
    tech.profiles.push({
      typeName: 'Abilities',
      name: 'Rites of Reanimation',
      characteristics: [
        {
          name: 'Description',
          $text:
            'While this model is leading a unit, models in that unit have the Feel No Pain 5+ ability.',
        },
      ],
    })

    const roster = parseRoster(base)
    const leader = roster.units.find((u) => u.name === 'Technomancer')!
    // The Technomancer itself does not have Feel No Pain from that ability.
    expect(leader.feelNoPain).toBe(null)
    expect(leader.abilities.map((a) => a.name)).toContain('Rites of Reanimation')
  })

  it('still counts weapons per weapon, not per model', () => {
    const roster = parseRoster(necronRoster())
    const wraiths = roster.units.find((u) => u.name === 'Canoptek Wraiths')!
    expect(wraiths.modelCount).toBe(3)
    expect(wraiths.weapons[0].count).toBe(3)
  })
})
