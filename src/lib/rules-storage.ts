import type { CustomRule } from '../types/rules'

const STORAGE_KEY = 'w40k-custom-rules'

export function saveRules(rules: CustomRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  } catch (e) {
    console.warn('Failed to save custom rules to localStorage:', e)
  }
}

export function loadRules(): CustomRule[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) return JSON.parse(data)
  } catch (e) {
    console.warn('Failed to load custom rules from localStorage:', e)
  }
  return []
}

export function clearRules(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** Export rules as a downloadable JSON file */
export function exportRules(rules: CustomRule[]): void {
  const data = JSON.stringify(rules, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'custom-rules.json'
  a.click()
  URL.revokeObjectURL(url)
}

/** Parse imported rules JSON, returns rules or null on failure */
export function parseImportedRules(json: string): CustomRule[] | null {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return null
    // Basic validation — each item needs id, name, appliesTo, target, effects
    for (const rule of parsed) {
      if (!rule.id || !rule.name || !rule.appliesTo || !rule.target || !rule.effects) {
        return null
      }
    }
    return parsed
  } catch {
    return null
  }
}
