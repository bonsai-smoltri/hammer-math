import type { ParsedRoster } from '../types/roster'
import { averageDice, isFixedExpression } from './rules/dice'
import type {
  BattleState,
  BattleRound,
  AttackAction,
  HealAction,
  UnitWoundState,
  CombatPhase,
  PlayerTurn,
} from '../types/battle'

export const MAX_ROUNDS = 5

/** Create initial battle state from two rosters */
export function createBattleState(armyA: ParsedRoster, armyB: ParsedRoster): BattleState {
  const unitWounds: Record<string, UnitWoundState> = {}

  for (const unit of [...armyA.units, ...armyB.units]) {
    unitWounds[unit.id] = {
      unitId: unit.id,
      unitName: unit.name,
      woundsPerModel: unit.wounds,
      startingModelCount: unit.modelCount,
      woundsRemaining: Array(unit.modelCount).fill(unit.wounds),
      isDead: false,
      battleShocked: false,
    }
  }

  return {
    currentRound: 1,
    currentPhase: 'shooting',
    currentTurn: 'attacker',
    rounds: [{ number: 1, actions: [] }],
    unitWounds,
    battleComplete: false,
  }
}

/**
 * Advance to the next phase/turn/round.
 *
 * Progression: attacker shooting → attacker fight → defender shooting → defender fight → next round
 * After 5 rounds, battle is complete.
 */
export function advancePhase(state: BattleState): BattleState {
  if (state.battleComplete) return state

  // shooting → fight (same turn)
  if (state.currentPhase === 'shooting') {
    return { ...state, currentPhase: 'fight' as CombatPhase }
  }

  // fight phase complete — check whose turn it was
  if (state.currentTurn === 'attacker') {
    // Attacker done → switch to defender's turn (shooting)
    return {
      ...state,
      currentPhase: 'shooting' as CombatPhase,
      currentTurn: 'defender',
    }
  }

  // Defender's fight phase done → advance to next round
  const nextRound = state.currentRound + 1

  if (nextRound > MAX_ROUNDS) {
    return { ...state, battleComplete: true }
  }

  const newRound: BattleRound = { number: nextRound, actions: [] }
  return {
    ...state,
    currentRound: nextRound,
    currentPhase: 'shooting' as CombatPhase,
    currentTurn: 'attacker',
    rounds: [...state.rounds, newRound],
  }
}

/** Jump back to a previous phase/turn/round */
export function jumpToPhase(
  state: BattleState,
  round: number,
  turn: 'attacker' | 'defender',
  phase: CombatPhase
): BattleState {
  return {
    ...state,
    currentRound: round,
    currentTurn: turn,
    currentPhase: phase,
    battleComplete: false,
  }
}

/** Result of calculating damage application */
export interface DamageResult {
  modelsRemoved: number
  newWoundsRemaining: number[]
  unitDestroyed: boolean
  /** Wounds actually removed from the unit, i.e. excluding overkill. */
  woundsLost: number
}

/** What got through to the target. */
export interface DamageAllocation {
  /**
   * The damage inflicted by each failed save. Every entry is allocated to a
   * single model and any excess is lost (05.04), so [6] against a 2-wound model
   * kills one model, not three.
   */
  failedSaves: number[]
  /**
   * Mortal wounds, which are resolved one wound at a time and do carry on to the
   * next model (06.02). Resolved after all normal damage.
   */
  mortalWounds: number
}

/**
 * Applies an attack's damage to a unit.
 *
 * Allocation follows the same model until it is destroyed: damage goes to the
 * already-wounded model first, and only then to a fresh one.
 */
