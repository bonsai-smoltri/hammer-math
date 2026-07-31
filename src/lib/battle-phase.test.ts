import { describe, expect, it } from 'vitest'
import {
  advancePhase,
  allocateFixedDamage,
  applyAttack,
  createBattleState,
  phaseHistory,
  weaponUsage,
} from './battle-state'
import type { BattleState } from '../types/battle'
import type { ParsedRoster, ParsedUnit } from '../types/roster'

const unit = (id: string, name: string): ParsedUnit => ({
  id,
  name,
  modelCount: 5,
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
    roster('A', [unit('attacker', 'Immortals')]),
    roster('B', [unit('target', 'Wraiths')])
  )
}

/** Records one attack with the given weapon against 'target'. */
function fire(state: BattleState, weaponName: string, attackerId = 'attacker'): BattleState {
  const damage = allocateFixedDamage(state.unitWounds.target, 1, 1)
  return applyAttack(
    state,
    attackerId,
    'Immortals',
    weaponName,
    'target',
    'Wraiths',
    damage.woundsLost,
    damage
  )
}

describe('weaponUsage', () => {
  it('is empty before anything has fired', () => {
    expect(weaponUsage(freshState(), 'attacker')).toEqual({})
  })

  it('counts each time a weapon is used in the round', () => {
    let state = fire(freshState(), 'Gauss blaster')
    expect(weaponUsage(state, 'attacker')).toEqual({ 'Gauss blaster': 1 })

    state = fire(state, 'Gauss blaster')
    state = fire(state, 'Close combat weapon')
    expect(weaponUsage(state, 'attacker')).toEqual({
      'Gauss blaster': 2,
      'Close combat weapon': 1,
    })
  })

  it('keeps usage across phases within the same round', () => {
    // A unit can shoot and then fight in the same round, so the indicator has to
    // survive the phase change rather than reset with it.
    let state = fire(freshState(), 'Gauss blaster')
    state = advancePhase(state) // attacker shooting -> attacker fight
    expect(state.currentPhase).toBe('fight')
    expect(weaponUsage(state, 'attacker')).toEqual({ 'Gauss blaster': 1 })
  })

  it('resets when the round advances', () => {
    let state = fire(freshState(), 'Gauss blaster')
    for (let i = 0; i < 4; i++) state = advancePhase(state)
    expect(state.currentRound).toBe(2)
    expect(weaponUsage(state, 'attacker')).toEqual({})
    // The earlier round is still readable.
    expect(weaponUsage(state, 'attacker', 1)).toEqual({ 'Gauss blaster': 1 })
  })

  it('only reports the unit that did the attacking', () => {
    const state = fire(freshState(), 'Gauss blaster')
    expect(weaponUsage(state, 'target')).toEqual({})
  })
})

describe('phaseHistory', () => {
  it('starts with just the opening phase', () => {
    const steps = phaseHistory(freshState())
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      round: 1,
      turn: 'attacker',
      phase: 'shooting',
      isCurrent: true,
    })
  })

  it('lists every phase up to the current one and marks only that one current', () => {
    let state = freshState()
    for (let i = 0; i < 5; i++) state = advancePhase(state)

    const steps = phaseHistory(state)
    expect(steps.map((s) => s.label)).toEqual([
      'R1 attacker shooting',
      'R1 attacker fight',
      'R1 defender shooting',
      'R1 defender fight',
      'R2 attacker shooting',
      'R2 attacker fight',
    ])
    expect(steps.filter((s) => s.isCurrent)).toHaveLength(1)
    expect(steps[steps.length - 1].isCurrent).toBe(true)
  })

  it('stops at the current phase after jumping back', () => {
    let state = freshState()
    for (let i = 0; i < 4; i++) state = advancePhase(state)
    expect(phaseHistory(state)).toHaveLength(5)

    // Jumping back shortens the list rather than keeping stale future phases.
    const back = { ...state, currentRound: 1, currentTurn: 'defender' as const, currentPhase: 'shooting' as const }
    expect(phaseHistory(back).map((s) => s.label)).toEqual([
      'R1 attacker shooting',
      'R1 attacker fight',
      'R1 defender shooting',
    ])
  })
})
