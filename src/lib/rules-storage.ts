import type { KeywordAttachment, RuleDefinition } from '../types/rules'
import { parseRuleDefinitions } from './rules/validate'

/**
 * Persistence for homebrew rules, keyword attachments and pinned library rules.
 *
 * The same shape is used for localStorage and for the shareable export file, so
 * anything read from either is validated before it reaches the engine.
 */

const STORAGE_KEY = 'w40k-custom-rules'
const CURRENT_VERSION = 2

export interface RulesPayload {
  version: number
  rules: RuleDefinition[]
  attachments: KeywordAttachment[]
  /** Library rules the user keeps to hand as per-attack toggles. */
  pinnedRuleIds: string[]
  /** Roster-marked attachments the user has switched off. */
  disabledAttachmentIds: string[]
}

export function emptyPayload(): RulesPayload {
  return {
    version: CURRENT_VERSION,
    rules: [],
    attachments: [],
    pinnedRuleIds: [],
    disabledAttachmentIds: [],
  }
}

export function saveRulesPayload(payload: RulesPayload): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, version: CURRENT_VERSION }))
  } catch (e) {
    console.warn('Failed to save rules to localStorage:', e)
  }
}

export function loadRulesPayload(): RulesPayload {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return emptyPayload()
    return parseRulesPayload(data) ?? emptyPayload()
  } catch (e) {
    console.warn('Failed to load rules from localStorage:', e)
    return emptyPayload()
  }
}

export function clearRulesPayload(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** Parses a rules payload, returning null when the text is not usable. */
export function parseRulesPayload(json: string): RulesPayload | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.rules) && !Array.isArray(obj.attachments)) return null

  return {
    version: CURRENT_VERSION,
    rules: parseRuleDefinitions(obj.rules),
    attachments: parseAttachments(obj.attachments),
    pinnedRuleIds: asStringArray(obj.pinnedRuleIds),
    disabledAttachmentIds: asStringArray(obj.disabledAttachmentIds),
  }
}

function parseAttachments(input: unknown): KeywordAttachment[] {
  if (!Array.isArray(input)) return []
  const out: KeywordAttachment[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const a = item as Record<string, unknown>
    if (typeof a.id !== 'string' || typeof a.name !== 'string') continue
    out.push({
      id: a.id,
      name: a.name,
      keywords: asStringArray(a.keywords),
      ruleIds: asStringArray(a.ruleIds),
      unitIds: asStringArray(a.unitIds),
      sourceUnitId: typeof a.sourceUnitId === 'string' ? a.sourceUnitId : null,
      enabled: a.enabled !== false,
    })
  }
  return out
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** Downloads the payload as a shareable JSON file. */
export function exportRulesPayload(payload: RulesPayload): void {
  const data = JSON.stringify({ ...payload, version: CURRENT_VERSION }, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'w40k-rules.json'
  a.rel = 'noopener'
  // Safari/iOS needs the anchor in the document before the click, and the URL
  // must stay alive until the download has been kicked off.
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Crypto.randomUUID is unavailable outside secure contexts (plain-HTTP LAN testing). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
