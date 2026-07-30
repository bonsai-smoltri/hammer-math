import type {
  ParsedAttachment,
  ParsedRoster,
  ParsedUnit,
  ParsedWeapon,
  UnitAbility,
  WeaponKeyword,
} from '../types/roster'
import { normalizeKeyword } from './rules/keywords'

/**
 * BattleScribe JSON roster parser.
 *
 * Shape notes, confirmed against the exports in `data/`:
 *  - A datasheet is a top-level selection of type 'unit' (multi-model) or 'model'
 *    (single model). Multi-model units contain 'model' children, one per profile
 *    variant, each with a `number`.
 *  - Weapons are 'upgrade' selections whose profiles are typed 'Ranged Weapons'
 *    or 'Melee Weapons'. Their `number` is the count of that weapon, which can
 *    exceed the model count (twin-linked loadouts) or be lower than it.
 *  - A Leader is identified by an 'Abilities' profile named "Leader"; its text
 *    lists the units it can attach to.
 */

const DEFAULT_TOUGHNESS = 4
const DEFAULT_SAVE = 4
const DEFAULT_WOUNDS = 1
const DEFAULT_SKILL = 4
const DEFAULT_STRENGTH = 4

const WEAPON_PROFILE_TYPES = ['Ranged Weapons', 'Melee Weapons']

export function parseRoster(json: any): ParsedRoster {
  const roster = json?.roster ?? json
  const name = roster?.name ?? 'Unknown Army'
  const points = roster?.costs?.[0]?.value ?? 0

  const units: ParsedUnit[] = []
  const attachments: ParsedAttachment[] = []
  const warnings: string[] = []

  for (const force of roster?.forces ?? []) {
    for (const selection of force?.selections ?? []) {
      collectUnits(selection, null, units, attachments, warnings)
    }
  }

  if (units.length === 0) {
    warnings.push('No units were found. Is this a BattleScribe JSON export?')
  }

  const attachmentCandidates = findAttachmentCandidates(units, attachments)

  return { name, points, units, attachments, attachmentCandidates, warnings }
}

/**
 * Pairings a Leader/Support ability allows.
 *
 * "This model can be attached to the following units: ..." states what is
 * *legal*, not what the player did — an export gives us no way to tell whether a
 * Character was actually attached. These are therefore suggestions only; the user
 * confirms one (or writes a keyword rule instead).
 */
function findAttachmentCandidates(
  units: ParsedUnit[],
  attached: ParsedAttachment[]
): ParsedAttachment[] {
  const candidates: ParsedAttachment[] = []

  for (const leader of units) {
    if (!leader.isLeader || leader.attachableTo.length === 0) continue
    if (attached.some((a) => a.leaderUnitId === leader.id)) continue

    for (const candidate of units) {
      if (candidate.id === leader.id || candidate.isLeader) continue
      if (!leader.attachableTo.some((name) => namesMatch(name, candidate.name))) continue
      candidates.push({
        leaderUnitId: leader.id,
        leaderName: leader.name,
        bodyguardUnitId: candidate.id,
        bodyguardName: candidate.name,
        source: 'name-match',
      })
    }
  }

  return candidates
}

/** Datasheet names are printed in caps and sometimes pluralised differently. */
export function namesMatch(a: string, b: string): boolean {
  return normalizeKeyword(a) === normalizeKeyword(b)
}

/**
 * Walks a top-level selection, emitting the datasheet it represents plus any
 * Leader nested inside it as an attached unit.
 */
function collectUnits(
  selection: any,
  parentUnitId: string | null,
  units: ParsedUnit[],
  attachments: ParsedAttachment[],
  warnings: string[]
): void {
  if (!selection || isConfiguration(selection)) return
  if (selection.type !== 'unit' && selection.type !== 'model') return

  const nestedLeaders = findNestedLeaders(selection)
  const unit = parseSelection(selection, parentUnitId, nestedLeaders, warnings)
  if (!unit) {
    warnings.push(
      `${selection.name ?? 'A selection'} was skipped: no unit stat line (M/T/Sv/W) was found.`
    )
    return
  }
  units.push(unit)

  for (const leaderSelection of nestedLeaders) {
    const before = units.length
    collectUnits(leaderSelection, unit.id, units, attachments, warnings)
    const leader = units[before]
    if (leader) {
      attachments.push({
        leaderUnitId: leader.id,
        leaderName: leader.name,
        bodyguardUnitId: unit.id,
        bodyguardName: unit.name,
        source: 'nested',
      })
    }
  }
}

