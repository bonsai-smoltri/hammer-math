import { useState, useMemo } from 'preact/hooks'
import type { ParsedWeapon } from '../types/roster'
import type { UnitWoundState } from '../types/battle'
import type { DamageResult } from '../lib/battle-state'
import { calculateDamage, calculateDamageFromTotal, isFixedDamage, parseDamageValue } from '../lib/battle-state'

interface WoundInputProps {
  weapon: ParsedWeapon
  defenderWoundState: UnitWoundState
  onConfirm: (woundsDealt: number, result: DamageResult) => void
}

export function WoundInput({ weapon, defenderWoundState, onConfirm }: WoundInputProps) {
  const [wounds, setWounds] = useState(0)

  const fixedDamage = parseDamageValue(weapon.damage)
  const isFixed = isFixedDamage(weapon.damage)

  const damageResult: DamageResult | null = useMemo(() => {
    if (wounds <= 0) return null
    if (isFixed && fixedDamage !== null) {
      // User enters number of failed saves, we calculate total wounds
      return calculateDamage(defenderWoundState, wounds * fixedDamage, fixedDamage)
    } else {
      // User enters total wounds dealt
      return calculateDamageFromTotal(defenderWoundState, wounds)
    }
  }, [wounds, defenderWoundState, isFixed, fixedDamage])

  const handleConfirm = () => {
    if (!damageResult || wounds <= 0) return
    const totalWounds = isFixed && fixedDamage ? wounds * fixedDamage : wounds
    onConfirm(totalWounds, damageResult)
    setWounds(0)
  }

  const inputLabel = isFixed
    ? 'Failed saves'
    : `Wounds dealt (${weapon.damage} per hit)`

  const modelsAlive = defenderWoundState.woundsRemaining.length

  return (
    <div class="card bg-base-200 p-4 space-y-3">
      <div class="text-sm font-medium opacity-70">Resolve Attack</div>

      {/* Input */}
      <div class="flex items-center gap-3">
        <label class="text-sm flex-1">{inputLabel}</label>
        <div class="flex items-center gap-1">
          <button
            class="btn btn-sm btn-circle btn-ghost"
            onClick={() => setWounds(Math.max(0, wounds - 1))}
            disabled={wounds <= 0}
          >
            −
          </button>
          <input
            type="number"
            class="input input-sm input-bordered w-16 text-center"
            value={wounds}
            min={0}
            onInput={(e) => setWounds(Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0))}
          />
          <button
            class="btn btn-sm btn-circle btn-ghost"
            onClick={() => setWounds(wounds + 1)}
          >
            +
          </button>
        </div>
      </div>

      {/* Recommendation */}
      {damageResult && wounds > 0 && (
        <div class="bg-base-300 rounded-lg p-3 space-y-1">
          {damageResult.unitDestroyed ? (
            <div class="flex items-center gap-2 text-error font-bold">
              <span>💀</span>
              <span>Unit destroyed</span>
            </div>
          ) : damageResult.modelsRemoved > 0 ? (
            <div class="flex items-center gap-2 text-warning font-semibold">
              <span>⚔️</span>
              <span>Remove {damageResult.modelsRemoved} model{damageResult.modelsRemoved > 1 ? 's' : ''}</span>
            </div>
          ) : (
            <div class="flex items-center gap-2 text-info">
              <span>🛡️</span>
              <span>No models removed — wounds absorbed</span>
            </div>
          )}

          {!damageResult.unitDestroyed && damageResult.newWoundsRemaining.length > 0 && (
            <div class="text-xs opacity-60">
              {modelsAlive - damageResult.modelsRemoved} model{modelsAlive - damageResult.modelsRemoved !== 1 ? 's' : ''} remaining
              {defenderWoundState.woundsPerModel > 1 && (
                <> — wounded model at {damageResult.newWoundsRemaining.find(w => w < defenderWoundState.woundsPerModel) ?? defenderWoundState.woundsPerModel}W</>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirm button */}
      <button
        class="btn btn-primary btn-block"
        disabled={wounds <= 0 || !damageResult}
        onClick={handleConfirm}
      >
        ⚔️ Confirm Attack
      </button>
    </div>
  )
}
