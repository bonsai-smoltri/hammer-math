import { useMemo, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { ParsedAttachment, ParsedUnit } from '../types/roster'
import type {
  KeywordAttachment,
  RerollMode,
  RuleDefinition,
  RuleEffects,
  RuleSide,
  RuleTarget,
  RuleTargetType,
} from '../types/rules'
import type { RulesPayload } from '../lib/rules-storage'
import { exportRulesPayload, newId, parseRulesPayload } from '../lib/rules-storage'
import { RULE_GROUPS, STARTER_RULES } from '../lib/rules/library'
import { collectKeywords } from '../lib/rules/keywords'
import { KeywordPicker } from './KeywordPicker'

interface Props {
  payload: RulesPayload
  onChange: (payload: RulesPayload) => void
  onBack: () => void
  units: ParsedUnit[]
  /** Attachments the roster told us about, applied automatically. */
  rosterAttachments: KeywordAttachment[]
  /** Leader pairings that could not be resolved automatically. */
  suggestions: ParsedAttachment[]
}

type Tab = 'rules' | 'attachments' | 'library'

export function RulesPage({
  payload,
  onChange,
  onBack,
  units,
  rosterAttachments,
  suggestions,
}: Props) {
  const [tab, setTab] = useState<Tab>('rules')
  const [editingRule, setEditingRule] = useState<RuleDefinition | null>(null)
  const [editingAttachment, setEditingAttachment] = useState<KeywordAttachment | null>(null)
  const [error, setError] = useState<string | null>(null)

  const keywordSuggestions = useMemo(() => collectKeywords(units), [units])

  const saveRule = (rule: RuleDefinition) => {
    const index = payload.rules.findIndex((r) => r.id === rule.id)
    const rules = [...payload.rules]
    if (index >= 0) rules[index] = rule
    else rules.push(rule)
    onChange({ ...payload, rules })
    setEditingRule(null)
  }

  const saveAttachment = (attachment: KeywordAttachment) => {
    const index = payload.attachments.findIndex((a) => a.id === attachment.id)
    const attachments = [...payload.attachments]
    if (index >= 0) attachments[index] = attachment
    else attachments.push(attachment)
    onChange({ ...payload, attachments })
    setEditingAttachment(null)
  }

  const handleImport = (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const imported = parseRulesPayload(ev.target?.result as string)
      if (!imported) {
        setError('That file does not look like a rules export.')
        return
      }
      const existingRuleIds = new Set(payload.rules.map((r) => r.id))
      const existingAttachmentIds = new Set(payload.attachments.map((a) => a.id))
      onChange({
        ...payload,
        rules: [...payload.rules, ...imported.rules.filter((r) => !existingRuleIds.has(r.id))],
        attachments: [
          ...payload.attachments,
          ...imported.attachments.filter((a) => !existingAttachmentIds.has(a.id)),
        ],
        pinnedRuleIds: [...new Set([...payload.pinnedRuleIds, ...imported.pinnedRuleIds])],
      })
      setError(null)
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
    input.value = ''
  }

  if (editingRule) {
    return (
      <RuleForm
        rule={editingRule}
        units={units}
        keywordSuggestions={keywordSuggestions}
        onSave={saveRule}
        onCancel={() => setEditingRule(null)}
      />
    )
  }

  if (editingAttachment) {
    return (
      <AttachmentForm
        attachment={editingAttachment}
        units={units}
        rules={[...payload.rules, ...STARTER_RULES.filter((r) => r.manual)]}
        keywordSuggestions={keywordSuggestions}
        onSave={saveAttachment}
        onCancel={() => setEditingAttachment(null)}
      />
    )
  }

  return (
    <div class="min-h-screen bg-base-100 text-base-content flex flex-col max-w-lg mx-auto">
      <div class="flex items-center justify-between px-4 py-3 bg-base-200 border-b border-base-content/10">
        <button class="btn btn-ghost btn-sm" onClick={onBack}>
          ← Back
        </button>
        <h1 class="text-sm font-bold">Rules Engine</h1>
        <div class="w-16" />
      </div>

      <div role="tablist" class="tabs tabs-boxed m-2">
        <button
          role="tab"
          class={`tab ${tab === 'rules' ? 'tab-active' : ''}`}
          onClick={() => setTab('rules')}
        >
          My Rules
        </button>
        <button
          role="tab"
          class={`tab ${tab === 'attachments' ? 'tab-active' : ''}`}
          onClick={() => setTab('attachments')}
        >
          Attachments
        </button>
        <button
          role="tab"
          class={`tab ${tab === 'library' ? 'tab-active' : ''}`}
          onClick={() => setTab('library')}
        >
          Library
        </button>
      </div>

      {error && (
        <div role="alert" class="alert alert-error mx-4 mb-2 text-xs">
          <span>{error}</span>
        </div>
      )}

      <div class="p-4 pt-0 space-y-3 flex-1">
        {tab === 'rules' && (
          <>
            <div class="flex gap-2">
              <button
                class="btn btn-sm btn-outline flex-1"
                onClick={() => exportRulesPayload(payload)}
                disabled={payload.rules.length === 0 && payload.attachments.length === 0}
              >
                Export
              </button>
              <label class="btn btn-sm btn-outline flex-1">
                Import
                <input type="file" accept=".json" class="hidden" onChange={handleImport} />
              </label>
            </div>

            {payload.rules.length === 0 && (
              <p class="text-center opacity-50 py-6 text-sm">
                No homebrew rules yet. Create one, or pin something from the Library.
              </p>
            )}

            {payload.rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onEdit={() => setEditingRule(rule)}
                onDelete={() =>
                  onChange({ ...payload, rules: payload.rules.filter((r) => r.id !== rule.id) })
                }
                onToggle={() =>
                  onChange({
                    ...payload,
                    rules: payload.rules.map((r) =>
                      r.id === rule.id ? { ...r, enabled: r.enabled === false } : r
                    ),
                  })
                }
              />
            ))}

            <button class="btn btn-primary w-full" onClick={() => setEditingRule(blankRule())}>
              + Create Rule
            </button>
          </>
        )}

        {tab === 'attachments' && (
          <>
            <p class="text-xs opacity-60">
              An attachment pins keywords onto one or more units. An attached unit has every keyword of
              both units (19.03), so tag the squad and any keyword rule starts applying to the pair.
            </p>

            {/* Marked as attached by the roster itself */}
            {rosterAttachments.length > 0 && (
              <div class="space-y-2">
                <h2 class="text-xs font-bold uppercase opacity-60">Marked in the roster</h2>
                {rosterAttachments.map((attachment) => (
                  <div key={attachment.id} class="card bg-base-200">
                    <div class="card-body p-3 flex-row items-center gap-2">
                      <input
                        type="checkbox"
                        class="toggle toggle-sm toggle-accent"
                        checked={attachment.enabled}
                        onChange={() =>
                          onChange({
                            ...payload,
                            disabledAttachmentIds: attachment.enabled
                              ? [...payload.disabledAttachmentIds, attachment.id]
                              : payload.disabledAttachmentIds.filter((id) => id !== attachment.id),
                          })
                        }
                        aria-label={`Enable ${attachment.name}`}
                      />
                      <div class="flex-1">
                        <div class="font-medium text-sm">{attachment.name}</div>
                        <div class="text-xs opacity-60">the roster lists them as attached</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Allowed by a Leader/Support ability — the player decides */}
            {suggestions.length > 0 && (
              <div class="space-y-2">
                <h2 class="text-xs font-bold uppercase opacity-60">Could be attached</h2>
                <p class="text-[11px] opacity-60">
                  A Leader or Support ability says these pairings are allowed. Rosters do not record
                  who actually joined whom, so attach the ones you are playing.
                </p>
                {suggestions.map((suggestion) => {
                  const id = suggestionId(suggestion)
                  const added = payload.attachments.some((a) => a.id === id)
                  const bodyguard = units.find((u) => u.id === suggestion.bodyguardUnitId)
                  const bodyguardLabel = bodyguard
                    ? unitLabel(bodyguard, units)
                    : suggestion.bodyguardName
                  return (
                    <div key={id} class="card bg-base-200">
                      <div class="card-body p-3 flex-row items-center gap-2">
                        <div class="flex-1">
                          <div class="font-medium text-sm">
                            {suggestion.leaderName} → {bodyguardLabel}
                          </div>
                          <div class="text-xs opacity-60">allowed by its Leader ability</div>
                        </div>
                        <button
                          class="btn btn-xs btn-primary"
                          disabled={added}
                          onClick={() =>
                            onChange({
                              ...payload,
                              attachments: [
                                ...payload.attachments,
                                {
                                  id,
                                  name: `${suggestion.leaderName} leads ${suggestion.bodyguardName}`,
                                  keywords: [],
                                  ruleIds: [],
                                  unitIds: [suggestion.bodyguardUnitId],
                                  sourceUnitId: suggestion.leaderUnitId,
                                  enabled: true,
                                },
                              ],
                            })
                          }
                        >
                          {added ? 'Attached' : 'Attach'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <h2 class="text-xs font-bold uppercase opacity-60 mt-2">Yours</h2>
            {payload.attachments.length === 0 && (
              <p class="text-center opacity-50 py-4 text-sm">No attachments of your own yet.</p>
            )}

            {payload.attachments.map((attachment) => (
              <AttachmentCard
                key={attachment.id}
                attachment={attachment}
                units={units}
                onEdit={() => setEditingAttachment(attachment)}
                onDelete={() =>
                  onChange({
                    ...payload,
                    attachments: payload.attachments.filter((a) => a.id !== attachment.id),
                  })
                }
                onToggle={() =>
                  onChange({
                    ...payload,
                    attachments: payload.attachments.map((a) =>
                      a.id === attachment.id ? { ...a, enabled: !a.enabled } : a
                    ),
                  })
                }
              />
            ))}

            <button
              class="btn btn-primary w-full"
              onClick={() => setEditingAttachment(blankAttachment())}
            >
              + Create Attachment
            </button>
          </>
        )}

        {tab === 'library' && (
          <>
            <p class="text-xs opacity-60">
              Core rules the engine applies for you. Weapon abilities fire automatically; pin a stratagem
              or buff to get a toggle on the attack screen.
            </p>
            {RULE_GROUPS.map((group) => (
              <div key={group.label} class="space-y-1">
                <h2 class="text-xs font-bold uppercase opacity-60 mt-3">{group.label}</h2>
                {group.rules.map((rule) => (
                  <LibraryRuleCard
                    key={rule.id}
                    rule={rule}
                    pinned={payload.pinnedRuleIds.includes(rule.id)}
                    onTogglePin={() =>
                      onChange({
                        ...payload,
                        pinnedRuleIds: payload.pinnedRuleIds.includes(rule.id)
                          ? payload.pinnedRuleIds.filter((id) => id !== rule.id)
                          : [...payload.pinnedRuleIds, rule.id],
                      })
                    }
                    onCopy={() =>
                      setEditingRule({
                        ...rule,
                        id: newId(),
                        name: `${rule.name} (copy)`,
                        source: 'custom',
                        builtIn: false,
                        compute: undefined,
                        enabled: true,
                        manual: true,
                      })
                    }
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// --- Cards ---------------------------------------------------------------

function RuleCard({
  rule,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule: RuleDefinition
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  return (
    <div class="card bg-base-200">
      <div class="card-body p-3">
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            class="toggle toggle-sm toggle-accent"
            checked={rule.enabled !== false}
            onChange={onToggle}
            aria-label={`Enable ${rule.name}`}
          />
          <div class="flex-1">
            <div class="font-medium text-sm">{rule.name}</div>
            <div class="text-xs opacity-60">
              {sideLabel(rule.side)} · {targetLabel(rule.target)}
              {rule.manual ? ' · needs activating' : ''}
            </div>
          </div>
          <button class="btn btn-ghost btn-xs" onClick={onEdit} aria-label={`Edit ${rule.name}`}>
            Edit
          </button>
          <button
            class="btn btn-ghost btn-xs text-error"
            onClick={onDelete}
            aria-label={`Delete ${rule.name}`}
          >
            Delete
          </button>
        </div>
        <EffectsSummary effects={rule.effects} />
      </div>
    </div>
  )
}

function LibraryRuleCard({
  rule,
  pinned,
  onTogglePin,
  onCopy,
}: {
  rule: RuleDefinition
  pinned: boolean
  onTogglePin: () => void
  onCopy: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div class="card bg-base-200">
      <div class="card-body p-3 gap-1">
        <div class="flex items-center gap-2">
          <button
            class="flex-1 text-left"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            <span class="font-medium text-sm">{rule.name}</span>
            {rule.ref && <span class="text-xs opacity-50"> ({rule.ref})</span>}
            <div class="text-xs opacity-60">
              {sideLabel(rule.side)} · {rule.manual ? 'toggle' : 'automatic'}
            </div>
          </button>
          {rule.manual && (
            <button
              class={`btn btn-xs ${pinned ? 'btn-accent' : 'btn-ghost border border-base-content/20'}`}
              onClick={onTogglePin}
              aria-pressed={pinned}
            >
              {pinned ? 'Pinned' : 'Pin'}
            </button>
          )}
          <button class="btn btn-ghost btn-xs" onClick={onCopy} aria-label={`Copy ${rule.name}`}>
            Copy
          </button>
        </div>
        {open && (
          <div class="text-xs opacity-70 border-t border-base-content/10 pt-2">
            {rule.description}
            <EffectsSummary effects={rule.effects} />
          </div>
        )}
      </div>
    </div>
  )
}

function AttachmentCard({
  attachment,
  units,
  onEdit,
  onDelete,
  onToggle,
}: {
  attachment: KeywordAttachment
  units: ParsedUnit[]
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? 'unknown unit'
  return (
    <div class="card bg-base-200">
      <div class="card-body p-3 gap-1">
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            class="toggle toggle-sm toggle-accent"
            checked={attachment.enabled}
            onChange={onToggle}
            aria-label={`Enable ${attachment.name}`}
          />
          <div class="flex-1">
            <div class="font-medium text-sm">{attachment.name}</div>
            <div class="text-xs opacity-60">
              {attachment.sourceUnitId ? `${unitName(attachment.sourceUnitId)} → ` : ''}
              {attachment.unitIds.length} unit{attachment.unitIds.length === 1 ? '' : 's'}
            </div>
          </div>
          <button class="btn btn-ghost btn-xs" onClick={onEdit} aria-label={`Edit ${attachment.name}`}>
            Edit
          </button>
          <button
            class="btn btn-ghost btn-xs text-error"
            onClick={onDelete}
            aria-label={`Delete ${attachment.name}`}
          >
            Delete
          </button>
        </div>
        <div class="flex flex-wrap gap-1">
          {attachment.keywords.map((keyword) => (
            <span key={keyword} class="badge badge-sm badge-primary badge-outline">
              {keyword}
            </span>
          ))}
          {attachment.ruleIds.length > 0 && (
            <span class="badge badge-sm badge-ghost">
              +{attachment.ruleIds.length} rule{attachment.ruleIds.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function EffectsSummary({ effects }: { effects: RuleEffects }) {
  const lines = describeEffects(effects)
  if (lines.length === 0) return null
  return (
    <div class="flex flex-wrap gap-1 mt-1">
      {lines.map((line) => (
        <span key={line} class="badge badge-sm badge-accent badge-outline">
          {line}
        </span>
      ))}
    </div>
  )
}

// --- Rule form -----------------------------------------------------------

type NumericEffectKey =
  | 'hitModifier'
  | 'woundModifier'
  | 'strengthModifier'
  | 'apModifier'
  | 'damageModifier'
  | 'damageReduction'
  | 'critHitOn'
  | 'critWoundOn'
  | 'sustainedHits'
  | 'feelNoPain'
  | 'invulnerableSave'
  | 'saveModifier'
  | 'toughnessModifier'
  | 'attackDicePerFiveTargetModels'
  | 'unmodifiedHitFloor'

type BooleanEffectKey =
  | 'lethalHits'
  | 'devastatingWounds'
  | 'autoHit'
  | 'autoWound'
  | 'ignoresCover'
  | 'grantsCover'
  | 'halveDamage'
  | 'cannotUseInvulnerableSave'
  | 'ignoreHitModifiers'
  | 'cannotRerollHits'

type DiceEffectKey = 'bonusAttacks' | 'flatMortalWounds'

const NUMBER_FIELDS: { key: NumericEffectKey; label: string }[] = [
  { key: 'hitModifier', label: 'Hit modifier (+1 / -1)' },
  { key: 'woundModifier', label: 'Wound modifier (+1 / -1)' },
  { key: 'strengthModifier', label: 'Strength modifier' },
  { key: 'apModifier', label: 'Extra armour penetration' },
  { key: 'damageModifier', label: 'Damage modifier' },
  { key: 'damageReduction', label: 'Damage reduction (defender)' },
  { key: 'critHitOn', label: 'Critical hits on X+' },
  { key: 'critWoundOn', label: 'Critical wounds on X+' },
  { key: 'sustainedHits', label: 'Sustained Hits X' },
  { key: 'attackDicePerFiveTargetModels', label: 'Extra dice per 5 target models' },
  { key: 'unmodifiedHitFloor', label: 'Unmodified hit roll needed' },
  { key: 'feelNoPain', label: 'Feel No Pain X+ (defender)' },
  { key: 'invulnerableSave', label: 'Invulnerable save X+ (defender)' },
  { key: 'saveModifier', label: 'Save modifier (defender)' },
  { key: 'toughnessModifier', label: 'Toughness modifier (defender)' },
]

const BOOLEAN_FIELDS: { key: BooleanEffectKey; label: string }[] = [
  { key: 'lethalHits', label: 'Lethal Hits' },
  { key: 'devastatingWounds', label: 'Devastating Wounds' },
  { key: 'autoHit', label: 'Automatically hits' },
  { key: 'autoWound', label: 'Automatically wounds' },
  { key: 'ignoresCover', label: 'Ignores Cover' },
  { key: 'grantsCover', label: 'Has the benefit of cover (defender)' },
  { key: 'halveDamage', label: 'Halve damage (defender)' },
  { key: 'cannotUseInvulnerableSave', label: 'Target cannot use invulnerable saves' },
  { key: 'ignoreHitModifiers', label: 'Ignore hit roll modifiers' },
  { key: 'cannotRerollHits', label: 'Hit rolls cannot be re-rolled' },
]

const DICE_FIELDS: { key: DiceEffectKey; label: string }[] = [
  { key: 'bonusAttacks', label: 'Bonus attacks (e.g. 1 or D3)' },
  { key: 'flatMortalWounds', label: 'Mortal wounds (e.g. D6)' },
]

const REROLL_OPTIONS: { value: RerollMode; label: string }[] = [
  { value: 'none', label: 'No re-roll' },
  { value: 'ones', label: 'Re-roll 1s' },
  { value: 'failed', label: 'Re-roll failures' },
]

function blankRule(): RuleDefinition {
  return {
    id: newId(),
    name: '',
    source: 'custom',
    side: 'attacker',
    target: { type: 'global' },
    effects: {},
    // Most rules people write are datasheet abilities that are simply on, so the
    // default is automatic. Stratagems and one-off buffs opt into a toggle.
    manual: false,
    enabled: true,
  }
}

function RuleForm({
  rule,
  units,
  keywordSuggestions,
  onSave,
  onCancel,
}: {
  rule: RuleDefinition
  units: ParsedUnit[]
  keywordSuggestions: string[]
  onSave: (rule: RuleDefinition) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<RuleDefinition>(rule)
  const target = draft.target ?? { type: 'global' as RuleTargetType }
  const effects = draft.effects

  const patch = (changes: Partial<RuleDefinition>) => setDraft({ ...draft, ...changes })
  const patchTarget = (changes: Partial<RuleTarget>) => patch({ target: { ...target, ...changes } })
  const patchEffects = (changes: Partial<RuleEffects>) =>
    patch({ effects: prune({ ...effects, ...changes }) })

  return (
    <FormShell
      title={rule.name ? 'Edit Rule' : 'Create Rule'}
      onCancel={onCancel}
      onSave={() => draft.name.trim() && onSave({ ...draft, name: draft.name.trim() })}
      saveDisabled={!draft.name.trim()}
    >
      <Field label="Rule name">
        <input
          type="text"
          class="input input-bordered input-sm"
          placeholder="e.g. Oath of Moment"
          value={draft.name}
          onInput={(e) => patch({ name: (e.target as HTMLInputElement).value })}
        />
      </Field>

      <Field label="Description (optional)">
        <textarea
          class="textarea textarea-bordered textarea-sm"
          value={draft.description ?? ''}
          onInput={(e) => patch({ description: (e.target as HTMLTextAreaElement).value })}
        />
      </Field>

      <Field label="Applies when the owning unit is the...">
        <div class="join">
          {(['attacker', 'defender', 'both'] as RuleSide[]).map((side) => (
            <button
              key={side}
              class={`btn btn-sm join-item flex-1 ${draft.side === side ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => patch({ side })}
              aria-pressed={draft.side === side}
            >
              {sideLabel(side)}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Belongs to">
        <div class="grid grid-cols-3 gap-1">
          {(['global', 'keyword', 'unit'] as RuleTargetType[]).map((type) => (
            <button
              key={type}
              class={`btn btn-xs ${target.type === type ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => patchTarget({ type })}
              aria-pressed={target.type === type}
            >
              {type === 'global' ? 'Every unit' : type === 'keyword' ? 'Keywords' : 'Named units'}
            </button>
          ))}
        </div>
      </Field>

      {target.type === 'keyword' && (
        <Field label="Keywords (faction keywords included)">
          <KeywordPicker
            available={keywordSuggestions}
            selected={target.keywords ?? []}
            onChange={(keywords) => patchTarget({ keywords })}
            allowCustom
          />
          {(target.keywords ?? []).length > 1 && (
            <label class="label cursor-pointer gap-2 justify-start">
              <input
                type="checkbox"
                class="checkbox checkbox-xs"
                checked={target.keywordMatch === 'all'}
                onChange={(e) =>
                  patchTarget({
                    keywordMatch: (e.target as HTMLInputElement).checked ? 'all' : 'any',
                  })
                }
              />
              <span class="label-text text-xs">Unit must have every keyword</span>
            </label>
          )}
        </Field>
      )}

      {target.type === 'unit' && (
        <Field label="Units">
          <UnitChecklist
            units={units}
            selected={target.unitIds ?? []}
            onChange={(unitIds) => patchTarget({ unitIds })}
          />
        </Field>
      )}

      <Field label="Activation">
        <label class="label cursor-pointer gap-2 justify-start">
          <input
            type="checkbox"
            class="checkbox checkbox-sm"
            checked={draft.manual === true}
            onChange={(e) => patch({ manual: (e.target as HTMLInputElement).checked })}
          />
          <span class="label-text text-xs">
            Needs switching on per attack (stratagems, once-per-turn buffs)
          </span>
        </label>
      </Field>

      <Field label="Situation">
        <RerollRow
          label="Hit re-rolls"
          value={effects.hitRerolls ?? 'none'}
          onChange={(hitRerolls) => patchEffects({ hitRerolls })}
        />
        <RerollRow
          label="Wound re-rolls"
          value={effects.woundRerolls ?? 'none'}
          onChange={(woundRerolls) => patchEffects({ woundRerolls })}
        />
      </Field>

      <Field label="Numeric effects">
        <div class="space-y-1 border border-base-content/20 rounded-lg p-3">
          {NUMBER_FIELDS.map((field) => (
            <div key={field.key} class="flex items-center justify-between gap-2 min-h-9">
              <label class="text-xs" for={`effect-${field.key}`}>
                {field.label}
              </label>
              <input
                id={`effect-${field.key}`}
                type="number"
                inputMode="numeric"
                class="input input-bordered w-16 h-9 text-center"
                value={effects[field.key] ?? ''}
                onInput={(e) => {
                  const raw = (e.target as HTMLInputElement).value
                  const value = raw === '' ? undefined : parseInt(raw, 10)
                  patchEffects({ [field.key]: Number.isNaN(value) ? undefined : value })
                }}
              />
            </div>
          ))}
          {DICE_FIELDS.map((field) => (
            <div key={field.key} class="flex items-center justify-between gap-2">
              <label class="text-xs" for={`effect-${field.key}`}>
                {field.label}
              </label>
              <input
                id={`effect-${field.key}`}
                type="text"
                class="input input-bordered input-xs w-16 text-center"
                value={String(effects[field.key] ?? '')}
                onInput={(e) => {
                  const raw = (e.target as HTMLInputElement).value.trim()
                  patchEffects({ [field.key]: raw === '' ? undefined : raw })
                }}
              />
            </div>
          ))}
        </div>
      </Field>

      <Field label="Flags">
        <div class="space-y-1 border border-base-content/20 rounded-lg p-3">
          {BOOLEAN_FIELDS.map((field) => (
            <label key={field.key} class="flex items-center justify-between gap-2 cursor-pointer">
              <span class="text-xs">{field.label}</span>
              <input
                type="checkbox"
                class="toggle toggle-xs toggle-accent"
                checked={effects[field.key] === true}
                onChange={(e) =>
                  patchEffects({
                    [field.key]: (e.target as HTMLInputElement).checked ? true : undefined,
                  })
                }
              />
            </label>
          ))}
        </div>
      </Field>

    </FormShell>
  )
}

// --- Attachment form -----------------------------------------------------

function blankAttachment(): KeywordAttachment {
  return {
    id: newId(),
    name: '',
    keywords: [],
    ruleIds: [],
    unitIds: [],
    sourceUnitId: null,
    enabled: true,
  }
}

function AttachmentForm({
  attachment,
  units,
  rules,
  keywordSuggestions,
  onSave,
  onCancel,
}: {
  attachment: KeywordAttachment
  units: ParsedUnit[]
  rules: RuleDefinition[]
  keywordSuggestions: string[]
  onSave: (attachment: KeywordAttachment) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<KeywordAttachment>(attachment)
  const patch = (changes: Partial<KeywordAttachment>) => setDraft({ ...draft, ...changes })

  const sourceUnit = units.find((u) => u.id === draft.sourceUnitId)

  return (
    <FormShell
      title={attachment.name ? 'Edit Attachment' : 'Create Attachment'}
      onCancel={onCancel}
      onSave={() => draft.name.trim() && onSave({ ...draft, name: draft.name.trim() })}
      saveDisabled={!draft.name.trim()}
    >
      <Field label="Name">
        <input
          type="text"
          class="input input-bordered input-sm"
          placeholder="e.g. Captain leads Intercessors"
          value={draft.name}
          onInput={(e) => patch({ name: (e.target as HTMLInputElement).value })}
        />
      </Field>

      <Field label="Leader / source unit (optional)">
        <select
          class="select select-bordered select-sm"
          value={draft.sourceUnitId ?? ''}
          onChange={(e) => {
            const value = (e.target as HTMLSelectElement).value
            patch({ sourceUnitId: value === '' ? null : value })
          }}
        >
          <option value="">None — just add keywords</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unitLabel(unit, units)}
            </option>
          ))}
        </select>
        {sourceUnit && (
          <p class="text-xs opacity-60 mt-1">
            Shares: {sourceUnit.keywords.join(', ') || 'no keywords'}
          </p>
        )}
      </Field>

      <Field label="Keywords conferred">
        <KeywordPicker
          available={keywordSuggestions}
          selected={draft.keywords}
          onChange={(keywords) => patch({ keywords })}
          allowCustom
          placeholder="Search keywords, or type a new one…"
        />
      </Field>

      <Field label="Applied to units">
        <UnitChecklist
          units={units}
          selected={draft.unitIds}
          onChange={(unitIds) => patch({ unitIds })}
        />
      </Field>

      <Field label="Rules conferred (optional)">
        {rules.length === 0 ? (
          <p class="text-xs opacity-50">No rules to confer yet.</p>
        ) : (
          <div class="max-h-48 overflow-y-auto border border-base-content/20 rounded-lg p-2 space-y-1">
            {rules.map((rule) => (
              <label key={rule.id} class="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-base-200">
                <input
                  type="checkbox"
                  class="checkbox checkbox-xs checkbox-accent"
                  checked={draft.ruleIds.includes(rule.id)}
                  onChange={() =>
                    patch({
                      ruleIds: draft.ruleIds.includes(rule.id)
                        ? draft.ruleIds.filter((id) => id !== rule.id)
                        : [...draft.ruleIds, rule.id],
                    })
                  }
                />
                <span class="text-xs">
                  {rule.name}
                  {rule.builtIn ? ' (library)' : ''}
                </span>
              </label>
            ))}
          </div>
        )}
      </Field>

    </FormShell>
  )
}

// --- Shared bits ---------------------------------------------------------

function FormShell({
  title,
  onCancel,
  onSave,
  saveDisabled,
  children,
}: {
  title: string
  onCancel: () => void
  onSave: () => void
  saveDisabled: boolean
  children: ComponentChildren
}) {
  return (
    <div class="min-h-screen bg-base-100 text-base-content flex flex-col max-w-lg mx-auto">
      <div class="flex items-center justify-between px-4 py-3 bg-base-200 border-b border-base-content/10">
        <button class="btn btn-ghost btn-sm" onClick={onCancel}>
          ← Cancel
        </button>
        <h1 class="text-sm font-bold">{title}</h1>
        <div class="w-16" />
      </div>
      <div class="p-4 space-y-4 flex-1 overflow-y-auto">{children}</div>
      <div class="p-4 border-t border-base-content/10">
        <button class="btn btn-primary w-full" onClick={onSave} disabled={saveDisabled}>
          Save
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="form-control">
      <span class="label-text text-xs opacity-70 mb-1 block">{label}</span>
      {children}
    </div>
  )
}

function RerollRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: RerollMode
  onChange: (value: RerollMode | undefined) => void
}) {
  return (
    <div class="flex items-center justify-between gap-2 mb-1">
      <span class="text-xs">{label}</span>
      <select
        class="select select-bordered select-xs"
        value={value}
        onChange={(e) => {
          const next = (e.target as HTMLSelectElement).value as RerollMode
          onChange(next === 'none' ? undefined : next)
        }}
        aria-label={label}
      >
        {REROLL_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function UnitChecklist({
  units,
  selected,
  onChange,
}: {
  units: ParsedUnit[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  if (units.length === 0) {
    return <p class="text-xs opacity-50">Load rosters first to see units.</p>
  }
  return (
    <div class="max-h-48 overflow-y-auto border border-base-content/20 rounded-lg p-2 space-y-1">
      {units.map((unit) => (
        <label key={unit.id} class="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-base-200">
          <input
            type="checkbox"
            class="checkbox checkbox-xs checkbox-accent"
            checked={selected.includes(unit.id)}
            onChange={() =>
              onChange(
                selected.includes(unit.id)
                  ? selected.filter((id) => id !== unit.id)
                  : [...selected, unit.id]
              )
            }
          />
          <span class="text-xs">{unitLabel(unit, units)}</span>
        </label>
      ))}
    </div>
  )
}

// --- Helpers -------------------------------------------------------------

function prune(effects: RuleEffects): RuleEffects {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(effects)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    out[key] = value
  }
  return out as RuleEffects
}

function sideLabel(side: RuleSide): string {
  if (side === 'both') return 'Attacker & defender'
  return side === 'attacker' ? 'Attacker' : 'Defender'
}

function targetLabel(target: RuleTarget | undefined): string {
  if (!target || target.type === 'global') return 'all units'
  if (target.type === 'keyword')
    return (target.keywords ?? []).join(target.keywordMatch === 'all' ? ' + ' : ' / ') || 'keywords'
  return `${target.unitIds?.length ?? 0} unit(s)`
}

/** Distinguishes duplicate datasheets, e.g. two Khorne Berzerker squads. */
export function unitLabel(unit: ParsedUnit, units: ParsedUnit[]): string {
  const duplicated = units.some((other) => other.id !== unit.id && other.name === unit.name)
  if (!duplicated) return unit.name
  return `${unit.name} (${unit.modelCount} model${unit.modelCount === 1 ? '' : 's'}, ${unit.points} pts)`
}

/** Stable id so an accepted suggestion is not offered twice. */
export function suggestionId(link: ParsedAttachment): string {
  return `attach-${link.leaderUnitId}-${link.bodyguardUnitId}`
}

function describeEffects(effects: RuleEffects): string[] {
  const lines: string[] = []
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`

  for (const field of NUMBER_FIELDS) {
    const value = effects[field.key]
    if (value === undefined) continue
    lines.push(`${field.label}: ${typeof value === 'number' ? signed(value) : value}`)
  }
  for (const field of DICE_FIELDS) {
    const value = effects[field.key]
    if (value === undefined) continue
    lines.push(`${field.label}: ${value}`)
  }
  for (const field of BOOLEAN_FIELDS) {
    if (effects[field.key]) lines.push(field.label)
  }
  if (effects.hitRerolls && effects.hitRerolls !== 'none') lines.push(`Hit re-rolls: ${effects.hitRerolls}`)
  if (effects.woundRerolls && effects.woundRerolls !== 'none') lines.push(`Wound re-rolls: ${effects.woundRerolls}`)
  if (effects.anti) lines.push(`Anti-${effects.anti.keyword} ${effects.anti.threshold}+`)
  return lines
}