function isConfiguration(selection: any): boolean {
  return (selection.categories ?? []).some((c: any) => c?.name === 'Configuration')
}

/**
 * A Leader attached to a bodyguard unit appears as a child selection that has
 * both its own Unit profile and its own Leader/Support ability. Model variants
 * belonging to the same datasheet have neither.
 */
function findNestedLeaders(selection: any): any[] {
  const leaders: any[] = []
  for (const child of selection.selections ?? []) {
    if (child?.type !== 'unit' && child?.type !== 'model') continue
    if (!hasOwnProfile(child, 'Unit')) continue
    if (!hasLeaderAbility(child)) continue
    leaders.push(child)
  }
  return leaders
}

function hasOwnProfile(selection: any, typeName: string): boolean {
  return (selection.profiles ?? []).some((p: any) => p?.typeName === typeName)
}

/** Leader (24.22) and Support (24.34) both form attached units. */
const ATTACHING_ABILITIES = ['leader', 'support']

function hasLeaderAbility(selection: any): boolean {
  const named = (selection.profiles ?? []).some(
    (p: any) => p?.typeName === 'Abilities' && ATTACHING_ABILITIES.includes(normalize(p?.name))
  )
  if (named) return true
  return (selection.categories ?? []).some((c: any) => normalize(c?.name) === 'leader')
}

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function parseSelection(
  selection: any,
  parentUnitId: string | null,
  excluded: any[],
  warnings: string[]
): ParsedUnit | null {
  const name = selection.name ?? 'Unnamed unit'
  const unitProfile = findUnitProfile(selection, excluded)
  if (!unitProfile) return null

  const toughness = parseStatNumber(unitProfile.T)
  const save = parseStatNumber(unitProfile.Sv)
  const wounds = parseStatNumber(unitProfile.W)
  if (toughness === null) warnings.push(`${name}: could not read Toughness, using ${DEFAULT_TOUGHNESS}.`)
  if (save === null) warnings.push(`${name}: could not read Save, using ${DEFAULT_SAVE}+.`)
  if (wounds === null) warnings.push(`${name}: could not read Wounds, using ${DEFAULT_WOUNDS}.`)

  const abilities = collectAbilities(selection, excluded)
  // Abilities a Leader grants to the unit it joins are not part of its own
  // profile — they only apply once attached (19.04).
  const ownAbilityTexts = abilities
    .filter((a) => !isConferredWhileLeading(a.description))
    .map((a) => a.description)
  const profileInvuln = parseStatNumber(unitProfile.InSv)
  const attachingAbility = abilities.find((a) => ATTACHING_ABILITIES.includes(normalize(a.name)))

  return {
    id: selection.id,
    name,
    modelCount: countModels(selection, excluded),
    toughness: toughness ?? DEFAULT_TOUGHNESS,
    save: save ?? DEFAULT_SAVE,
    wounds: wounds ?? DEFAULT_WOUNDS,
    invulnerableSave: profileInvuln ?? parseInvulnerableSave(ownAbilityTexts),
    feelNoPain: parseFeelNoPain(ownAbilityTexts),
    move: unitProfile.M ?? null,
    leadership: unitProfile.LD ?? null,
    objectiveControl: parseStatNumber(unitProfile.OC),
    weapons: collectWeapons(selection, excluded, name, warnings),
    keywords: (selection.categories ?? []).map((c: any) => c?.name).filter(Boolean),
    abilities,
    points: selection.costs?.[0]?.value ?? 0,
    isLeader: attachingAbility !== undefined || hasLeaderAbility(selection),
    attachableTo: attachingAbility ? parseAttachableUnits(attachingAbility.description) : [],
    attachedToUnitId: parentUnitId,
  }
}

/** Finds the unit/model stat line, skipping any nested attached leaders. */
function findUnitProfile(selection: any, excluded: any[]): Record<string, string> | null {
  for (const profile of selection.profiles ?? []) {
    if (profile?.typeName === 'Unit' || profile?.typeName === 'Model') {
      const stats: Record<string, string> = {}
      for (const char of profile.characteristics ?? []) {
        if (char?.name) stats[char.name] = char.$text
      }
      return stats
    }
  }

  for (const child of selection.selections ?? []) {
    if (excluded.includes(child)) continue
    const found = findUnitProfile(child, excluded)
    if (found) return found
  }

  return null
}

