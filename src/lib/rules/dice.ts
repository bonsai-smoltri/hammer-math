import type { DiceExpr } from '../../types/rules'

/**
 * Dice expression helpers.
 *
 * 40k characteristics are frequently variable ("D6+1", "2D3"), so expressions
 * are kept as strings for display and only reduced to an average when the
 * engine needs a number.
 */

export interface ParsedDice {
  count: number
  sides: number
  flat: number
}

/** Parses '2D6+1', 'D3', '4', '-1' into dice components. Returns null if unparseable. */
export function parseDiceExpression(expr: DiceExpr): ParsedDice | null {
  if (typeof expr === 'number') {
    return Number.isFinite(expr) ? { count: 0, sides: 0, flat: expr } : null
  }
  const cleaned = String(expr).trim().toUpperCase().replace(/\s+/g, '')
  if (!cleaned) return null

  const dice = cleaned.match(/^([+-]?\d*)D(\d+)([+-]\d+)?$/)
  if (dice) {
    const rawCount = dice[1]
    let count = 1
    if (rawCount === '-') count = -1
    else if (rawCount && rawCount !== '+') count = parseInt(rawCount, 10)
    return { count, sides: parseInt(dice[2], 10), flat: dice[3] ? parseInt(dice[3], 10) : 0 }
  }

  const flat = cleaned.match(/^[+-]?\d+$/)
  if (flat) return { count: 0, sides: 0, flat: parseInt(cleaned, 10) }

  return null
}

/** Average value of an expression. Returns null when it cannot be parsed. */
export function averageDice(expr: DiceExpr): number | null {
  const parsed = parseDiceExpression(expr)
  if (!parsed) return null
  return parsed.count * ((parsed.sides + 1) / 2) + parsed.flat
}

/** Average value with a fallback, for places that must produce a number. */
export function averageDiceOr(expr: DiceExpr | undefined, fallback: number): number {
  if (expr === undefined || expr === null || expr === '') return fallback
  const avg = averageDice(expr)
  return avg === null ? fallback : avg
}

/** True when the expression is a plain integer (no dice). */
export function isFixedExpression(expr: DiceExpr): boolean {
  const parsed = parseDiceExpression(expr)
  return parsed !== null && parsed.count === 0
}

/** Adds a flat modifier to an expression, keeping dice notation intact. */
export function addToExpression(expr: DiceExpr, modifier: number): string {
  const parsed = parseDiceExpression(expr)
  if (!parsed) return modifier === 0 ? String(expr) : `${expr}${modifier > 0 ? '+' : ''}${modifier}`
  const flat = parsed.flat + modifier
  if (parsed.count === 0) return String(flat)
  const base = `${parsed.count === 1 ? '' : parsed.count}D${parsed.sides}`
  if (flat === 0) return base
  return `${base}${flat > 0 ? '+' : ''}${flat}`
}

/** Halves an expression's average, rounding up, per 'halve the D characteristic'. */
export function halveRoundingUp(value: number): number {
  return Math.ceil(value / 2)
}
