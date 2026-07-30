import type { ParsedUnit, ParsedWeapon, WeaponKeyword } from '../../types/roster'
import type { KeywordAttachment, RuleDefinition } from '../../types/rules'

/** Test fixtures. */

export function weapon(overrides: Partial<ParsedWeapon> = {}): ParsedWeapon {
  return {
    name: 'Boltgun',
    type: 'ranged',
    attacks: '2',
    skill: 3,
    strength: 4,
    ap: 0,
    damage: '1',
    keywords: [],
    count: 1,
    range: '24"',
    ...overrides,
  } as ParsedWeapon
}

export function kw(name: string, value?: number, restrictedTo?: string[]): WeaponKeyword {
  const out: WeaponKeyword = { name }
  if (value !== undefined) out.value = value
  if (restrictedTo) out.restrictedTo = restrictedTo
  return out
}

export function unit(overrides: Partial<ParsedUnit> = {}): ParsedUnit {
  return {
    id: 'unit-1',
    name: 'Test Unit',
    modelCount: 5,
    toughness: 4,
    save: 3,
    wounds: 2,
    invulnerableSave: null,
    feelNoPain: null,
    move: '6"',
    leadership: '6+',
    objectiveControl: 2,
    weapons: [],
    keywords: ['Infantry'],
    abilities: [],
    points: 100,
    isLeader: false,
    attachableTo: [],
    attachedToUnitId: null,
    ...overrides,
  } as ParsedUnit
}

export function rule(overrides: Partial<RuleDefinition> = {}): RuleDefinition {
  return {
    id: 'custom-1',
    name: 'Test Rule',
    source: 'custom',
    side: 'attacker',
    target: { type: 'global' },
    effects: {},
    ...overrides,
  }
}

export function attachment(overrides: Partial<KeywordAttachment> = {}): KeywordAttachment {
  return {
    id: 'att-1',
    name: 'Test Attachment',
    keywords: [],
    ruleIds: [],
    unitIds: [],
    sourceUnitId: null,
    enabled: true,
    ...overrides,
  }
}