function countModels(selection: any, excluded: any[]): number {
  if (selection.type === 'model') return selection.number ?? 1

  let total = 0
  for (const child of selection.selections ?? []) {
    if (excluded.includes(child)) continue
    if (child?.type === 'model') total += child.number ?? 1
    else if (child?.type === 'unit') total += countModels(child, excluded)
  }
  return total > 0 ? total : (selection.number ?? 1)
}

function collectAbilities(selection: any, excluded: any[]): UnitAbility[] {
  const abilities: UnitAbility[] = []
  const seen = new Set<string>()

  const visit = (node: any) => {
    if (!node || excluded.includes(node)) return
    for (const profile of node.profiles ?? []) {
      if (profile?.typeName !== 'Abilities') continue
      const description = (profile.characteristics ?? [])
        .map((c: any) => c?.$text)
        .filter(Boolean)
        .join(' ')
      const name = profile.name ?? 'Ability'
      const key = `${name}::${description.slice(0, 40)}`
      if (seen.has(key)) continue
      seen.add(key)
      abilities.push({ name, description })
    }
    for (const child of node.selections ?? []) visit(child)
  }

  visit(selection)
  return abilities
}

/**
 * Collects every weapon in the unit, summing the count of duplicates. Recurses
 * to any depth but never enters a nested attached leader.
 */
function collectWeapons(
  selection: any,
  excluded: any[],
  unitName: string,
  warnings: string[]
): ParsedWeapon[] {
  const byKey = new Map<string, ParsedWeapon>()

  const visit = (node: any) => {
    if (!node || excluded.includes(node)) return

    const count = node.number ?? 1
    for (const profile of node.profiles ?? []) {
      if (!WEAPON_PROFILE_TYPES.includes(profile?.typeName)) continue
      const weapon = parseWeaponProfile(profile, count, unitName, warnings)
      if (!weapon) continue
      const key = `${weapon.name}::${weapon.type}`
      const existing = byKey.get(key)
      if (existing) existing.count += weapon.count
      else byKey.set(key, weapon)
    }

    for (const child of node.selections ?? []) visit(child)
  }

  for (const child of selection.selections ?? []) visit(child)
  return [...byKey.values()]
}

function parseWeaponProfile(
  profile: any,
  count: number,
  unitName: string,
  warnings: string[]
): ParsedWeapon | null {
  const chars: Record<string, string> = {}
  for (const char of profile.characteristics ?? []) {
    if (char?.name) chars[char.name] = char.$text
  }

  const isRanged = profile.typeName === 'Ranged Weapons'
  const name = profile.name ?? 'Unnamed weapon'
  const skillText = isRanged ? chars['BS'] : chars['WS']
  const skill = parseStatNumber(skillText)
  const strength = parseStatNumber(chars['S'])
  const ap = Math.abs(parseInt(chars['AP'] ?? '0', 10)) || 0

  // [TORRENT] weapons print 'N/A' because no hit roll is made, so that is the
  // datasheet being explicit rather than something we failed to read.
  if (skill === null && !isNotApplicable(skillText)) {
    warnings.push(
      `${unitName} — ${name}: could not read ${isRanged ? 'BS' : 'WS'}, using ${DEFAULT_SKILL}+.`
    )
  }
  if (strength === null) {
    warnings.push(`${unitName} — ${name}: could not read Strength, using ${DEFAULT_STRENGTH}.`)
  }

  return {
    name,
    type: isRanged ? 'ranged' : 'melee',
    attacks: chars['A'] ?? '1',
    skill: skill ?? DEFAULT_SKILL,
    strength: strength ?? DEFAULT_STRENGTH,
    ap,
    damage: chars['D'] ?? '1',
    keywords: parseWeaponKeywords(chars['Keywords'] ?? ''),
    count: Math.max(1, count),
    range: chars['Range'] ?? null,
  }
}

/**
 * Parses a weapon's Keywords characteristic into structured abilities.
 *
 * Handles the forms that appear in exports and datasheets:
 *   "Rapid Fire 2", "[SUSTAINED HITS 1]", "Anti-Vehicle 4+",
 *   "Lethal Hits: Vehicle" (24.01 restricts the ability to those targets).
 */
