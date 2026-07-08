import { useState } from 'preact/hooks'
import type { ParsedUnit, ParsedWeapon } from '../types/roster'
import { calculateAttack, estimateWounds, type CombatOptions } from '../lib/combat-math'

interface Props {
  attacker: ParsedUnit
  weapon: ParsedWeapon
  defender: ParsedUnit
}

export function AttackSummary({ attacker, weapon, defender }: Props) {
  const [options, setOptions] = useState<CombatOptions>({
    inHalfRange: false,
    remainedStationary: false,
    targetInCover: false,
    advanced: false,
    charged: false,
    indirectFiring: false,
    spotterAvailable: false,
  })

  const result = calculateAttack(attacker, weapon, defender, options)
  const estimated = estimateWounds(attacker, weapon, defender, options)

  // Determine which toggles to show
  const hasRapidFire = hasKw(weapon, 'Rapid Fire')
  const hasMelta = hasKw(weapon, 'Melta')
  const hasHeavy = hasKw(weapon, 'Heavy')
  const hasAssault = hasKw(weapon, 'Assault')
  const hasLance = hasKw(weapon, 'Lance')
  const hasIndirect = hasKw(weapon, 'Indirect Fire')
  const showHalfRange = hasRapidFire || hasMelta
  const isRanged = weapon.type === 'ranged'

  return (
    <div class="card bg-base-200">
      <div class="card-body p-4">
        <h2 class="card-title text-sm opacity-70">
          {attacker.name} → {defender.name}
        </h2>

        {/* Option Buttons */}
        <div class="flex flex-wrap gap-2 mb-2">
          {showHalfRange && (
            <OptionButton
              label="Half Range"
              active={options.inHalfRange}
              onClick={() => setOptions({ ...options, inHalfRange: !options.inHalfRange })}
            />
          )}
          {hasHeavy && (
            <OptionButton
              label="Heavy"
              active={options.remainedStationary}
              onClick={() => setOptions({ ...options, remainedStationary: !options.remainedStationary })}
            />
          )}
          {hasAssault && (
            <OptionButton
              label="Assault"
              active={options.advanced}
              onClick={() => setOptions({ ...options, advanced: !options.advanced })}
            />
          )}
          
          {hasLance && (
            <OptionButton
              label="Lance"
              active={options.charged}
              onClick={() => setOptions({ ...options, charged: !options.charged })}
            />
          )}

          {isRanged && (
            <OptionButton
              label="Cover"
              active={options.targetInCover}
              onClick={() => setOptions({ ...options, targetInCover: !options.targetInCover })}
              variant="warning"
            />
          )}

          {hasIndirect && (
            <OptionButton
              label="Indirect"
              active={options.indirectFiring}
              onClick={() => setOptions({ ...options, indirectFiring: !options.indirectFiring })}
              variant="warning"
            />
          )}
          {hasIndirect && options.indirectFiring && (
            <>
              <OptionButton
                label="Stationary"
                active={options.remainedStationary}
                onClick={() => setOptions({ ...options, remainedStationary: !options.remainedStationary })}
              />
              <OptionButton
                label="Spotter"
                active={options.spotterAvailable}
                onClick={() => setOptions({ ...options, spotterAvailable: !options.spotterAvailable })}
              />
            </>
          )}
        </div>

        {/* Attack Summary Output */}
        <div class="space-y-2 font-mono text-sm">
          <SummaryLine icon="🎲" text={result.numberOfDice} />

          {result.autoHit ? (
            <SummaryLine icon="🎯" text="Auto-hit (Torrent)" />
          ) : (
            <SummaryLine
              icon="🎯"
              text={buildHitLine(result)}
            />
          )}

          <SummaryLine
            icon="💀"
            text={buildWoundLine(result)}
          />

          <SummaryLine icon="🛡️" text={result.saveDisplay} />

          <SummaryLine icon="💥" text={`${result.weaponDamage} damage per unsaved wound`} />

          {result.feelNoPainDisplay && (
            <SummaryLine icon="❤️‍🩹" text={result.feelNoPainDisplay} />
          )}

          <div class="border-t border-base-content/10 pt-2 mt-2">
            <SummaryLine icon="📊" text={`~${estimated.toFixed(1)} estimated wounds`} />
          </div>

          {result.notes.length > 0 && (
            <div class="border-t border-base-content/10 pt-2 mt-2">
              {result.notes.map((note, i) => (
                <SummaryLine key={i} icon="ℹ️" text={note} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function OptionButton({
  label,
  active,
  onClick,
  variant = 'primary',
}: {
  label: string
  active: boolean
  onClick: () => void
  variant?: 'primary' | 'warning'
}) {
  const activeClass = variant === 'warning' ? 'btn-warning' : 'btn-primary'
  return (
    <button
      class={`btn btn-xs ${active ? activeClass : 'btn-ghost border border-base-content/20'}`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function SummaryLine({ icon, text }: { icon: string; text: string }) {
  return (
    <div class="flex items-start gap-2">
      <span class="shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  )
}

function buildHitLine(result: ReturnType<typeof calculateAttack>): string {
  if (result.hitOverrideNote) {
    let line = result.hitOverrideNote
    if (result.cannotRerollHits) line += ' (cannot re-roll)'
    if (result.critHitEffects.length > 0) {
      line += ', ' + result.critHitEffects.join(', ')
    }
    return line
  }

  let line = `Hitting on ${result.hitThreshold}+`
  if (result.hitModifierNote) line += ` (${result.hitModifierNote})`
  if (result.critHitEffects.length > 0) {
    line += ', ' + result.critHitEffects.join(', ')
  }
  return line
}

function buildWoundLine(result: ReturnType<typeof calculateAttack>): string {
  let line = `Wounding on ${result.woundThreshold}+`
  if (result.woundModifierNote) line += ` (${result.woundModifierNote})`
  if (result.critWoundEffects.length > 0) {
    line += ', ' + result.critWoundEffects.join(', ')
  }
  if (result.rerollWounds) {
    line += ' (re-roll wounds, Twin-linked)'
  }
  return line
}

function hasKw(weapon: ParsedWeapon, keyword: string): boolean {
  return weapon.keywords.some((k) => k.name.toLowerCase() === keyword.toLowerCase())
}
