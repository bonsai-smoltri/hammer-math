import { describe, expect, it } from 'vitest'
import {
  allocateDamage,
  allocateFixedDamage,
  averageDamage,
  createBattleState,
  getUnitHealthSummary,
  isFixedDamage,
  maxWounds,
  parseDamageValue,
  setBattleShocked,
  setUnitWounds,
  totalWoundsRemaining,
  woundsToModels,
} from './battle-state'
import type { ParsedRoster } from '../types/roster'
import { unit } from './rules/fixtures'

function roster(units: ReturnType<typeof unit>[]): ParsedRoster {
  return { name: 'Army', points: 0, units, attachments: [], attachmentCandidates: [], warnings: [] }
}

const armyA = roster([unit({ id: 'squad', name: 'Squad', modelCount: 5, wounds: 2 })])
const armyB = roster([unit({ id: 'tank', name: 'Tank', modelCount: 1, wounds: 10 })])

describe('createBattleState', () => {
  const state = createBattleState(armyA, armyB)

  it('records starting strength and full wounds', () => {
    expect(state.unitWounds['squad'].startingModelCount).toBe(5)
    expect(state.unitWounds['squad'].woundsRemaining).toEqual([2, 2, 2, 2, 2])
    expect(maxWounds(state.unitWounds['squad'])).toBe(10)
  })

  it('starts nobody battle-shocked', () => {
    expect(state.unitWounds['squad'].battleShocked).toBe(false)
  })
})

describe('woundsToModels', () => {
  it('leaves at most one damaged model', () => {
    expect(woundsToModels(10, 2, 5)).toEqual([2, 2, 2, 2, 2])
    expect(woundsToModels(7, 2, 5)).toEqual([2, 2, 2, 1])
    expect(woundsToModels(1, 2, 5)).toEqual([1])
    expect(woundsToModels(0, 2, 5)).toEqual([])
  })

  it('clamps to the unit maximum and to zero', () => {
    expect(woundsToModels(99, 2, 5)).toEqual([2, 2, 2, 2, 2])
    expect(woundsToModels(-5, 2, 5)).toEqual([])
  })
})

describe('setUnitWounds', () => {
  const state = createBattleState(armyA, armyB)

  it('removes models as wounds come off', () => {
    const next = setUnitWounds(state, 'squad', 5)
    expect(next.unitWounds['squad'].woundsRemaining).toEqual([2, 2, 1])
    expect(totalWoundsRemaining(next.unitWounds['squad'])).toBe(5)
    expect(next.unitWounds['squad'].isDead).toBe(false)
  })

  it('marks the unit dead at zero', () => {
    const next = setUnitWounds(state, 'squad', 0)
    expect(next.unitWounds['squad'].isDead).toBe(true)
    expect(getUnitHealthSummary(next.unitWounds['squad'])).toBe('Destroyed')
  })

  it('heals back up but not past starting strength', () => {
    const damaged = setUnitWounds(state, 'squad', 3)
    const healed = setUnitWounds(damaged, 'squad', 99)
    expect(healed.unitWounds['squad'].woundsRemaining).toEqual([2, 2, 2, 2, 2])
  })

  it('logs the change with a signed wound delta', () => {
    const next = setUnitWounds(state, 'squad', 6)
    const action = next.rounds[0].actions[0]
    expect(action.type).toBe('heal')
    if (action.type === 'heal') {
      expect(action.woundsRestored).toBe(-4)
      expect(action.modelsRestored).toBe(-2)
    }
  })

  it('is a no-op when the total does not change', () => {
    expect(setUnitWounds(state, 'squad', 10)).toBe(state)
    expect(setUnitWounds(state, 'missing', 4)).toBe(state)
  })
})

describe('setBattleShocked', () => {
  const state = createBattleState(armyA, armyB)

  it('toggles the flag', () => {
    const shocked = setBattleShocked(state, 'squad', true)
    expect(shocked.unitWounds['squad'].battleShocked).toBe(true)
    expect(setBattleShocked(shocked, 'squad', false).unitWounds['squad'].battleShocked).toBe(false)
  })

  it('does not record an action or change other units', () => {
    const shocked = setBattleShocked(state, 'squad', true)
    expect(shocked.rounds[0].actions).toHaveLength(0)
    expect(shocked.unitWounds['tank'].battleShocked).toBe(false)
  })
})

