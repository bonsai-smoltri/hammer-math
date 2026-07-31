import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_HISTORY,
  addBattleRecord,
  battleHeadline,
  clearBattleHistory,
  hasRecordedActions,
  isBattleRecord,
  loadBattleHistory,
  removeBattleRecord,
  saveBattleHistory,
  tallyBattle,
  toBattleRecord,
} from './battle-history'
import {
  advancePhase,
  allocateFixedDamage,
  applyAttack,
  createBattleState,
  MAX_ROUNDS,
} from './battle-state'
import type { BattleRecord, BattleState } from '../types/battle'
import type { ParsedRoster, ParsedUnit } from '../types/roster'

/** Minimal in-memory localStorage, since these tests run under node. */
function installLocalStorage() {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  }
  return store
}

const unit = (id: string, name: string): ParsedUnit => ({
  id,
  name,
  modelCount: 2,
  toughness: 4,
  save: 3,
  wounds: 2,
  invulnerableSave: null,
  feelNoPain: null,
  move: '6"',
  leadership: '6+',
  objectiveControl: 2,
  weapons: [],
  keywords: [],
  abilities: [],
  points: 100,
  isLeader: false,
  attachableTo: [],
  attachedToUnitId: null,
})

const roster = (name: string, units: ParsedUnit[]): ParsedRoster => ({
  name,
  points: 100,
  units,
  attachments: [],
  attachmentCandidates: [],
  warnings: [],
})

function freshState(): BattleState {
  return createBattleState(
    roster('Necrons', [unit('attacker', 'Immortals')]),
    roster('Tau', [unit('target', 'Crisis Suits')])
  )
}

/** Records one attack that removes every model in the target. */
function wipeTarget(state: BattleState): BattleState {
  const damage = allocateFixedDamage(state.unitWounds.target, 2, 2)
  return applyAttack(
    state,
    'attacker',
    'Immortals',
    'Gauss blaster',
    'target',
    'Crisis Suits',
    damage.woundsLost,
    damage
  )
}

describe('hasRecordedActions', () => {
  it('is false for a battle nothing happened in', () => {
    expect(hasRecordedActions(freshState())).toBe(false)
  })

  it('is true once an attack is recorded', () => {
    expect(hasRecordedActions(wipeTarget(freshState()))).toBe(true)
  })
})

describe('tallyBattle and battleHeadline', () => {
  it('reports nothing for an empty battle', () => {
    expect(tallyBattle(freshState())).toEqual({
      actions: 0,
      woundsDealt: 0,
      unitsDestroyed: 0,
    })
    expect(battleHeadline(toBattleRecord(freshState(), 'A', 'B'))).toBe('No attacks recorded')
  })

  it('counts wounds and destroyed units from the log', () => {
    const state = wipeTarget(freshState())
    expect(tallyBattle(state)).toEqual({ actions: 1, woundsDealt: 4, unitsDestroyed: 1 })
    expect(battleHeadline(toBattleRecord(state, 'A', 'B'))).toBe('4 wounds · 1 unit destroyed')
  })
})

describe('toBattleRecord', () => {
  it('records an abandoned battle at the round it reached', () => {
    let state = freshState()
    for (let i = 0; i < 4; i++) state = advancePhase(state)
    const record = toBattleRecord(state, 'Necrons', 'Tau', 1000)

    expect(record).toMatchObject({
      savedAt: 1000,
      armyAName: 'Necrons',
      armyBName: 'Tau',
      roundsPlayed: 2,
      completed: false,
    })
    expect(record.state).toBe(state)
  })

  it('records a finished battle as complete at the last round', () => {
    let state = freshState()
    while (!state.battleComplete) state = advancePhase(state)
    const record = toBattleRecord(state, 'Necrons', 'Tau')
    expect(record.completed).toBe(true)
    expect(record.roundsPlayed).toBe(MAX_ROUNDS)
  })
})

describe('addBattleRecord', () => {
  const record = (id: string): BattleRecord => ({
    ...toBattleRecord(freshState(), 'A', 'B'),
    id,
  })

  it('puts the newest battle first', () => {
    const history = addBattleRecord(addBattleRecord([], record('old')), record('new'))
    expect(history.map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('caps the list so the log cannot grow without bound', () => {
    let history: BattleRecord[] = []
    for (let i = 0; i < MAX_HISTORY + 5; i++) history = addBattleRecord(history, record(`b${i}`))
    expect(history).toHaveLength(MAX_HISTORY)
    // The oldest are the ones dropped.
    expect(history[0].id).toBe(`b${MAX_HISTORY + 4}`)
  })
})

describe('removeBattleRecord', () => {
  it('drops only the requested battle', () => {
    const a = { ...toBattleRecord(freshState(), 'A', 'B'), id: 'a' }
    const b = { ...toBattleRecord(freshState(), 'A', 'B'), id: 'b' }
    expect(removeBattleRecord([a, b], 'a').map((r) => r.id)).toEqual(['b'])
  })
})

describe('isBattleRecord', () => {
  const valid = toBattleRecord(freshState(), 'A', 'B')

  it('accepts a record it wrote itself', () => {
    expect(isBattleRecord(valid)).toBe(true)
  })

  it('rejects anything that is not one', () => {
    expect(isBattleRecord(null)).toBe(false)
    expect(isBattleRecord('a battle')).toBe(false)
    expect(isBattleRecord({ ...valid, id: 42 })).toBe(false)
    expect(isBattleRecord({ ...valid, completed: 'yes' })).toBe(false)
    expect(isBattleRecord({ ...valid, state: undefined })).toBe(false)
    expect(isBattleRecord({ ...valid, state: { ...valid.state, rounds: 'none' } })).toBe(false)
  })
})

describe('history persistence', () => {
  beforeEach(() => {
    installLocalStorage()
  })

  it('round-trips through storage', () => {
    const record = toBattleRecord(wipeTarget(freshState()), 'Necrons', 'Tau')
    saveBattleHistory([record])
    const loaded = loadBattleHistory()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].armyAName).toBe('Necrons')
    expect(tallyBattle(loaded[0].state).unitsDestroyed).toBe(1)
  })

  it('returns nothing when storage is empty', () => {
    expect(loadBattleHistory()).toEqual([])
  })

  it('drops bad entries instead of trusting them', () => {
    const good = toBattleRecord(freshState(), 'A', 'B')
    localStorage.setItem('w40k-battle-history', JSON.stringify([good, { id: 'junk' }, null, 7]))
    expect(loadBattleHistory().map((r) => r.id)).toEqual([good.id])
  })

  it('survives content that is not JSON at all', () => {
    localStorage.setItem('w40k-battle-history', 'not json')
    expect(loadBattleHistory()).toEqual([])
  })

  it('ignores a stored value that is not a list', () => {
    localStorage.setItem('w40k-battle-history', JSON.stringify({ nope: true }))
    expect(loadBattleHistory()).toEqual([])
  })

  it('clears', () => {
    saveBattleHistory([toBattleRecord(freshState(), 'A', 'B')])
    clearBattleHistory()
    expect(loadBattleHistory()).toEqual([])
  })
})
