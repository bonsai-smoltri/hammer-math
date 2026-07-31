import type { ParsedUnit, ParsedWeapon } from '../types/roster'

interface Props {
  unit: ParsedUnit
  selected: ParsedWeapon | null
  onSelect: (weapon: ParsedWeapon) => void
  /** Times each weapon has already been used this round, keyed by weapon name. */
  usage?: Record<string, number>
}

export function WeaponSelector({ unit, selected, onSelect, usage }: Props) {
  const ranged = unit.weapons.filter((w) => w.type === 'ranged')
  const melee = unit.weapons.filter((w) => w.type === 'melee')

  const group = (weapons: ParsedWeapon[], title: string) => (
    <div class="space-y-1">
      <span class="text-xs opacity-50 uppercase">{title}</span>
      {weapons.map((w) => (
        <WeaponButton
          key={w.name}
          weapon={w}
          isSelected={selected?.name === w.name && selected?.type === w.type}
          timesUsed={usage?.[w.name] ?? 0}
          onSelect={onSelect}
        />
      ))}
    </div>
  )

  return (
    <div>
      <label class="label text-sm">Weapon</label>
      <div class="space-y-2">
        {ranged.length > 0 && group(ranged, 'Ranged')}
        {melee.length > 0 && group(melee, 'Melee')}
      </div>
    </div>
  )
}

function WeaponButton({
  weapon,
  isSelected,
  timesUsed,
  onSelect,
}: {
  weapon: ParsedWeapon
  isSelected: boolean
  timesUsed: number
  onSelect: (w: ParsedWeapon) => void
}) {
  const keywords =
    weapon.keywords.length > 0
      ? weapon.keywords.map((k) => (k.value ? `${k.name} ${k.value}` : k.name)).join(', ')
      : null

  return (
    <button
      class={`btn btn-block justify-start text-left h-auto min-h-12 py-2 ${
        isSelected ? 'btn-primary' : 'btn-ghost border border-base-content/10'
      } ${timesUsed > 0 && !isSelected ? 'opacity-70' : ''}`}
      onClick={() => onSelect(weapon)}
    >
      <div class="w-full">
        <div class="flex justify-between items-center gap-2">
          <span class="font-medium text-sm flex items-center gap-1.5 min-w-0">
            <span class="truncate">{weapon.name}</span>
            {timesUsed > 0 && (
              <span
                class="badge badge-sm badge-warning shrink-0 font-normal"
                title="Already used this round"
              >
                used{timesUsed > 1 ? ` ×${timesUsed}` : ''}
              </span>
            )}
          </span>
          <span class="text-xs opacity-60 shrink-0">
            {weapon.attacks}A | S{weapon.strength} | AP-{weapon.ap} | D{weapon.damage}
          </span>
        </div>
        {keywords && <div class="text-xs opacity-70 mt-0.5">{keywords}</div>}
      </div>
    </button>
  )
}
