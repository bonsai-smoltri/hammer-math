import { describe, expect, it } from 'vitest'
import { parseFeelNoPain, parseInvulnerableSave, parseRoster } from './roster-parser'

const unitProfile = (stats: Record<string, string>) => ({
  typeName: 'Unit',
  name: 'profile',
  characteristics: Object.entries(stats).map(([name, $text]) => ({ name, $text })),
})

const ability = (name: string, text: string) => ({
  typeName: 'Abilities',
  name,
  characteristics: [{ name: 'Description', $text: text }],
})

const BASE = { M: '6"', T: '4', Sv: '3+', W: '3', LD: '7+', OC: '1' }

/** A single-model datasheet carrying the given profiles. */
function rosterWith(profiles: any[], selections: any[] = []) {
  return parseRoster({
    roster: {
      name: 'Probe',
      forces: [
        {
          selections: [
            { id: 'u1', name: 'Probe Unit', type: 'model', number: 1, profiles, selections },
          ],
        },
      ],
    },
  })
}

describe('parseInvulnerableSave', () => {
  it('reads the phrasings datasheets actually use', () => {
    expect(parseInvulnerableSave(['This model has a 4+ invulnerable save.'])).toBe(4)
    expect(parseInvulnerableSave(['This unit has a 5+ invulnerable save.'])).toBe(5)
    expect(parseInvulnerableSave(['Models in this unit have an invulnerable save of 6+.'])).toBe(6)
  })

  it('returns null when there is no invulnerable save', () => {
    expect(parseInvulnerableSave([])).toBeNull()
    expect(parseInvulnerableSave(['This model has no invulnerable save.'])).toBeNull()
    expect(parseInvulnerableSave(['Deep Strike'])).toBeNull()
  })

  it('does not mistake Feel No Pain for an invulnerable save', () => {
    expect(parseInvulnerableSave(['Feel No Pain 5+'])).toBeNull()
  })

  it('rejects values no save roll could produce (2+ to 6+ only)', () => {
    // A single-digit capture used to read "10+" as 0, handing the engine a save
    // that always passes.
    expect(parseInvulnerableSave(['This model has a 10+ invulnerable save.'])).toBeNull()
    expect(parseInvulnerableSave(['This model has a 1+ invulnerable save.'])).toBeNull()
    expect(parseInvulnerableSave(['This model has a 7+ invulnerable save.'])).toBeNull()
  })

  it('keeps looking after an unusable value', () => {
    expect(
      parseInvulnerableSave([
        'This model has a 10+ invulnerable save.',
        'This model has a 4+ invulnerable save.',
      ])
    ).toBe(4)
  })
})

describe('parseFeelNoPain', () => {
  it('reads a Feel No Pain value', () => {
    expect(parseFeelNoPain(['Feel No Pain 5+'])).toBe(5)
    expect(parseFeelNoPain(['Models in this unit have the Feel No Pain 6+ ability.'])).toBe(6)
  })

  it('returns null for missing or unusable values', () => {
    expect(parseFeelNoPain(['Stealth'])).toBeNull()
    expect(parseFeelNoPain(['Feel No Pain 10+'])).toBeNull()
  })
})

describe('invulnerable save from the unit profile', () => {
  it('reads the InSv characteristic', () => {
    expect(rosterWith([unitProfile({ ...BASE, InSv: '4+' })]).units[0].invulnerableSave).toBe(4)
  })

  it('treats the placeholders exports use as no invulnerable save', () => {
    // Necron exports print '-' for every unit without one; nine of the thirteen
    // units in data/ do, and none of them may be given a guessed save.
    for (const insv of ['-', 'N/A', '']) {
      expect(rosterWith([unitProfile({ ...BASE, InSv: insv })]).units[0].invulnerableSave).toBeNull()
    }
    expect(rosterWith([unitProfile(BASE)]).units[0].invulnerableSave).toBeNull()
  })

  it('never warns about a missing invulnerable save', () => {
    // Not having one is the normal case, so it is not a guess to report.
    expect(rosterWith([unitProfile({ ...BASE, InSv: '-' })]).warnings).toEqual([])
  })

  it('ignores footnote markers and trailing qualifiers', () => {
    expect(rosterWith([unitProfile({ ...BASE, InSv: '5+*' })]).units[0].invulnerableSave).toBe(5)
  })

  it('rejects an out-of-range InSv rather than trusting it', () => {
    expect(rosterWith([unitProfile({ ...BASE, InSv: '10+' })]).units[0].invulnerableSave).toBeNull()
  })

  it('prefers the profile characteristic over ability text', () => {
    const roster = rosterWith([
      unitProfile({ ...BASE, InSv: '5+' }),
      ability('Shroud', 'This model has a 4+ invulnerable save.'),
    ])
    expect(roster.units[0].invulnerableSave).toBe(5)
  })

  it('falls back to ability text when the profile has no InSv', () => {
    const roster = rosterWith([
      unitProfile({ ...BASE, InSv: '-' }),
      ability('Shroud', 'This model has a 4+ invulnerable save.'),
    ])
    expect(roster.units[0].invulnerableSave).toBe(4)
  })

  it('does not give a leader a save it only confers while leading (19.04)', () => {
    const roster = rosterWith([
      unitProfile({ ...BASE, InSv: '-' }),
      ability(
        'Technomancer',
        'While this model is leading a unit, models in that unit have a 4+ invulnerable save.'
      ),
    ])
    expect(roster.units[0].invulnerableSave).toBeNull()
  })
})
