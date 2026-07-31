import type { BattleRecord, BattleState } from '../types/battle'
import { MAX_ROUNDS } from './battle-state'

/**
 * Persistence for finished battles.
 *
 * Same contract as the other storage modules: whatever is on disk is validated
 * on read and anything that does not look like a record is dropped, rather than
 * being migrated or trusted.
 */

const STORAGE_KEY = 'w40k-battle-history'

/** Kept small on purpose — each record carries a whole battle log. */
export const MAX_HISTORY = 20

export function loadBattleHistory(): BattleRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isBattleRecord).slice(0, MAX_HISTORY)
  } catch (e) {
    console.warn('Failed to load battle history from localStorage:', e)
    return []
  }
}

export function saveBattleHistory(records: BattleRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_HISTORY)))
  } catch (e) {
    // Most likely the quota: drop the oldest half and try once more so the
    // newest battle is still kept.
    console.warn('Failed to save battle history, trimming:', e)
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(records.slice(0, Math.floor(MAX_HISTORY / 2)))
      )
    } catch {
      /* give up rather than break the battle in progress */
    }
  }
}

/** Builds a record for a battle that is being put away. */
export function toBattleRecord(
  state: BattleState,
  armyAName: string,
  armyBName: string,
  now: number = Date.now()
): BattleRecord {
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: now,
    armyAName,
    armyBName,
    roundsPlayed: state.battleComplete ? MAX_ROUNDS : state.currentRound,
    completed: state.battleComplete,
    state,
  }
}

/** Newest first, capped. Returns the new list; does not write. */
export function addBattleRecord(
  history: BattleRecord[],
  record: BattleRecord
): BattleRecord[] {
  return [record, ...history].slice(0, MAX_HISTORY)
}

export function removeBattleRecord(history: BattleRecord[], id: string): BattleRecord[] {
  return history.filter((record) => record.id !== id)
}

export function clearBattleHistory(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** True when anything actually happened, so empty battles are not archived. */
export function hasRecordedActions(state: BattleState): boolean {
  return state.rounds.some((round) => round.actions.length > 0)
}

export interface BattleTally {
  actions: number
  woundsDealt: number
  unitsDestroyed: number
}

/**
 * What happened, counted from the log. Deliberately not split by side: the log
 * records unit names but not which army they came from.
 */
export function tallyBattle(state: BattleState): BattleTally {
  let actions = 0
  let woundsDealt = 0
  let unitsDestroyed = 0

  for (const round of state.rounds) {
    for (const action of round.actions) {
      actions++
      if (action.type !== 'attack') continue
      woundsDealt += action.woundsDealt
      if (action.defenderModelsRemaining === 0) unitsDestroyed++
    }
  }

  return { actions, woundsDealt, unitsDestroyed }
}

/** One-line readout for the past-battles list. */
export function battleHeadline(record: BattleRecord): string {
  const tally = tallyBattle(record.state)
  if (tally.actions === 0) return 'No attacks recorded'
  const parts = [`${tally.woundsDealt} wounds`]
  if (tally.unitsDestroyed > 0) {
    parts.push(`${tally.unitsDestroyed} unit${tally.unitsDestroyed === 1 ? '' : 's'} destroyed`)
  }
  return parts.join(' · ')
}

export function isBattleRecord(value: unknown): value is BattleRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.savedAt === 'number' &&
    typeof record.armyAName === 'string' &&
    typeof record.armyBName === 'string' &&
    typeof record.roundsPlayed === 'number' &&
    typeof record.completed === 'boolean' &&
    isBattleState(record.state)
  )
}

function isBattleState(value: unknown): value is BattleState {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  return (
    typeof state.currentRound === 'number' &&
    Array.isArray(state.rounds) &&
    state.rounds.every(isBattleRound) &&
    typeof state.unitWounds === 'object' &&
    state.unitWounds !== null
  )
}

function isBattleRound(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const round = value as Record<string, unknown>
  return typeof round.number === 'number' && Array.isArray(round.actions)
}
