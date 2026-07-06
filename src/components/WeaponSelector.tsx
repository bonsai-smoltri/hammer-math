import type { ParsedUnit, ParsedWeapon } from '../types/roster'

interface Props {
  unit: ParsedUnit
  selected: ParsedWeapon | null
  onSelect: (weapon: ParsedWeapon) => void
}

export function WeaponSelector({ unit, selected, onSelect }: Props) {
  const ranged = unit.weapons.filter((w) => w.type === 'ranged')
  const melee = unit.weapons.filter((w) => w.type === 'melee')

  return (
    <div>
      <label class="label text-sm">Weapon</label>
      <div class="space-y-2">
        {ranged.length > 0 && (
          <div class="space-y-1">
            <span class="text-xs opacity-50 uppercase">Ranged</span>
            {ranged.map((w) => (
              <WeaponButton
                key={w.name}
                weapon={w}
                isSelected={selected?.name === w.name && selected?.type === w.type}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
        {melee.length > 0 && (
          <div class="space-y-1">
            <span class="text-xs opacity-50 uppercase">Melee</span>
            {melee.map((w) => (
              <WeaponButton
                key={w.name}
                weapon={w}
                isSelected={selected?.name === w.name && selected?.type === w.type}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function WeaponButton({
  weapon,
  isSelected,
  onSelect,
}: {
  weapon: ParsedWeapon
  isSelected: boolean
  onSelect: (w: ParsedWeapon) => void
}) {
  const keywords = weapon.keywords.length > 0
    ? weapon.keywords.map((k) => k.value ? `${k.name} ${k.value}` : k.name).join(', ')
    : null

  return (
    <button
      class={`btn btn-block justify-start text-left h-auto py-2 ${
        isSelected ? 'btn-primary' : 'btn-ghost border border-base-content/10'
      }`}
      onClick={() => onSelect(weapon)}
    >
      <div class="w-full">
        <div class="flex justify-between items-center">
          <span class="font-medium text-sm">{weapon.name}</span>
          <span class="text-xs opacity-60">
            {weapon.attacks}A | S{weapon.strength} | AP-{weapon.ap} | D{weapon.damage}
          </span>
        </div>
        {keywords && (
          <div class="text-xs opacity-70 mt-0.5">{keywords}</div>
        )}
      </div>
    </button>
  )
}
