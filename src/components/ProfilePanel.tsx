import { useState } from 'preact/hooks'
import type { ParsedUnit } from '../types/roster'
import type { UnitWoundState } from '../types/battle'
import type { KeywordAttachment, RuleDefinition } from '../types/rules'
import { maxWounds, totalWoundsRemaining } from '../lib/battle-state'
import { resolveUnitAbilities } from '../lib/rules/engine'
import { BATTLE_SHOCK_EFFECTS } from '../lib/rules/library'

interface Props {
  attacker: ParsedUnit | null
  defender: ParsedUnit | null
  attackerWounds: UnitWoundState | null
  defenderWounds: UnitWoundState | null
  rules: RuleDefinition[]
  attachments: KeywordAttachment[]
  allUnits: ParsedUnit[]
  onSetWounds: (unitId: string, total: number) => void
  onSetBattleShocked: (unitId: string, value: boolean) => void
}

/**
 * Collapsible unit profiles.
 *
 * Everything that is not part of resolving the current attack lives here: full
 * stat lines, models and wounds remaining, battle-shock, and the battlefield
 * abilities that only serve as reminders. Collapsed, it shows model counts only.
 */
export function ProfilePanel({
  attacker,
  defender,
  attackerWounds,
  defenderWounds,
  rules,
  attachments,
  allUnits,
  onSetWounds,
  onSetBattleShocked,
}: Props) {
  const [open, setOpen] = useState(false)

  if (!attacker && !defender) return null

  return (
    <div class="border-b border-base-content/10 bg-base-200/50">
      <button
        class="w-full flex items-center justify-between px-4 py-2 text-xs"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="profile-panel-body"
      >
        <span class="font-medium opacity-70">Profiles</span>
        <span class="flex items-center gap-3 opacity-70">
          {attacker && <SummaryCount label="A" unit={attacker} wounds={attackerWounds} />}
          {defender && <SummaryCount label="D" unit={defender} wounds={defenderWounds} />}
          <span aria-hidden="true">{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div id="profile-panel-body" class="px-4 pb-3 space-y-3">
          {attacker && (
            <UnitCard
              role="Attacker"
              unit={attacker}
              wounds={attackerWounds}
              rules={rules}
              attachments={attachments}
              allUnits={allUnits}
              onSetWounds={onSetWounds}
              onSetBattleShocked={onSetBattleShocked}
            />
          )}
          {defender && (
            <UnitCard
              role="Defender"
              unit={defender}
              wounds={defenderWounds}
              rules={rules}
              attachments={attachments}
              allUnits={allUnits}
              onSetWounds={onSetWounds}
              onSetBattleShocked={onSetBattleShocked}
            />
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCount({
  label,
  unit,
  wounds,
}: {
  label: string
  unit: ParsedUnit
  wounds: UnitWoundState | null
}) {
  const models = wounds ? wounds.woundsRemaining.length : unit.modelCount
  const dead = wounds?.isDead ?? false
  return (
    <span class={dead ? 'text-error' : ''}>
      {label}: {dead ? '💀' : `${models} model${models === 1 ? '' : 's'}`}
    </span>
  )
}

function UnitCard({
  role,
  unit,
  wounds,
  rules,
  attachments,
  allUnits,
  onSetWounds,
  onSetBattleShocked,
}: {
  role: 'Attacker' | 'Defender'
  unit: ParsedUnit
  wounds: UnitWoundState | null
  rules: RuleDefinition[]
  attachments: KeywordAttachment[]
  allUnits: ParsedUnit[]
  onSetWounds: (unitId: string, total: number) => void
  onSetBattleShocked: (unitId: string, value: boolean) => void
}) {
  const [showAbilities, setShowAbilities] = useState(false)
  const summary = resolveUnitAbilities(unit, { rules, attachments, allUnits })

  const current = wounds ? totalWoundsRemaining(wounds) : unit.wounds * unit.modelCount
  const max = wounds ? maxWounds(wounds) : unit.wounds * unit.modelCount
  const models = wounds ? wounds.woundsRemaining.length : unit.modelCount
  const damagedModel = wounds?.woundsRemaining.find((w) => w < wounds.woundsPerModel) ?? null

  return (
    <div class="card bg-base-200">
      <div class="card-body p-3 gap-2">
        <div class="flex items-baseline justify-between gap-2">
          <div class="min-w-0">
            <div class="text-[10px] uppercase opacity-50">{role}</div>
            <div class="text-sm font-medium truncate">{unit.name}</div>
          </div>
          <div class="text-xs opacity-50 shrink-0">{unit.points} pts</div>
        </div>

        {/* Stat line */}
        <div class="flex flex-wrap justify-between gap-y-1">
          <Stat label="M" value={unit.move ?? '—'} />
          <Stat label="T" value={`${unit.toughness}`} />
          <Stat label="Sv" value={`${unit.save}+`} />
          <Stat label="W" value={`${unit.wounds}`} />
          <Stat label="LD" value={unit.leadership ?? '—'} />
          <Stat label="OC" value={unit.objectiveControl === null ? '—' : `${unit.objectiveControl}`} />
          {unit.invulnerableSave !== null && (
            <Stat label="InSv" value={`${unit.invulnerableSave}+`} highlight />
          )}
          {unit.feelNoPain !== null && <Stat label="FNP" value={`${unit.feelNoPain}+`} highlight />}
        </div>

        {/* Models and wounds */}
        {wounds && (
          <div class="flex items-center justify-between gap-2 border-t border-base-content/10 pt-2">
            <div class="text-xs">
              <div>
                {models}/{wounds.startingModelCount} model{wounds.startingModelCount === 1 ? '' : 's'}
              </div>
              {damagedModel !== null && (
                <div class="opacity-60">
                  damaged model on {damagedModel}/{wounds.woundsPerModel}W
                </div>
              )}
            </div>
            <div class="flex items-center gap-1">
              <button
                class="btn btn-xs btn-circle btn-ghost"
                onClick={() => onSetWounds(unit.id, current - 1)}
                disabled={current <= 0}
                aria-label={`Remove a wound from ${unit.name}`}
              >
                −
              </button>
              <span class="text-sm font-mono w-16 text-center" aria-live="polite">
                {current}/{max}W
              </span>
              <button
                class="btn btn-xs btn-circle btn-ghost"
                onClick={() => onSetWounds(unit.id, current + 1)}
                disabled={current >= max}
                aria-label={`Restore a wound to ${unit.name}`}
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Battle-shock */}
        {wounds && (
          <div class="border-t border-base-content/10 pt-2">
            <label class="flex items-center justify-between gap-2 cursor-pointer">
              <span class="text-xs">Battle-shocked</span>
              <input
                type="checkbox"
                class="toggle toggle-xs toggle-warning"
                checked={wounds.battleShocked}
                onChange={(e) =>
                  onSetBattleShocked(unit.id, (e.target as HTMLInputElement).checked)
                }
                aria-label={`${unit.name} is battle-shocked`}
              />
            </label>
            {wounds.battleShocked && (
              <ul class="text-[11px] opacity-70 mt-1 list-disc list-inside">
                {BATTLE_SHOCK_EFFECTS.map((effect) => (
                  <li key={effect}>{effect}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Attachments */}
        {summary.attachmentNames.length > 0 && (
          <div class="flex flex-wrap gap-1">
            {summary.attachmentNames.map((name) => (
              <span key={name} class="badge badge-sm badge-primary badge-outline">
                🔗 {name}
              </span>
            ))}
          </div>
        )}
        {unit.isLeader && unit.attachableTo.length > 0 && (
          <div class="text-[11px] opacity-60">Can lead: {unit.attachableTo.join(', ')}</div>
        )}

        {/* Battlefield abilities and keywords */}
        {(unit.abilities.length > 0 || summary.rules.length > 0) && (
          <div class="border-t border-base-content/10 pt-2">
            <button
              class="text-xs opacity-70 flex items-center gap-1"
              onClick={() => setShowAbilities(!showAbilities)}
              aria-expanded={showAbilities}
            >
              Abilities ({unit.abilities.length + summary.rules.length})
              <span aria-hidden="true">{showAbilities ? '▲' : '▼'}</span>
            </button>
            {showAbilities && (
              <div class="mt-1 space-y-2">
                {summary.rules.map((rule) => (
                  <div key={rule.id} class="text-[11px]">
                    <span class="font-medium">{rule.name}</span>
                    {rule.ref && <span class="opacity-50"> ({rule.ref})</span>}
                    {rule.description && <div class="opacity-70">{rule.description}</div>}
                  </div>
                ))}
                {unit.abilities.map((ability) => (
                  <div key={ability.name} class="text-[11px]">
                    <span class="font-medium">{ability.name}</span>
                    <div class="opacity-70 line-clamp-4">{ability.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <details class="text-[11px]">
          <summary class="opacity-60 cursor-pointer">Keywords</summary>
          <div class="flex flex-wrap gap-1 mt-1">
            {summary.keywords.map((keyword) => (
              <span key={keyword} class="badge badge-xs badge-ghost">
                {keyword}
              </span>
            ))}
          </div>
        </details>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div class={`flex flex-col items-center px-1 min-w-9 ${highlight ? 'text-warning' : ''}`}>
      <span class="text-[10px] opacity-50">{label}</span>
      <span class="text-base font-bold leading-tight">{value}</span>
    </div>
  )
}
