import type { ParsedRoster, ParsedUnit, ParsedWeapon, WeaponKeyword } from '../types/roster'

export function parseRoster(json: any): ParsedRoster {
  const roster = json.roster ?? json

  const name = roster.name ?? 'Unknown Army'
  const points = roster.costs?.[0]?.value ?? 0

  const units: ParsedUnit[] = []

  for (const force of roster.forces ?? []) {
    for (const selection of force.selections ?? []) {
      const parsed = parseSelection(selection)
      if (parsed) {
        units.push(parsed)
      }
    }
  }

  return { name, points, units }
}

function parseSelection(selection: any): ParsedUnit | null {
  // Skip configuration entries (Battle Size, Detachment, Show/Hide Options)
  const categories = selection.categories ?? []
  const isConfig = categories.some((c: any) => c.name === 'Configuration')
  if (isConfig) return null

  // Must be a unit or model type
  if (selection.type !== 'unit' && selection.type !== 'model') return null

  const id = selection.id
  const name = selection.name
  const points = selection.costs?.[0]?.value ?? 0

  // Extract unit profile (T, Sv, W)
  const unitProfile = findUnitProfile(selection)
  if (!unitProfile) return null

  const toughness = parseStatNumber(unitProfile.T)
  const save = parseStatNumber(unitProfile.Sv)
  const wounds = parseStatNumber(unitProfile.W)

  // Extract model count
  const modelCount = getModelCount(selection)

  // Extract invulnerable save directly from profile if available
  const profileInvuln = parseInvulnFromProfile(unitProfile.InSv)

  // Extract abilities for FNP and fallback invuln detection
  const abilities = collectAbilityTexts(selection)
  const invulnerableSave = profileInvuln ?? parseInvulnerableSave(abilities)
  const feelNoPain = parseFeelNoPain(abilities)

  // Extract weapons
  const weapons = collectWeapons(selection)

  // Extract keywords from categories
  const keywords = categories.map((c: any) => c.name)

  return {
    id,
    name,
    modelCount,
    toughness,
    save,
    wounds,
    invulnerableSave,
    feelNoPain,
    weapons,
    keywords,
    points,
  }
}

function findUnitProfile(selection: any): Record<string, string> | null {
  // Look for a profile with typeName "Unit" or "Model"
  for (const profile of selection.profiles ?? []) {
    if (profile.typeName === 'Unit' || profile.typeName === 'Model') {
      const stats: Record<string, string> = {}
      for (const char of profile.characteristics ?? []) {
        stats[char.name] = char.$text
      }
      return stats
    }
  }

  // Check nested selections (for units that contain model sub-selections)
  for (const sub of selection.selections ?? []) {
    const found = findUnitProfile(sub)
    if (found) return found
  }

  return null
}

function getModelCount(selection: any): number {
  // For "unit" type, sum all model sub-selections
  if (selection.type === 'unit') {
    let total = 0
    for (const sub of selection.selections ?? []) {
      if (sub.type === 'model') {
        total += sub.number ?? 1
      }
    }
    if (total > 0) return total
  }
  return selection.number ?? 1
}

function collectAbilityTexts(selection: any): string[] {
  const texts: string[] = []

  for (const profile of selection.profiles ?? []) {
    if (profile.typeName === 'Abilities') {
      for (const char of profile.characteristics ?? []) {
        if (char.$text) texts.push(char.$text)
      }
    }
  }

  for (const sub of selection.selections ?? []) {
    texts.push(...collectAbilityTexts(sub))
  }

  return texts
}

function parseInvulnFromProfile(invulnStr: string | undefined): number | null {
  if (!invulnStr || invulnStr === '-' || invulnStr === 'N/A') return null
  const match = invulnStr.match(/(\d+)/)
  return match ? parseInt(match[1]) : null
}

