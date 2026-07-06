/** Phases relevant to combat tracking */
export type CombatPhase = 'shooting' | 'fight'

/** Tracks wounds remaining on each model in a unit */
export interface UnitWoundState {
  unitId: string
  unitName: string
  woundsPerModel: number        // from datasheet
  woundsRemaining: number[]     // one entry per living model, e.g. [3, 3, 2]
  isDead: boolean               // true when all models destroyed
}

/** A single attack action recorded in the battle log */
export interface AttackAction {
  id: string
  phase: CombatPhase
  attackerUnitId: string
  attackerUnitName: string
  weaponName: string
  defenderUnitId: string
  defenderUnitName: string
  woundsDealt: number           // total wounds that got through (user input)
  modelsRemoved: number         // how many models were actually destroyed
  timestamp: number
}

/** All attacks within a single battle round */
export interface BattleRound {
  number: number
  actions: AttackAction[]
}

/** Top-level battle state */
export interface BattleState {
  currentRound: number
  currentPhase: CombatPhase
  rounds: BattleRound[]
  unitWounds: Record<string, UnitWoundState>  // keyed by unit ID
}
