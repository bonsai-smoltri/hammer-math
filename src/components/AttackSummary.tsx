import { useMemo, useState } from 'preact/hooks'
import type { ParsedUnit, ParsedWeapon } from '../types/roster'
import type { CombatOptionKey, CombatOptions, KeywordAttachment, RuleDefinition } from '../types/rules'
import { COMBAT_OPTION_DEFS, defaultCombatOptions } from '../types/rules'
import {
  collectNotes,
  formatAttackDice,
  formatCritHitLine,
  formatCritWoundLine,
  formatDamageLine,
  formatFeelNoPain,
  formatHitLine,
  formatSaveLine,
  formatWoundLine,
  resolveAttack,
  splitBracketed,
} from '../lib/combat-math'
import { affectsCombat } from '../lib/rules/engine'
import { Stepper } from './Stepper'

interface Props {
  attacker: ParsedUnit
  weapon: ParsedWeapon
  defender: ParsedUnit
  rules: RuleDefinition[]
  attachments: KeywordAttachment[]
  allUnits: ParsedUnit[]
  /** Library rules the user pinned as quick toggles. */
  pinnedRuleIds: string[]
  /** Options owned elsewhere (battle-shock lives on the unit profile). */
  baseOptions?: Partial<CombatOptions>
  /** Weapons firing, from the roster and surviving models. */
  defaultWeaponCount?: number
  /** Whether to show the expected-damage estimate row. */
  showDamageEstimates: boolean
}

/**
 * Options that belong to a unit's profile rather than to this attack, so they
 * are never offered as toggles here.
 */
const PROFILE_OWNED_OPTIONS: CombatOptionKey[] = ['attackerBattleShocked', 'targetBattleShocked']