function parseInvulnerableSave(abilities: string[]): number | null {
  for (const text of abilities) {
    // Match patterns like "4+ invulnerable save" or "invulnerable save of 4+"
    const match = text.match(/(\d)\+\s*invulnerable save/i)
      ?? text.match(/invulnerable save[^.]*?(\d)\+/i)
    if (match) {
      return parseInt(match[1])
    }
  }
  return null
}

function parseFeelNoPain(abilities: string[]): number | null {
  for (const text of abilities) {
    const match = text.match(/Feel No Pain\s*(\d)\+/i)
    if (match) {
      return parseInt(match[1])
    }
  }
  return null
}

function collectWeapons(selection: any): ParsedWeapon[] {
  const weapons: ParsedWeapon[] = []

  for (const sub of selection.selections ?? []) {
    // Check if this sub-selection has weapon profiles
    for (const profile of sub.profiles ?? []) {
      if (profile.typeName === 'Ranged Weapons' || profile.typeName === 'Melee Weapons') {
        const weapon = parseWeaponProfile(profile)
        if (weapon) weapons.push(weapon)
      }
    }

    // Also check nested selections (model -> weapon)
    for (const nested of sub.selections ?? []) {
      for (const profile of nested.profiles ?? []) {
        if (profile.typeName === 'Ranged Weapons' || profile.typeName === 'Melee Weapons') {
          const weapon = parseWeaponProfile(profile)
          if (weapon) weapons.push(weapon)
        }
      }

      // One more level deep for model -> weapon group -> weapon
      for (const deep of nested.selections ?? []) {
        for (const profile of deep.profiles ?? []) {
          if (profile.typeName === 'Ranged Weapons' || profile.typeName === 'Melee Weapons') {
            const weapon = parseWeaponProfile(profile)
            if (weapon) weapons.push(weapon)
          }
        }
      }
    }
  }

  // Deduplicate weapons by name + type (ranged/melee can share a name)
  const seen = new Set<string>()
  return weapons.filter((w) => {
    const key = `${w.name}::${w.type}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function parseWeaponProfile(profile: any): ParsedWeapon | null {
  const chars: Record<string, string> = {}
  for (const char of profile.characteristics ?? []) {
    chars[char.name] = char.$text
  }

  const isRanged = profile.typeName === 'Ranged Weapons'
  const type = isRanged ? 'ranged' : 'melee'

  const skillStr = isRanged ? chars['BS'] : chars['WS']
  const skill = parseStatNumber(skillStr)

  const apStr = chars['AP'] ?? '0'
  const ap = Math.abs(parseInt(apStr)) || 0

  const keywordsStr = chars['Keywords'] ?? ''
  const keywords = parseWeaponKeywords(keywordsStr)

  return {
    name: profile.name,
    type,
    attacks: chars['A'] ?? '1',
    skill,
    strength: parseInt(chars['S']) || 4,
    ap,
    damage: chars['D'] ?? '1',
    keywords,
  }
}

function parseWeaponKeywords(keywordsStr: string): WeaponKeyword[] {
  if (!keywordsStr || keywordsStr === '-') return []

  return keywordsStr.split(',').map((k) => {
    const trimmed = k.trim()
    // Match Anti-X Y+ format like "Anti-Vehicle 4+"
    const antiMatch = trimmed.match(/^(Anti-.+?)\s+(\d+)\+$/)
    if (antiMatch) {
      return { name: antiMatch[1], value: parseInt(antiMatch[2]) }
    }
    // Match keywords with a value like "Rapid Fire 2", "Sustained Hits 1", "Melta 2"
    const match = trimmed.match(/^(.+?)\s+(\d+)$/)
    if (match) {
      return { name: match[1], value: parseInt(match[2]) }
    }
    return { name: trimmed }
  })
}

function parseStatNumber(stat: string | undefined): number {
  if (!stat) return 4
  // Handle "3+", "4+", etc.
  const match = stat.match(/(\d+)/)
  return match ? parseInt(match[1]) : 4
}
