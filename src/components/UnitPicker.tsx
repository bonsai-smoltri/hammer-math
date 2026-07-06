import type { ParsedRoster, ParsedUnit } from '../types/roster'
import type { UnitWoundState } from '../types/battle'

interface Props {
  roster: ParsedRoster
  onSelect: (unit: ParsedUnit) => void
  unitWounds?: Record<string, UnitWoundState>
  recommendedUnitId?: string | null
}

export function UnitPicker({ roster, onSelect, unitWounds, recommendedUnitId }: Props) {
  const sorted = [...roster.units].sort((a, b) => {
    // Put recommended unit first
    if (a.id === recommendedUnitId) return -1
    if (b.id === recommendedUnitId) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div class="border-b border-base-content/10 flex-1 overflow-y-auto">
      {sorted.map((unit) => {
        const woundState = unitWounds?.[unit.id]
        const isDead = woundState?.isDead ?? false
        const isRecommended = unit.id === recommendedUnitId

        return (
          <button
            key={unit.id}
            class={`btn btn-ghost btn-block justify-start rounded-none text-sm h-auto py-3 border-b border-base-content/5 ${
              isDead ? 'opacity-50' : ''
            } ${isRecommended ? 'bg-base-200' : ''}`}
            onClick={() => onSelect(unit)}
          >
            {isDead && <span class="mr-1">💀</span>}
            {isRecommended && !isDead && <span class="mr-1">⚔️</span>}
            <span class={isDead ? 'line-through' : ''}>{unit.name}</span>
            {isRecommended && !isDead && (
              <span class="ml-auto badge badge-sm badge-primary">Best target</span>
            )}
            {!isRecommended && woundState && !isDead && woundState.woundsPerModel === 1 && woundState.woundsRemaining.length < (roster.units.find(u => u.id === unit.id)?.modelCount ?? 0) && (
              <span class="ml-auto text-xs opacity-50">
                {woundState.woundsRemaining.length}/{roster.units.find(u => u.id === unit.id)!.modelCount}
              </span>
            )}
            {!isRecommended && woundState && !isDead && woundState.woundsPerModel > 1 && woundState.woundsRemaining.some(w => w < woundState.woundsPerModel) && (
              <span class="ml-auto text-xs opacity-50">
                {woundState.woundsRemaining.length} models
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
