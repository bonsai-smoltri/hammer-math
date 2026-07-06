export interface ParsedWeapon {
  name: string
  type: 'ranged' | 'melee'
  attacks: string // Can be "D6+1" etc., so string
  skill: number // BS or WS as a number (e.g., 3 for 3+)
  strength: number
  ap: number // Stored as positive (e.g., 2 for AP -2)
  damage: string // Can be "D3" etc.
  keywords: WeaponKeyword[]
}

export interface WeaponKeyword {
  name: string
  value?: number // e.g., Sustained Hits 2, Rapid Fire 1
}

export interface ParsedUnit {
  id: string
  name: string
  modelCount: number
  toughness: number
  save: number // e.g., 3 for 3+
  wounds: number // wounds per model
  invulnerableSave: number | null // e.g., 4 for 4+, null if none
  feelNoPain: number | null // e.g., 5 for 5+, null if none
  weapons: ParsedWeapon[]
  keywords: string[]
  points: number
}

export interface ParsedRoster {
  name: string
  points: number
  units: ParsedUnit[]
}
