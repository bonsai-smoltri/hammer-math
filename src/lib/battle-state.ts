import type { ParsedRoster } from '../types/roster'
import type {
  BattleState,
  BattleRound,
  AttackAction,
  HealAction,
  UnitWoundState,
  CombatPhase,
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
      woundsRemaining: Array(unit.modelCount).fill(unit.wounds),
      isDead: false,
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
}

/**
 * Calculate how wounds are applied to a unit.
 *
 * Rules:
 * - Each failed save deals weapon damage to ONE model
 * - Excess damage on a model is lost (doesn't spill)
 * - Damage is allocated to wounded models first
 * - For Devastating Wounds / mortal wounds from Dev Wounds: same rule (max 1 model per crit)
 *
 * For simplicity, we ask the user for total wounds dealt and the weapon's damage per hit.
 * We then walk through the unit's models allocating damage per hit.
 */
export function calculateDamage(
  unitState: UnitWoundState,
  woundsDealt: number,
  damagePerHit: number
): DamageResult {
  // Clone the wounds array
  const wounds = [...unitState.woundsRemaining]
  let modelsRemoved = 0

  // Number of "hits" that got through (failed saves)
  // Each hit does damagePerHit wounds to one model
  const hits = Math.ceil(woundsDealt / damagePerHit)

  // Sort to allocate to wounded models first (lowest wounds first)
  // But we need to track the actual damage properly
  // Actually, we allocate hits one at a time to the first wounded model (or first model)

  let remainingHits = hits

  while (remainingHits > 0 && wounds.length > 0) {
    // Find the first wounded model (one with fewer than max wounds), or first model
    let targetIdx = wounds.findIndex(w => w < unitState.woundsPerModel)
    if (targetIdx === -1) targetIdx = 0

    // Apply damage to this model
    wounds[targetIdx] -= damagePerHit

    if (wounds[targetIdx] <= 0) {
      // Model destroyed — remove it, excess damage lost
      wounds.splice(targetIdx, 1)
      modelsRemoved++
    }

    remainingHits--
  }

  return {
    modelsRemoved,
    newWoundsRemaining: wounds,
    unitDestroyed: wounds.length === 0,
  }
}

/**
 * Simpler version: user inputs total wounds dealt directly.
 * Used for variable damage weapons (Dd3, Dd6, etc.) where the user
 * has already rolled and tallied total wounds.
 *
 * Allocates wounds one at a time to wounded model first (mortal wound style).
 */
export function calculateDamageFromTotal(
  unitState: UnitWoundState,
  totalWounds: number
): DamageResult {
  const wounds = [...unitState.woundsRemaining]
  let modelsRemoved = 0
  let remaining = totalWounds

  while (remaining > 0 && wounds.length > 0) {
    // Allocate to wounded model first
    let targetIdx = wounds.findIndex(w => w < unitState.woundsPerModel)
    if (targetIdx === -1) targetIdx = 0

    wounds[targetIdx] -= 1
    remaining--

    if (wounds[targetIdx] <= 0) {
      wounds.splice(targetIdx, 1)
      modelsRemoved++
    }
  }

  return {
    modelsRemoved,
    newWoundsRemaining: wounds,
    unitDestroyed: wounds.length === 0,
  }
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
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  // Update the current round's actions
  const rounds = [...state.rounds]
  const currentRoundIdx = rounds.findIndex(r => r.number === state.currentRound)
  if (currentRoundIdx !== -1) {
    rounds[currentRoundIdx] = {
      ...rounds[currentRoundIdx],
      actions: [...rounds[currentRoundIdx].actions, action],
    }
  }

  // Update unit wound state
  const unitWounds = { ...state.unitWounds }
  unitWounds[defenderUnitId] = {
    ...unitWounds[defenderUnitId],
    woundsRemaining: damageResult.newWoundsRemaining,
    isDead: damageResult.unitDestroyed,
  }

  return { ...state, rounds, unitWounds }
}

/** Apply a heal/restore to the battle state, recording the action */
export function applyHeal(
  state: BattleState,
  unitId: string,
  unitName: string,
  woundsRestored: number,
  originalModelCount: number,
  woundsPerModel: number
): BattleState {
  // Update unit wound state first to calculate actual models restored
  const current = state.unitWounds[unitId]
  const newWounds = [...current.woundsRemaining]
  let remaining = woundsRestored
  let modelsRestored = 0

  // Step 1: Heal the wounded model to full
  for (let i = 0; i < newWounds.length && remaining > 0; i++) {
    if (newWounds[i] < woundsPerModel) {
      const canHeal = Math.min(woundsPerModel - newWounds[i], remaining)
      newWounds[i] += canHeal
      remaining -= canHeal
    }
  }

  // Step 2: Restore dead models with remaining wounds
  while (remaining >= woundsPerModel && newWounds.length < originalModelCount) {
    newWounds.push(woundsPerModel)
    remaining -= woundsPerModel
    modelsRestored++
  }

  // Step 3: If there are leftover wounds and room for a model, add a partial model
  if (remaining > 0 && newWounds.length < originalModelCount) {
    newWounds.push(remaining)
    modelsRestored++
    remaining = 0
  }

  const action: HealAction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'heal',
    round: state.currentRound,
    turn: state.currentTurn,
    phase: state.currentPhase,
    unitId,
    unitName,
    modelsRestored,
    woundsRestored,
    timestamp: Date.now(),
  }

  // Update the current round's actions
  const rounds = [...state.rounds]
  const currentRoundIdx = rounds.findIndex(r => r.number === state.currentRound)
  if (currentRoundIdx !== -1) {
    rounds[currentRoundIdx] = {
      ...rounds[currentRoundIdx],
      actions: [...rounds[currentRoundIdx].actions, action],
    }
  }

  const unitWounds = { ...state.unitWounds }
  unitWounds[unitId] = {
    ...current,
    woundsRemaining: newWounds,
    isDead: newWounds.length === 0,
  }

  return { ...state, rounds, unitWounds }
}

/** Get a display-friendly summary of a unit's health */
export function getUnitHealthSummary(unitState: UnitWoundState): string {
  if (unitState.isDead) return 'Destroyed'
  const alive = unitState.woundsRemaining.length
  const total = alive * unitState.woundsPerModel
  const current = unitState.woundsRemaining.reduce((sum, w) => sum + w, 0)
  if (unitState.woundsPerModel === 1) {
    return `${alive} models`
  }
  return `${alive} models (${current}/${total} wounds)`
}

/** Check if weapon has fixed or variable damage */
export function isFixedDamage(damageExpression: string): boolean {
  const num = parseInt(damageExpression)
  return !isNaN(num) && damageExpression.trim() === String(num)
}

/** Parse fixed damage value from expression */
export function parseDamageValue(damageExpression: string): number | null {
  const num = parseInt(damageExpression)
  if (!isNaN(num) && damageExpression.trim() === String(num)) return num
  return null
}
