import type { ParsedRoster, ParsedUnit } from '../types/roster'
import type { UnitWoundState } from '../types/battle'

interface Props {
  roster: ParsedRoster
  onSelect: (unit: ParsedUnit) => void
  unitWounds?: Record<string, UnitWoundState>
}

export function UnitPicker({ roster, onSelect, unitWounds }: Props) {
  const sorted = [...roster.units].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div class="border-b border-base-content/10 flex-1 overflow-y-auto">
      {sorted.map((unit) => {
        const woundState = unitWounds?.[unit.id]
        const isDead = woundState?.isDead ?? false
        return (
          <button
            key={unit.id}
            class={`btn btn-ghost btn-block justify-start rounded-none text-sm h-auto py-3 border-b border-base-content/5 ${
              isDead ? 'opacity-50' : ''
            }`}
            onClick={() => onSelect(unit)}
          >
            {isDead && <span class="mr-1">💀</span>}
            <span class={isDead ? 'line-through' : ''}>{unit.name}</span>
            {woundState && !isDead && woundState.woundsPerModel === 1 && woundState.woundsRemaining.length < (roster.units.find(u => u.id === unit.id)?.modelCount ?? 0) && (
              <span class="ml-auto text-xs opacity-50">
                {woundState.woundsRemaining.length}/{roster.units.find(u => u.id === unit.id)!.modelCount}
              </span>
            )}
            {woundState && !isDead && woundState.woundsPerModel > 1 && woundState.woundsRemaining.some(w => w < woundState.woundsPerModel) && (
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
