export interface ParsedWeapon {
  name: string
  type: 'ranged' | 'melee'
  attacks: string // Can be "D6+1" etc., so string
  skill: number // BS or WS as a number (e.g., 3 for 3+)
  strength: number
  ap: number // Stored as positive (e.g., 2 for AP -2)
  damage: string // Can be "D3" etc.
  keywords: WeaponKeyword[]
  /**
   * How many of this weapon the unit has. Attack dice are gathered per weapon
   * (04.02), so this — not the model count — is the attack multiplier. A lone
   * Shas'vre with twin fusion blasters has count 2; five Shas'ui with one each
   * have count 5.
   */
  count: number
  range: string | null
}

export interface WeaponKeyword {
  name: string
  value?: number // e.g., Sustained Hits 2, Rapid Fire 1
  /**
   * Target keywords the ability is restricted to (24.01), e.g.
   * `[LETHAL HITS: VEHICLE]` parses to { name: 'Lethal Hits', restrictedTo: ['VEHICLE'] }.
   */
  restrictedTo?: string[]
}

export interface UnitAbility {
  name: string
  description: string
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
  move: string | null // e.g., '10"'
  leadership: string | null // e.g., '6+'
  objectiveControl: number | null
  weapons: ParsedWeapon[]
  keywords: string[]
  abilities: UnitAbility[]
  points: number
  /** Has a Leader or Support ability, so it can join another unit (19, 24.22, 24.34). */
  isLeader: boolean
  /** Unit names this Leader/Support model can attach to, read from that ability. */
  attachableTo: string[]
  /** Set when the roster nests this Leader inside a bodyguard unit. */
  attachedToUnitId: string | null
}

/** A Leader/bodyguard pairing. */
export interface ParsedAttachment {
  leaderUnitId: string
  leaderName: string
  bodyguardUnitId: string
  bodyguardName: string
  /**
   * 'nested' pairings are marked as attached by the roster itself and can be
   * applied directly. 'name-match' pairings only come from a Leader/Support
   * ability's "can be attached to" list, which says what is *allowed*, not what
   * the player actually did — those are offered as suggestions and never applied
   * automatically.
   */
  source: 'nested' | 'name-match'
}

export interface ParsedRoster {
  name: string
  points: number
  units: ParsedUnit[]
  /** Attachments the roster explicitly marks (a leader nested in its unit). */
  attachments: ParsedAttachment[]
  /**
   * Pairings the Leader/Support abilities say are *possible*. Offered as
   * one-tap suggestions; never applied on their own.
   */
  attachmentCandidates: ParsedAttachment[]
  /** Anything the parser had to guess at, surfaced to the user. */
  warnings: string[]
}