describe('damage allocation', () => {
  const state = createBattleState(armyA, armyB)
  const squad = state.unitWounds['squad'] // 5 models, 2 wounds each
  const tank = state.unitWounds['tank'] // 1 model, 10 wounds

  it('kills one model per failed save and loses the excess', () => {
    // Three failed saves of 2 damage each kill exactly three 2W models.
    expect(allocateFixedDamage(squad, 3, 2).modelsRemoved).toBe(3)
    // A single D6 rolling 6 still only kills the one model it was allocated to.
    const overkill = allocateDamage(squad, { failedSaves: [6], mortalWounds: 0 })
    expect(overkill.modelsRemoved).toBe(1)
    expect(overkill.woundsLost).toBe(2)
    expect(overkill.newWoundsRemaining).toEqual([2, 2, 2, 2])
  })

  it('takes each failed save separately rather than as a total', () => {
    // Rolling 3, 1, 2: the 3 kills a model (1 lost), the 1 wounds the next, and
    // the 2 finishes that one off — two dead, not three, and no leftover wound.
    const result = allocateDamage(squad, { failedSaves: [3, 1, 2], mortalWounds: 0 })
    expect(result.modelsRemoved).toBe(2)
    expect(result.newWoundsRemaining).toEqual([2, 2, 2])
    expect(result.woundsLost).toBe(4)
  })

  it('allocates to the already-wounded model first', () => {
    const wounded = { ...squad, woundsRemaining: [1, 2, 2, 2, 2] }
    const result = allocateDamage(wounded, { failedSaves: [1], mortalWounds: 0 })
    expect(result.modelsRemoved).toBe(1)
    expect(result.newWoundsRemaining).toEqual([2, 2, 2, 2])
  })

  it('spills mortal wounds between models', () => {
    const result = allocateDamage(squad, { failedSaves: [], mortalWounds: 5 })
    expect(result.modelsRemoved).toBe(2)
    expect(result.newWoundsRemaining).toEqual([1, 2, 2])
    expect(result.woundsLost).toBe(5)
  })

  it('resolves normal damage before mortal wounds', () => {
    const result = allocateDamage(squad, { failedSaves: [3], mortalWounds: 1 })
    // The save kills one model (1 damage lost), then the mortal wound hits a fresh one.
    expect(result.modelsRemoved).toBe(1)
    expect(result.newWoundsRemaining).toEqual([1, 2, 2, 2])
  })

  it('accumulates damage on a single multi-wound model', () => {
    const result = allocateDamage(tank, { failedSaves: [3, 4], mortalWounds: 1 })
    expect(result.modelsRemoved).toBe(0)
    expect(result.newWoundsRemaining).toEqual([2])
    expect(result.woundsLost).toBe(8)
  })

  it('stops once the unit is destroyed', () => {
    const result = allocateDamage(squad, { failedSaves: [2, 2, 2, 2, 2, 2, 2], mortalWounds: 3 })
    expect(result.unitDestroyed).toBe(true)
    expect(result.newWoundsRemaining).toEqual([])
    expect(result.woundsLost).toBe(10)
  })

  it('ignores zero-damage entries', () => {
    const result = allocateDamage(squad, { failedSaves: [0, 0], mortalWounds: 0 })
    expect(result.modelsRemoved).toBe(0)
    expect(result.woundsLost).toBe(0)
  })
})

describe('damage characteristics', () => {
  it('recognises fixed damage', () => {
    expect(isFixedDamage('2')).toBe(true)
    expect(isFixedDamage('D6')).toBe(false)
    expect(isFixedDamage('D6+1')).toBe(false)
    expect(parseDamageValue('3')).toBe(3)
    expect(parseDamageValue('D3')).toBe(null)
  })

  it('rounds the average for pre-filling damage rolls', () => {
    expect(averageDamage('D6')).toBe(4)
    expect(averageDamage('D3')).toBe(2)
    expect(averageDamage('D6+1')).toBe(5)
    expect(averageDamage('nonsense')).toBe(1)
  })
})