export function AttackSummary({
  attacker,
  weapon,
  defender,
  rules,
  attachments,
  allUnits,
  pinnedRuleIds,
  baseOptions,
  defaultWeaponCount,
  showDamageEstimates,
}: Props) {
  const [options, setOptions] = useState<CombatOptions>(defaultCombatOptions())
  const [activeManualRuleIds, setActiveManualRuleIds] = useState<string[]>([])
  const [weaponCountOverride, setWeaponCountOverride] = useState<number | null>(null)

  const fallbackCount = defaultWeaponCount ?? weapon.count ?? attacker.modelCount
  const weaponCount = weaponCountOverride ?? fallbackCount

  // Only rules the user keeps to hand can be switched on mid-attack.
  const availableManualRuleIds = useMemo(
    () => [...pinnedRuleIds, ...rules.filter((rule) => rule.manual).map((rule) => rule.id)],
    [pinnedRuleIds, rules]
  )

  const resolved = useMemo(
    () =>
      resolveAttack({
        attacker,
        weapon,
        defender,
        options: { ...options, ...baseOptions },
        rules,
        attachments,
        allUnits,
        activeManualRuleIds,
        availableManualRuleIds,
        weaponCount,
      }),
    [
      attacker,
      weapon,
      defender,
      options,
      baseOptions,
      rules,
      attachments,
      allUnits,
      activeManualRuleIds,
      availableManualRuleIds,
      weaponCount,
    ]
  )

  const { profile, estimate } = resolved

  // Only situations that change a number in this attack earn a toggle.
  const optionDefs = COMBAT_OPTION_DEFS.filter(
    (def) => resolved.relevantOptions.includes(def.key) && !PROFILE_OWNED_OPTIONS.includes(def.key)
  )

  const toggleOption = (key: CombatOptionKey) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))

  const toggleRule = (id: string) =>
    setActiveManualRuleIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    )

  const combatRules = profile.appliedRules.filter(
    (applied) => !applied.rule.manual && affectsCombat(applied.rule)
  )
  const notes = collectNotes(resolved)

  return (
    <div class="card bg-base-200">
      <div class="card-body p-4">
        <h2 class="card-title text-sm opacity-70">
          Rolls & Modifiers
        </h2>

        {/* Weapons firing */}
        <Stepper
          label="Weapons firing"
          hint={weapon.name}
          value={weaponCount}
          min={0}
          onChange={(value) => setWeaponCountOverride(value)}
          onReset={
            weaponCountOverride !== null && weaponCountOverride !== fallbackCount
              ? () => setWeaponCountOverride(null)
              : undefined
          }
          resetLabel={`reset to ${fallbackCount}`}
        />

        <div class="flex flex-wrap gap-2 mb-1">
          {/* Situational toggles */}
          {optionDefs.map((def) => (
            <ToggleButton
              key={def.key}
              label={def.label}
              title={def.hint}
              active={options[def.key]}
              onClick={() => toggleOption(def.key)}
              variant={def.key === 'targetInCover' ? 'warning' : 'primary'}
            />
          ))}
          {/* Rule toggles */}
          {resolved.manualRules.map((rule) => (
            <ToggleButton
              key={rule.id}
              label={rule.name}
              title={rule.description ?? rule.name}
              active={activeManualRuleIds.includes(rule.id)}
              onClick={() => toggleRule(rule.id)}
              variant="accent"
            />
          ))}
        </div>

        {/* Pipeline */}
        <div class="space-y-2 font-mono text-sm">
          <SummaryLine icon="🎲" text={formatAttackDice(profile)} />
          <SummaryLine icon="🎯" text={formatHitLine(profile)} />
          <OptionalLine icon="💥" text={formatCritHitLine(profile)} />
          <SummaryLine icon="💀" text={formatWoundLine(profile)} />
          <OptionalLine icon="☠️" text={formatCritWoundLine(profile)} />
          <SummaryLine icon="🛡️" text={formatSaveLine(profile)} />
          <SummaryLine icon="🔥" text={formatDamageLine(profile)} />
          <OptionalLine icon="❤️‍🩹" text={formatFeelNoPain(profile)} />

          {showDamageEstimates && (
            <div class="border-t border-base-content/10 pt-2 mt-2 space-y-1">
              <SummaryLine
                icon="🧮"
                text={`${estimate.attacks.toFixed(1)} attacks → ${estimate.hits.toFixed(1)} hits → ${estimate.wounds.toFixed(1)} wounds → ${estimate.unsavedWounds.toFixed(1)} unsaved${estimate.mortalWounds > 0 ? ` + ${estimate.mortalWounds.toFixed(1)} mortal` : ''}, ~${estimate.expectedDamage.toFixed(1)} damage`}
              />
            </div>
          )}
        </div>

        {/* Which rules fired */}
        {combatRules.length > 0 && (
          <div class="flex flex-wrap gap-1 mt-2">
            {combatRules.map((applied) => (
              <span
                key={`${applied.as}-${applied.rule.id}`}
                class="badge badge-sm badge-ghost"
                title={applied.rule.description ?? ''}
              >
                {applied.rule.name}
                {applied.viaAttachment ? ' 🔗' : ''}
                {applied.rule.ref && <span class="opacity-70"> ({applied.rule.ref})</span>}
              </span>
            ))}
          </div>
        )}

        {/* Reminders about this attack */}
        {notes.length > 0 && (
          <div class="border-t border-base-content/10 pt-2 mt-2 text-xs space-y-1">
            {notes.map((note, i) => (
              <div key={i} class="flex items-start gap-2">
                <span aria-hidden="true">ℹ️</span>
                <span>
                  {splitBracketed(note).map((segment, j) =>
                    segment.dim ? (
                      <span key={j} class="opacity-70">
                        {segment.text}
                      </span>
                    ) : (
                      <span key={j}>{segment.text}</span>
                    )
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ToggleButton({
  label,
  title,
  active,
  onClick,
  variant = 'primary',
}: {
  label: string
  title: string
  active: boolean
  onClick: () => void
  variant?: 'primary' | 'warning' | 'accent'
}) {
  const activeClass =
    variant === 'warning' ? 'btn-warning' : variant === 'accent' ? 'btn-accent' : 'btn-primary'
  return (
    <button
      type="button"
      class={`btn btn-sm h-10 ${active ? activeClass : 'btn-ghost border border-base-content/20'}`}
      onClick={onClick}
      title={title}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

function SummaryLine({ icon, text }: { icon: string; text: string }) {
  return (
    <div class="flex items-start gap-2">
      <span class="shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span>
        {splitBracketed(text).map((segment, i) =>
          segment.dim ? (
            <span key={i} class="opacity-70">
              {segment.text}
            </span>
          ) : (
            <span key={i}>{segment.text}</span>
          )
        )}
      </span>
    </div>
  )
}

function OptionalLine({ icon, text }: { icon: string; text: string | null }) {
  if (!text) return null
  return <SummaryLine icon={icon} text={text} />
}
