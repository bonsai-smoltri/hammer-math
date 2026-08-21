import type { ParsedRoster } from '../types/roster'
import type { BattleState } from '../types/battle'

const STORAGE_KEY_A = 'w40k-roster-a'
const STORAGE_KEY_B = 'w40k-roster-b'
const STORAGE_KEY_GAME = 'w40k-game-state'
const STORAGE_KEY_SHOW_DAMAGE_ESTIMATES = 'w40k-show-damage-estimates'

export interface GameState {
  battleState: BattleState | null
  attackingUnitId: string | null
  defendingUnitId: string | null
  selectedWeaponName: string | null
  swapped: boolean
}

export function saveRoster(army: 'A' | 'B', roster: ParsedRoster): void {
  const key = army === 'A' ? STORAGE_KEY_A : STORAGE_KEY_B
  try {
    localStorage.setItem(key, JSON.stringify(roster))
  } catch (e) {
    console.warn('Failed to save roster to localStorage:', e)
  }
}

export function loadRoster(army: 'A' | 'B'): ParsedRoster | null {
  const key = army === 'A' ? STORAGE_KEY_A : STORAGE_KEY_B
  try {
    const data = localStorage.getItem(key)
    if (data) return JSON.parse(data)
  } catch (e) {
    console.warn('Failed to load roster from localStorage:', e)
  }
  return null
}

export function clearRosters(): void {
  localStorage.removeItem(STORAGE_KEY_A)
  localStorage.removeItem(STORAGE_KEY_B)
}

export function hasStoredRosters(): boolean {
  return localStorage.getItem(STORAGE_KEY_A) !== null
    && localStorage.getItem(STORAGE_KEY_B) !== null
}

export function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY_GAME, JSON.stringify(state))
  } catch (e) {
    console.warn('Failed to save game state to localStorage:', e)
  }
}

export function loadGameState(): GameState | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY_GAME)
    if (data) return JSON.parse(data)
  } catch (e) {
    console.warn('Failed to load game state from localStorage:', e)
  }
  return null
}

export function clearGameState(): void {
  localStorage.removeItem(STORAGE_KEY_GAME)
}

export function saveShowDamageEstimates(show: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_SHOW_DAMAGE_ESTIMATES, String(show))
  } catch (e) {
    console.warn('Failed to save damage estimate preference to localStorage:', e)
  }
}

export function loadShowDamageEstimates(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_SHOW_DAMAGE_ESTIMATES) === 'true'
  } catch (e) {
    console.warn('Failed to load damage estimate preference from localStorage:', e)
    return false
  }
}