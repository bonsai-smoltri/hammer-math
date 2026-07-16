import { useState } from 'preact/hooks'
import type { UnitWoundState } from '../types/battle'

interface Props {
  unitWoundState: UnitWoundState
  originalModelCount: number
  onCommit: (woundsRestored: number) => void
}

export function HealUnit({ unitWoundState, originalModelCount, onCommit }: Props) {
  const [woundsToRestore, setWoundsToRestore] = useState(0)

  const currentModels = unitWoundState.woundsRemaining.length
  const woundsPerModel = unitWoundState.woundsPerModel

  // Total wounds missing: wounded models + dead models at full wounds each
  const deadModels = originalModelCount - currentModels
  const woundsMissingOnAlive = unitWoundState.woundsRemaining.reduce(
    (sum, w) => sum + (woundsPerModel - w), 0
  )
  const totalWoundsMissing = woundsMissingOnAlive + (deadModels * woundsPerModel)

  const currentWounds = unitWoundState.woundsRemaining.reduce((sum, w) => sum + w, 0)
  const maxWounds = originalModelCount * woundsPerModel

  const handleCommit = () => {
    if (woundsToRestore <= 0) return
    onCommit(woundsToRestore)
    setWoundsToRestore(0)
  }

  // Nothing to heal
  if (totalWoundsMissing === 0) {
    return (
      <div class="card bg-base-200 p-3">
        <div class="text-xs opacity-50 text-center">Unit at full strength</div>
      </div>
    )
  }

  return (
    <div class="card bg-base-200 p-4 space-y-3">
      <div class="text-sm font-medium opacity-70">Heal / Restore</div>

      {/* Current health summary */}
      <div class="text-xs opacity-60">
        {currentModels}/{originalModelCount} models
        {woundsPerModel > 1 && ` — ${currentWounds}/${maxWounds} wounds`}
      </div>

      {/* Wounds to restore */}
      <div class="flex items-center justify-between">
        <span class="text-sm">Wounds to restore</span>
        <div class="flex items-center gap-2">
          <button
            class="btn btn-ghost btn-xs btn-circle"
            onClick={() => setWoundsToRestore(Math.max(0, woundsToRestore - 1))}
            disabled={woundsToRestore <= 0}
          >
            −
          </button>
          <span class="text-sm font-mono w-8 text-center">
            {woundsToRestore}
          </span>
          <button
            class="btn btn-ghost btn-xs btn-circle"
            onClick={() => setWoundsToRestore(Math.min(totalWoundsMissing, woundsToRestore + 1))}
            disabled={woundsToRestore >= totalWoundsMissing}
          >
            +
          </button>
        </div>
      </div>

      {/* Commit button */}
      <button
        class="btn btn-success btn-block btn-sm"
        onClick={handleCommit}
        disabled={woundsToRestore <= 0}
      >
        Commit Heal {woundsToRestore > 0 && (
          <span class="opacity-70">
            (+{woundsToRestore} wound{woundsToRestore > 1 ? 's' : ''})
          </span>
        )}
      </button>
    </div>
  )
}
