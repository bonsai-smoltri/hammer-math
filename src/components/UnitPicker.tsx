import type { ParsedRoster, ParsedUnit } from '../types/roster'

interface Props {
  roster: ParsedRoster
  onSelect: (unit: ParsedUnit) => void
}

export function UnitPicker({ roster, onSelect }: Props) {
  const sorted = [...roster.units].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div class="border-b border-base-content/10 flex-1 overflow-y-auto">
      {sorted.map((unit) => (
        <button
          key={unit.id}
          class="btn btn-ghost btn-block justify-start rounded-none text-sm h-auto py-3 border-b border-base-content/5"
          onClick={() => onSelect(unit)}
        >
          {unit.name}
        </button>
      ))}
    </div>
  )
}
