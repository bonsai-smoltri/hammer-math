import type { ParsedRoster } from '../types/roster'

const STORAGE_KEY_A = 'w40k-roster-a'
const STORAGE_KEY_B = 'w40k-roster-b'

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