export function allocateDamage(
  unitState: UnitWoundState,
  allocation: DamageAllocation
): DamageResult {
  const wounds = [...unitState.woundsRemaining]
  const startingTotal = wounds.reduce((sum, w) => sum + w, 0)
  const startingModels = wounds.length
  const { woundsPerModel } = unitState

  const targetIndex = () => {
    const wounded = wounds.findIndex((w) => w < woundsPerModel)
    return wounded === -1 ? 0 : wounded
  }

  for (const damage of allocation.failedSaves) {
    if (wounds.length === 0 || damage <= 0) continue
    const index = targetIndex()
    // Excess damage beyond this model's remaining wounds is lost.
    wounds[index] -= damage
    if (wounds[index] <= 0) wounds.splice(index, 1)
  }

  for (let i = 0; i < allocation.mortalWounds && wounds.length > 0; i++) {
    const index = targetIndex()
    wounds[index] -= 1
    if (wounds[index] <= 0) wounds.splice(index, 1)
  }

  return {
    modelsRemoved: startingModels - wounds.length,
    newWoundsRemaining: wounds,
    unitDestroyed: wounds.length === 0,
    woundsLost: startingTotal - wounds.reduce((sum, w) => sum + w, 0),
  }
}

/** Convenience for weapons with a fixed D characteristic. */
export function allocateFixedDamage(
  unitState: UnitWoundState,
  failedSaves: number,
  damagePerSave: number
): DamageResult {
  return allocateDamage(unitState, {
    failedSaves: Array(Math.max(0, failedSaves)).fill(damagePerSave),
    mortalWounds: 0,
  })
}

/** Apply damage result to the battle state, recording the action */
export function applyAttack(
  state: BattleState,
  attackerUnitId: string,
  attackerUnitName: string,
  weaponName: string,
  defenderUnitId: string,
  defenderUnitName: string,
  woundsDealt: number,
  damageResult: DamageResult
): BattleState {
  const defenderState = state.unitWounds[defenderUnitId]
  const action: AttackAction = {
    id: newActionId(),
    type: 'attack',
    round: state.currentRound,
    turn: state.currentTurn,
    phase: state.currentPhase,
    attackerUnitId,
    attackerUnitName,
    weaponName,
    defenderUnitId,
    defenderUnitName,
    woundsDealt,
    modelsRemoved: damageResult.modelsRemoved,
    defenderModelsRemaining: damageResult.newWoundsRemaining.length,
    defenderWoundsRemaining: damageResult.newWoundsRemaining.reduce((s, w) => s + w, 0),
    defenderWoundsPerModel: defenderState.woundsPerModel,
    timestamp: Date.now(),
  }

  const unitWounds = { ...state.unitWounds }
  unitWounds[defenderUnitId] = {
    ...unitWounds[defenderUnitId],
    woundsRemaining: damageResult.newWoundsRemaining,
    isDead: damageResult.unitDestroyed,
  }

  return {
    ...state,
    rounds: appendAction(state.rounds, state.currentRound, action),
    unitWounds,
  }
}

/** Total wounds remaining across the unit. */
export function totalWoundsRemaining(unitState: UnitWoundState): number {
  return unitState.woundsRemaining.reduce((sum, w) => sum + w, 0)
}

/**
 * How many times a unit has already attacked with each of its weapons in a
 * round, keyed by weapon name.
 *
 * Derived from the battle log rather than tracked separately, so it stays honest
 * when the user jumps back to an earlier phase, and resets on its own when the
 * round advances. This is an indicator only — nothing stops a weapon being used
 * again, since a unit can legitimately shoot and then fight in the same round.
 */
export function weaponUsage(
  state: BattleState,
  unitId: string,
  round: number = state.currentRound
): Record<string, number> {
  const usage: Record<string, number> = {}
  const entry = state.rounds.find((r) => r.number === round)
  for (const action of entry?.actions ?? []) {
    if (action.type !== 'attack' || action.attackerUnitId !== unitId) continue
    usage[action.weaponName] = (usage[action.weaponName] ?? 0) + 1
  }
  return usage
}

/** One entry in the battle's phase order. */
export interface PhaseStep {
  round: number
  turn: PlayerTurn
  phase: CombatPhase
  label: string
  isCurrent: boolean
}

const PHASE_ORDER: [PlayerTurn, CombatPhase][] = [
  ['attacker', 'shooting'],
  ['attacker', 'fight'],
  ['defender', 'shooting'],
  ['defender', 'fight'],
]

/**
 * Every phase from the start of the battle up to and including the current one,
 * for the jump-back list.
 */
