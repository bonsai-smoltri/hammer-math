import type { ParsedUnit, ParsedWeapon, WeaponKeyword } from '../../types/roster'
import type {
  EffectiveUnitKeywords,
  KeywordAttachment,
  KeywordQuery,
  RuleTarget,
} from '../../types/rules'

/**
 * Keyword handling and attachment resolution.
 *
 * 40k keywords are compared case-insensitively and are printed inconsistently
 * across sources (BattleScribe emits "Faction: T'au Empire", datasheets print
 * "T’AU EMPIRE", weapon abilities appear as "[SUSTAINED HITS 1]"). Everything
 * here funnels through `normalizeKeyword` so those all compare equal.
 */

/** Prefixes BattleScribe puts on category names that are not part of the keyword. */
const CATEGORY_PREFIXES = ['faction:', 'faction :']

export function normalizeKeyword(raw: string): string {
  let value = raw
    .trim()
    .toLowerCase()
    // Curly apostrophes / dashes vary between sources.
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[[\]]/g, '')
    .replace(/\s+/g, ' ')

  for (const prefix of CATEGORY_PREFIXES) {
    if (value.startsWith(prefix)) {
      value = value.slice(prefix.length).trim()
      break
    }
  }

  // Singular and plural instances of a keyword function the same way (02.05).
  if (value.endsWith('s') && !value.endsWith('ss')) {
    const singular = value.slice(0, -1)
    if (IRREGULAR_PLURALS.has(value)) return IRREGULAR_PLURALS.get(value)!
    if (KNOWN_SINGULARS.has(singular)) return singular
  }
  return value
}

/** Keywords where the plural form is the canonical one on datasheets. */
const IRREGULAR_PLURALS = new Map<string, string>([
  ['beasts', 'beast'],
  ['swarms', 'swarm'],
  ['characters', 'character'],
  ['vehicles', 'vehicle'],
  ['monsters', 'monster'],
  ['infantries', 'infantry'],
  ['psykers', 'psyker'],
  ['walkers', 'walker'],
  ['grenades', 'grenade'],
  ['explosives', 'explosive'],
])

const KNOWN_SINGULARS = new Set([
  'beast',
  'swarm',
  'character',
  'vehicle',
  'monster',
  'psyker',
  'walker',
  'grenade',
  'explosive',
  'titanic',
  'battleline',
  'transport',
  'fortification',
  'aircraft',
])

export function keywordsMatch(a: string, b: string): boolean {
  return normalizeKeyword(a) === normalizeKeyword(b)
}

export function hasUnitKeyword(keywords: string[], keyword: string): boolean {
  const needle = normalizeKeyword(keyword)
  return keywords.some((k) => normalizeKeyword(k) === needle)
}

/**
 * Compound keywords such as INFANTRY/BEASTS/SWARM in rules text mean "any of".
 * Split them so a single condition entry can express the same thing.
 */
export function expandKeywordAlternatives(keyword: string): string[] {
  return keyword
    .split('/')
    .map((k) => k.trim())
    .filter(Boolean)
}

export function matchesKeywordQuery(keywords: string[], query: KeywordQuery | undefined): boolean {
  if (!query) return true
  const has = (needle: string) =>
    expandKeywordAlternatives(needle).some((alt) => hasUnitKeyword(keywords, alt))

  if (query.all && !query.all.every(has)) return false
  if (query.any && query.any.length > 0 && !query.any.some(has)) return false
  if (query.none && query.none.some(has)) return false
  return true
}

// --- Weapon abilities -----------------------------------------------------

export function hasWeaponKeyword(weapon: ParsedWeapon, keyword: string): boolean {
  return findWeaponKeyword(weapon, keyword) !== null
}

export function findWeaponKeyword(weapon: ParsedWeapon, keyword: string): WeaponKeyword | null {
  const needle = normalizeKeyword(keyword)
  for (const kw of weapon.keywords) {
    const name = normalizeKeyword(kw.name)
    if (name === needle) return kw
    // Anti-Vehicle should also answer to a lookup for 'Anti'.
    if (needle === 'anti' && name.startsWith('anti-')) return kw
  }
  return null
}

export function weaponKeywordValue(weapon: ParsedWeapon, keyword: string): number | null {
  return findWeaponKeyword(weapon, keyword)?.value ?? null
}

/**
 * A weapon ability followed by keywords only applies against targets holding one
 * of them (24.01), e.g. `[LETHAL HITS: VEHICLE]`.
 */
export function weaponAbilityApplies(kw: WeaponKeyword, targetKeywords: string[]): boolean {
  if (!kw.restrictedTo || kw.restrictedTo.length === 0) return true
  return kw.restrictedTo.some((restriction) =>
    expandKeywordAlternatives(restriction).some((alt) => hasUnitKeyword(targetKeywords, alt))
  )
}

