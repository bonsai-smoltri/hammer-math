/** Phases relevant to combat tracking */
export type CombatPhase = 'shooting' | 'fight'

/** Tracks wounds remaining on each model in a unit */
export interface UnitWoundState {
  unitId: string
  unitName: string
  woundsPerModel: number        // from datasheet
  startingModelCount: number    // starting strength, for restoring models
  woundsRemaining: number[]     // one entry per living model, e.g. [3, 3, 2]
  isDead: boolean               // true when all models destroyed
  battleShocked: boolean        // 01.07 — OC 0, no stratagems, no actions
}

/** A single attack action recorded in the battle log */
export interface AttackAction {
  id: string
  type: 'attack'
  round: number
  turn: PlayerTurn
  phase: CombatPhase
  attackerUnitId: string
  attackerUnitName: string
  weaponName: string
  defenderUnitId: string
  defenderUnitName: string
  woundsDealt: number           // total wounds that got through (user input)
  modelsRemoved: number         // how many models were actually destroyed
  defenderModelsRemaining: number  // models left after this attack
  defenderWoundsRemaining: number  // total wounds left on defending unit
  defenderWoundsPerModel: number   // max wounds per model (for half-wounds check)
  timestamp: number
}

/** A wounds adjustment recorded in the battle log. Values are negative when wounds are removed. */
export interface HealAction {
  id: string
  type: 'heal'
  round: number
  turn: PlayerTurn
  phase: CombatPhase
  unitId: string
  unitName: string
  modelsRestored: number
  woundsRestored: number
  timestamp: number
}

/** Any action that can be recorded in the battle log */
export type BattleAction = AttackAction | HealAction

/** All actions within a single battle round */
export interface BattleRound {
  number: number
  actions: BattleAction[]
}

/** Whose turn it is within a round */
export type PlayerTurn = 'attacker' | 'defender'

/** Top-level battle state */
export interface BattleState {
  currentRound: number
  currentPhase: CombatPhase
  currentTurn: PlayerTurn
  rounds: BattleRound[]
  unitWounds: Record<string, UnitWoundState>  // keyed by unit ID
  battleComplete: boolean
}