export function parseWeaponKeywords(keywordsStr: string): WeaponKeyword[] {
  if (!keywordsStr || keywordsStr.trim() === '-') return []

  return keywordsStr
    .split(',')
    .map((token) => token.trim().replace(/^\[/, '').replace(/\]$/, '').trim())
    .filter(Boolean)
    .map((token) => {
      // Optional target restriction after a colon: "Lethal Hits: Vehicle/Monster".
      const [head, restriction] = splitOnce(token, ':')
      const restrictedTo = restriction
        ? restriction
            .split('/')
            .map((k) => k.trim())
            .filter(Boolean)
        : undefined

      const keyword = parseKeywordValue(head.trim())
      return restrictedTo && restrictedTo.length > 0 ? { ...keyword, restrictedTo } : keyword
    })
}

function splitOnce(value: string, separator: string): [string, string | null] {
  const index = value.indexOf(separator)
  if (index === -1) return [value, null]
  return [value.slice(0, index), value.slice(index + 1)]
}

function parseKeywordValue(name: string): WeaponKeyword {
  // "Anti-Vehicle 4+"
  const anti = name.match(/^(anti-.+?)\s+(\d+)\+$/i)
  if (anti) return { name: anti[1], value: parseInt(anti[2], 10) }

  // "Sustained Hits 1", "Melta 2", "Scouts 6" — trailing plus signs are ignored.
  const valued = name.match(/^(.+?)\s+(\d+)\+?$/)
  if (valued) return { name: valued[1], value: parseInt(valued[2], 10) }

  return { name }
}

/**
 * Reads the unit names out of a Leader/Support ability. All three list styles
 * seen in exports are handled:
 *   "...following units: - **CRISIS BATTLESUITS** - **BROADSIDES**"
 *   "...following units:\n■ CANOPTEK WRAITHS\n■ IMMORTALS"
 *   "...following units: Canoptek Macrocytes, Immortals, Necron Warriors^^"
 */
export function parseAttachableUnits(description: string): string[] {
  if (!description) return []
  const marker = description.toLowerCase().indexOf('attached to the following')
  if (marker === -1) return []
  const scope = description.slice(marker)
  const names = new Set<string>()

  for (const match of scope.matchAll(/\*\*(.+?)\*\*/g)) {
    // Some exports bold the whole list: "**Canoptek Macrocytes, Immortals**".
    for (const part of match[1].split(',')) addName(names, part)
  }

  if (names.size === 0) {
    // Bullet, dash, newline or comma separated list without bold markers.
    for (const chunk of scope.split(/[\n\r\u25a0\u25aa\u25cf\u2022,*]+|(?: - )/).slice(1)) {
      addName(names, chunk)
    }
  }

  return [...names]
}

function addName(names: Set<string>, raw: string): void {
  const value = raw
    .replace(/\*/g, '')
    // Exports sometimes carry footnote markers such as '^^' or a trailing dot.
    .replace(/\^+/g, '')
    .replace(/[.;:~]+$/g, '')
    .trim()
  if (!value || value.length > 60) return
  names.add(value)
}

/**
 * True for abilities a Leader confers on the unit it joins rather than on itself,
 * e.g. "While this model is leading a unit, models in that unit have the Feel No
 * Pain 5+ ability."
 */
export function isConferredWhileLeading(description: string): boolean {
  if (!description) return false
  const text = description.toLowerCase()
  return (
    text.includes('while this model is leading') ||
    text.includes('while leading a unit') ||
    text.includes('models in that unit have')
  )
}

export function parseInvulnerableSave(abilities: string[]): number | null {
  for (const text of abilities) {
    const match =
      text.match(/(\d)\+\s*invulnerable save/i) ?? text.match(/invulnerable save[^.]*?(\d)\+/i)
    if (match) return parseInt(match[1], 10)
  }
  return null
}

export function parseFeelNoPain(abilities: string[]): number | null {
  for (const text of abilities) {
    const match = text.match(/Feel No Pain\s*(\d)\+/i)
    if (match) return parseInt(match[1], 10)
  }
  return null
}

/** Reads '3+', '10"', '5' as a number. Returns null when there is no number. */
function parseStatNumber(stat: string | undefined): number | null {
  if (!stat) return null
  const match = stat.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

/** Datasheets print '-' or 'N/A' when a characteristic does not apply. */
function isNotApplicable(value: string | undefined): boolean {
  if (!value) return false
  const text = value.trim().toLowerCase()
  return text === '-' || text === 'n/a' || text === 'na'
}