/** Parses `Anti-Vehicle 4+` into its target keyword and threshold. */
export function parseAntiKeyword(kw: WeaponKeyword): { keyword: string; threshold: number } | null {
  const name = normalizeKeyword(kw.name)
  if (!name.startsWith('anti-')) return null
  const keyword = kw.name.trim().slice(kw.name.trim().toLowerCase().indexOf('anti-') + 5)
  if (!keyword || kw.value == null) return null
  return { keyword, threshold: kw.value }
}

// --- Attachments ----------------------------------------------------------

/**
 * Resolves the keywords a unit actually has once attachments are applied, along
 * with the other units it is attached to.
 *
 * Attached units have all of the keywords of all of their component units
 * (19.03), so both directions are merged: the bodyguard unit gains the leader's
 * keywords and the leader gains the bodyguard's.
 */
export function resolveUnitKeywords(
  unit: ParsedUnit,
  attachments: KeywordAttachment[],
  unitsById: Map<string, ParsedUnit> = new Map()
): EffectiveUnitKeywords {
  const keywords = [...unit.keywords]
  const grantedRuleIds: string[] = []
  const partnerUnitIds: string[] = []
  const attachmentNames: string[] = []

  const push = (values: string[]) => {
    for (const value of values) {
      if (!value) continue
      if (!hasUnitKeyword(keywords, value)) keywords.push(value)
    }
  }

  const addPartner = (id: string | null | undefined) => {
    if (!id || id === unit.id) return
    if (!partnerUnitIds.includes(id)) partnerUnitIds.push(id)
  }

  for (const attachment of attachments) {
    if (!attachment.enabled) continue

    const isTarget = attachment.unitIds.includes(unit.id)
    const isSource = attachment.sourceUnitId === unit.id
    if (!isTarget && !isSource) continue

    attachmentNames.push(attachment.name)
    push(attachment.keywords)
    for (const ruleId of attachment.ruleIds) {
      if (!grantedRuleIds.includes(ruleId)) grantedRuleIds.push(ruleId)
    }

    // Every other unit in the attachment is part of the same attached unit.
    addPartner(attachment.sourceUnitId)
    for (const targetId of attachment.unitIds) addPartner(targetId)

    if (isTarget && attachment.sourceUnitId) {
      const source = unitsById.get(attachment.sourceUnitId)
      if (source) push(source.keywords)
    }

    if (isSource) {
      // The leader is part of the attached unit, so it picks up the bodyguard
      // unit's keywords too.
      for (const targetId of attachment.unitIds) {
        const target = unitsById.get(targetId)
        if (target) push(target.keywords)
      }
    }
  }

  return { keywords, grantedRuleIds, partnerUnitIds, attachmentNames }
}

export function buildUnitIndex(units: ParsedUnit[]): Map<string, ParsedUnit> {
  const map = new Map<string, ParsedUnit>()
  for (const unit of units) map.set(unit.id, unit)
  return map
}

/**
 * Every keyword present across the given units, for the keyword picker.
 * BattleScribe's "Faction: " category prefix is dropped so a faction keyword
 * reads the same as any other.
 */
export function collectKeywords(units: ParsedUnit[]): string[] {
  const seen = new Map<string, string>()
  for (const unit of units) {
    for (const keyword of unit.keywords) {
      const key = normalizeKeyword(keyword)
      if (!key) continue
      const display = stripCategoryPrefix(keyword)
      const existing = seen.get(key)
      // Prefer the shortest display form, which is the one without a prefix.
      if (!existing || display.length < existing.length) seen.set(key, display)
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

function stripCategoryPrefix(keyword: string): string {
  const trimmed = keyword.trim()
  const lower = trimmed.toLowerCase()
  for (const prefix of CATEGORY_PREFIXES) {
    if (lower.startsWith(prefix)) return trimmed.slice(prefix.length).trim()
  }
  return trimmed
}

// --- Rule targeting -------------------------------------------------------

/**
 * Does a rule's target selector cover this unit?
 *
 * `partnerUnitIds` are the other units in the same attached unit: a rule named
 * against a Leader applies to the squad it is leading, and vice versa (19.04).
 * Keyword targets need no special handling because an attached unit already has
 * every keyword of its components.
 */
export function targetMatchesUnit(
  target: RuleTarget | undefined,
  unitId: string,
  effectiveKeywords: string[],
  partnerUnitIds: string[] = []
): boolean {
  if (!target || target.type === 'global') return true

  if (target.type === 'keyword') {
    const keywords = target.keywords ?? []
    if (keywords.length === 0) return false
    return target.keywordMatch === 'all'
      ? matchesKeywordQuery(effectiveKeywords, { all: keywords })
      : matchesKeywordQuery(effectiveKeywords, { any: keywords })
  }

  if (target.type === 'unit') {
    const ids = target.unitIds ?? []
    return ids.includes(unitId) || partnerUnitIds.some((id) => ids.includes(id))
  }

  return false
}
