import type { ParsedUnit } from '../types/roster'

interface Props {
  unit: ParsedUnit
}

export function DefenderStats({ unit }: Props) {
  const totalWounds = unit.wounds * unit.modelCount

  return (
    <div class="card bg-base-200">
      <div class="card-body p-3">
        <div class="text-xs opacity-60 mb-1">Defender Profile</div>
        <div class="flex justify-between text-center">
          <StatBox label="T" value={`${unit.toughness}`} />
          <StatBox label="Sv" value={`${unit.save}+`} />
          {unit.invulnerableSave && (
            <StatBox label="InSv" value={`${unit.invulnerableSave}+`} highlight />
          )}
          <StatBox label="W" value={`${unit.wounds}`} subtitle={`(${totalWounds} total)`} />
          {unit.feelNoPain && (
            <StatBox label="FNP" value={`${unit.feelNoPain}+`} highlight />
          )}
          <StatBox label="Models" value={`${unit.modelCount}`} />
        </div>
      </div>
    </div>
  )
}

function StatBox({
  label,
  value,
  highlight = false,
  subtitle,
}: {
  label: string
  value: string
  highlight?: boolean
  subtitle?: string
}) {
  return (
    <div class={`flex flex-col items-center px-2 ${highlight ? 'text-warning' : ''}`}>
      <span class="text-xs opacity-50">{label}</span>
      <span class="text-lg font-bold">{value}</span>
      {subtitle && <span class="text-[10px] opacity-50 -mt-1">{subtitle}</span>}
    </div>
  )
}