export function phaseHistory(state: BattleState): PhaseStep[] {
  const steps: PhaseStep[] = []

  for (let round = 1; round <= state.currentRound; round++) {
    for (const [turn, phase] of PHASE_ORDER) {
      const isCurrent =
        round === state.currentRound &&
        turn === state.currentTurn &&
        phase === state.currentPhase
      steps.push({ round, turn, phase, label: `R${round} ${turn} ${phase}`, isCurrent })
      if (isCurrent) return steps
    }
  }

  return steps
}

/** Maximum wounds the unit can have (starting strength × wounds per model). */
export function maxWounds(unitState: UnitWoundState): number {
  return unitState.startingModelCount * unitState.woundsPerModel
}

/**
 * Rebuilds a unit's wound pool from a single total.
 *
 * Only one model in a unit can be damaged at a time — damage is allocated to the
 * same model until it is destroyed — so a total is enough to describe the unit:
 * as many full-strength models as fit, plus at most one damaged model.
 */
export function woundsToModels(total: number, woundsPerModel: number, startingModelCount: number): number[] {
  const capped = Math.max(0, Math.min(total, startingModelCount * woundsPerModel))
  const fullModels = Math.floor(capped / woundsPerModel)
  const remainder = capped % woundsPerModel
  const models = Array(fullModels).fill(woundsPerModel)
  if (remainder > 0) models.push(remainder)
  return models
}

/**
 * Sets a unit's remaining wounds directly and records the change.
 * Used by the +/- control on the unit profile, for damage and healing alike.
 */
export function setUnitWounds(state: BattleState, unitId: string, newTotal: number): BattleState {
  const current = state.unitWounds[unitId]
  if (!current) return state

  const before = totalWoundsRemaining(current)
  const clamped = Math.max(0, Math.min(newTotal, maxWounds(current)))
  if (clamped === before) return state

  const woundsRemaining = woundsToModels(clamped, current.woundsPerModel, current.startingModelCount)
  const action: HealAction = {
    id: newActionId(),
    type: 'heal',
    round: state.currentRound,
    turn: state.currentTurn,
    phase: state.currentPhase,
    unitId,
    unitName: current.unitName,
    modelsRestored: woundsRemaining.length - current.woundsRemaining.length,
    woundsRestored: clamped - before,
    timestamp: Date.now(),
  }

  return {
    ...state,
    rounds: appendAction(state.rounds, state.currentRound, action),
    unitWounds: {
      ...state.unitWounds,
      [unitId]: { ...current, woundsRemaining, isDead: woundsRemaining.length === 0 },
    },
  }
}

/** Flips a unit's battle-shocked state (01.07). */
export function setBattleShocked(
  state: BattleState,
  unitId: string,
  battleShocked: boolean
): BattleState {
  const current = state.unitWounds[unitId]
  if (!current || current.battleShocked === battleShocked) return state
  return {
    ...state,
    unitWounds: { ...state.unitWounds, [unitId]: { ...current, battleShocked } },
  }
}

function newActionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function appendAction(
  rounds: BattleRound[],
  currentRound: number,
  action: AttackAction | HealAction
): BattleRound[] {
  const next = [...rounds]
  const index = next.findIndex((r) => r.number === currentRound)
  if (index !== -1) {
    next[index] = { ...next[index], actions: [...next[index].actions, action] }
  }
  return next
}

/** Get a display-friendly summary of a unit's health */
export function getUnitHealthSummary(unitState: UnitWoundState): string {
  if (unitState.isDead) return 'Destroyed'
  const alive = unitState.woundsRemaining.length
  const current = totalWoundsRemaining(unitState)
  if (unitState.woundsPerModel === 1) {
    return `${alive} models`
  }
  return `${alive} models (${current}/${maxWounds(unitState)} wounds)`
}

/** Check if weapon has fixed or variable damage */
export function isFixedDamage(damageExpression: string): boolean {
  return isFixedExpression(damageExpression)
}

/** Parse fixed damage value from expression, or null when it is variable. */
export function parseDamageValue(damageExpression: string): number | null {
  return isFixedExpression(damageExpression) ? (averageDice(damageExpression) ?? null) : null
}

/** Average damage, used to pre-fill the damage inputs for variable weapons. */
export function averageDamage(damageExpression: string): number {
  return Math.max(1, Math.round(averageDice(damageExpression) ?? 1))
}
