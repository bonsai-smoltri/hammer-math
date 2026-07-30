import type { RuleDefinition, RuleSide, RuleSource, RuleTarget } from '../../types/rules'

/**
 * Validation for rule definitions coming from outside the app — an imported
 * shared rules file, or whatever is sitting in localStorage. Anything that does
 * not look like a rule is dropped rather than allowed to break the engine.
 */

const VALID_SIDES: RuleSide[] = ['attacker', 'defender', 'both']

const VALID_SOURCES: RuleSource[] = [
  'weapon-ability',
  'core-ability',
  'stratagem',
  'army-rule',
  'detachment',
  'enhancement',
  'custom',
]

export function isRuleDefinition(value: unknown): value is RuleDefinition {
  if (!value || typeof value !== 'object') return false
  const rule = value as Record<string, unknown>
  return (
    typeof rule.id === 'string' &&
    typeof rule.name === 'string' &&
    VALID_SIDES.includes(rule.side as RuleSide) &&
    (rule.source === undefined || VALID_SOURCES.includes(rule.source as RuleSource)) &&
    typeof rule.effects === 'object' &&
    rule.effects !== null
  )
}

/** Keeps a target selector to the shape the engine expects. */
export function sanitizeTarget(raw: unknown): RuleTarget {
  if (!raw || typeof raw !== 'object') return { type: 'global' }
  const target = raw as Record<string, unknown>

  if (target.type === 'keyword') {
    return {
      type: 'keyword',
      keywords: asStringArray(target.keywords),
      keywordMatch: target.keywordMatch === 'all' ? 'all' : 'any',
    }
  }

  if (target.type === 'unit') {
    return { type: 'unit', unitIds: asStringArray(target.unitIds) }
  }

  return { type: 'global' }
}

/** Filters an unknown array down to usable rules. */
export function parseRuleDefinitions(input: unknown): RuleDefinition[] {
  if (!Array.isArray(input)) return []
  return input.filter(isRuleDefinition).map((rule) => ({
    ...rule,
    source: rule.source ?? 'custom',
    target: sanitizeTarget(rule.target),
    // Library rules are code, never data: an imported rule is always the user's.
    builtIn: false,
  }))
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}
