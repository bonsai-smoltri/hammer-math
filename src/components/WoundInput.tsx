import { useMemo, useState } from 'preact/hooks'
import type { ParsedWeapon } from '../types/roster'
import type { UnitWoundState } from '../types/battle'
import type { DamageAllocation, DamageResult } from '../lib/battle-state'
import {
  allocateDamage,
  averageDamage,
  isFixedDamage,
  parseDamageValue,
} from '../lib/battle-state'
import { Stepper } from './Stepper'

interface WoundInputProps {
  weapon: ParsedWeapon
  defenderWoundState: UnitWoundState
  onConfirm: (woundsDealt: number, result: DamageResult) => void
}

/**
 * Records what got through.
 *
 * Damage is entered per failed save because each failed save is allocated to one
 * model and the excess is lost (05.04) — a D6 rolling a 6 into a 2-wound model
 * kills one model, not three. Mortal wounds are entered separately since they do
 * carry on to the next model (06.02).
 */
export function WoundInput({ weapon, defenderWoundState, onConfirm }: WoundInputProps) {
  const fixedDamage = parseDamageValue(weapon.damage)
  const isFixed = isFixedDamage(weapon.damage)
  const defaultDamage = averageDamage(weapon.damage)

  const [failedSaves, setFailedSaves] = useState(0)
  const [rolls, setRolls] = useState<number[]>([])
  const [mortalWounds, setMortalWounds] = useState(0)

  const setCount = (count: number) => {
    const next = Math.max(0, count)
    setFailedSaves(next)
    setRolls((prev) => {
      const out = prev.slice(0, next)
      while (out.length < next) out.push(defaultDamage)
      return out
    })
  }

  const allocation: DamageAllocation = useMemo(
    () => ({
      failedSaves: isFixed && fixedDamage !== null ? Array(failedSaves).fill(fixedDamage) : rolls,
      mortalWounds,
    }),
    [isFixed, fixedDamage, failedSaves, rolls, mortalWounds]
  )

  const hasInput = failedSaves > 0 || mortalWounds > 0
  const damageResult = useMemo(
    () => (hasInput ? allocateDamage(defenderWoundState, allocation) : null),
    [hasInput, defenderWoundState, allocation]
  )

  const handleConfirm = () => {
    if (!damageResult || !hasInput) return
    onConfirm(damageResult.woundsLost, damageResult)
    setCount(0)
    setMortalWounds(0)
  }

  const modelsAlive = defenderWoundState.woundsRemaining.length
  const totalDamage =
    allocation.failedSaves.reduce((sum, d) => sum + d, 0) + allocation.mortalWounds

  return (
    <div class="card bg-base-200 p-4 space-y-3">
      <div class="text-sm font-medium opacity-70">Resolve Attack</div>

      {/* Failed saves */}
      <Stepper
        label="Failed saves"
        hint={isFixed ? `${weapon.damage} damage each` : undefined}
        value={failedSaves}
        onChange={setCount}
      />

      {/* Damage rolled per failed save */}
      {!isFixed && failedSaves > 0 && (
        <div>
          <div class="text-xs opacity-60 mb-1">
            Damage rolled <span class="opacity-70">({weapon.damage} each)</span>
          </div>
          <div class="flex flex-wrap gap-2">
            {rolls.map((roll, i) => (
              <Stepper
                key={i}
                compact
                label={`Damage for failed save ${i + 1}`}
                value={roll}
                min={1}
                onChange={(value) =>
                  setRolls((prev) =>
                    prev.map((existing, index) => (index === i ? value : existing))
                  )
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Mortal wounds */}
      <Stepper
        label="Mortal wounds"
        hint="Devastating Wounds, Hazardous, etc."
        value={mortalWounds}
        onChange={(value) => setMortalWounds(Math.max(0, value))}
      />

      {/* Outcome */}
      {damageResult && (
        <div class="bg-base-300 rounded-lg p-3 space-y-1">
          {damageResult.unitDestroyed ? (
            <div class="flex items-center gap-2 text-error font-bold">
              <span aria-hidden="true">💀</span>
              <span>Unit destroyed</span>
            </div>
          ) : damageResult.modelsRemoved > 0 ? (
            <div class="flex items-center gap-2 text-warning font-semibold">
              <span aria-hidden="true">⚔️</span>
              <span>
                Remove {damageResult.modelsRemoved} model
                {damageResult.modelsRemoved > 1 ? 's' : ''}
              </span>
            </div>
          ) : (
            <div class="flex items-center gap-2 text-info">
              <span aria-hidden="true">🛡️</span>
              <span>No models removed — damage absorbed</span>
            </div>
          )}

          {!damageResult.unitDestroyed && damageResult.newWoundsRemaining.length > 0 && (
            <div class="text-xs opacity-60">
              {modelsAlive - damageResult.modelsRemoved} model
              {modelsAlive - damageResult.modelsRemoved !== 1 ? 's' : ''} remaining
              {defenderWoundState.woundsPerModel > 1 && (
                <>
                  {' '}
                  — wounded model at{' '}
                  {damageResult.newWoundsRemaining.find(
                    (w) => w < defenderWoundState.woundsPerModel
                  ) ?? defenderWoundState.woundsPerModel}
                  W
                </>
              )}
            </div>
          )}

          {totalDamage > damageResult.woundsLost && (
            <div class="text-xs opacity-60">
              {totalDamage - damageResult.woundsLost} damage lost to overkill
            </div>
          )}
        </div>
      )}

      <button
        class="btn btn-primary btn-block h-12 text-base"
        disabled={!hasInput || !damageResult}
        onClick={handleConfirm}
      >
        ⚔️ Confirm Attack
      </button>
    </div>
  )
}
