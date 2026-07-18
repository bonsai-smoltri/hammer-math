/** Effects a custom rule can apply to the combat math */
export interface RuleEffects {
  hitModifier?: number          // +1 or -1 to hit
  woundModifier?: number        // +1 or -1 to wound
  ignoresCover?: boolean        // target cannot benefit from cover
  apModifier?: number           // modify AP (positive = better for attacker, negative = worse)
  rerollHits?: boolean          // re-roll hit rolls
  rerollWounds?: boolean        // re-roll wound rolls
  feelNoPain?: number           // grants FNP X+ (defender rule)
  invulnOverride?: number       // grants invuln X+ (defender rule)
  bonusDamage?: number          // +X damage per wound
  critHitOn?: number            // critical hits on X+ instead of 6
  critWoundOn?: number          // critical wounds on X+ instead of 6
  sustainedHits?: number        // grants Sustained Hits X
  lethalHits?: boolean          // grants Lethal Hits
  saveModifier?: number         // modify save (positive = worse for attacker)
}

/** What the rule targets */
export interface RuleTarget {
  type: 'global' | 'faction' | 'unit'
  factionKeyword?: string       // e.g. "T'au Empire", "Adeptus Astartes"
  unitIds?: string[]            // multi-select from loaded rosters
}

/** A user-defined custom rule */
export interface CustomRule {
  id: string
  name: string
  appliesTo: 'attacker' | 'defender' | 'both'
  target: RuleTarget
  effects: RuleEffects
  description?: string
  enabled: boolean
}
