import { useState } from 'preact/hooks'
import type { CustomRule, RuleEffects, RuleTarget } from '../types/rules'
import type { ParsedRoster } from '../types/roster'
import { exportRules, parseImportedRules } from '../lib/rules-storage'

interface Props {
  rules: CustomRule[]
  onSave: (rules: CustomRule[]) => void
  onBack: () => void
  armyA: ParsedRoster | null
  armyB: ParsedRoster | null
}

export function RulesPage({ rules, onSave, onBack, armyA, armyB }: Props) {
  const [editing, setEditing] = useState<CustomRule | null>(null)
  const [creating, setCreating] = useState(false)

  const handleDelete = (id: string) => {
    onSave(rules.filter(r => r.id !== id))
  }

  const handleSaveRule = (rule: CustomRule) => {
    const existing = rules.findIndex(r => r.id === rule.id)
    if (existing >= 0) {
      const updated = [...rules]
      updated[existing] = rule
      onSave(updated)
    } else {
      onSave([...rules, rule])
    }
    setEditing(null)
    setCreating(false)
  }

  const handleImport = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const imported = parseImportedRules(text)
      if (imported) {
        // Merge: add new rules, skip duplicates by ID
        const existingIds = new Set(rules.map(r => r.id))
        const newRules = imported.filter(r => !existingIds.has(r.id))
        onSave([...rules, ...newRules])
      } else {
        alert('Invalid rules file')
      }
    }
    reader.readAsText(file)
    // Reset input
    ;(e.target as HTMLInputElement).value = ''
  }

  if (editing || creating) {
    return (
      <RuleForm
        rule={editing}
        armyA={armyA}
        armyB={armyB}
        onSave={handleSaveRule}
        onCancel={() => { setEditing(null); setCreating(false) }}
      />
    )
  }

  return (
    <div class="min-h-screen bg-base-100 text-base-content flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3 bg-base-200 border-b border-base-content/10">
        <button class="btn btn-ghost btn-sm" onClick={onBack}>
          ← Back
        </button>
        <h1 class="text-sm font-bold">Custom Rules</h1>
        <div class="w-16" />
      </div>

      <div class="p-4 space-y-3 flex-1">
        {/* Import/Export buttons */}
        <div class="flex gap-2">
          <button
            class="btn btn-sm btn-outline flex-1"
            onClick={() => exportRules(rules)}
            disabled={rules.length === 0}
          >
            Export
          </button>
          <label class="btn btn-sm btn-outline flex-1">
            Import
            <input
              type="file"
              accept=".json"
              class="hidden"
              onChange={handleImport}
            />
          </label>
        </div>

        {/* Rules list */}
        {rules.length === 0 && (
          <p class="text-center opacity-50 py-8">
            No custom rules yet. Create one to get started.
          </p>
        )}

        {rules.map(rule => (
          <RuleItem
            key={rule.id}
            rule={rule}
            onEdit={() => setEditing(rule)}
            onDelete={() => handleDelete(rule.id)}
            onToggle={() => {
              const updated = rules.map(r =>
                r.id === rule.id ? { ...r, enabled: !r.enabled } : r
              )
              onSave(updated)
            }}
          />
        ))}
      </div>

      {/* Create button */}
      <div class="p-4 border-t border-base-content/10">
        <button
          class="btn btn-primary w-full"
          onClick={() => setCreating(true)}
        >
          + Create Rule
        </button>
      </div>
    </div>
  )
}

// --- Rule List Item ---

function RuleItem({
  rule,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule: CustomRule
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const targetLabel = rule.target.type === 'global'
    ? 'All units'
    : rule.target.type === 'faction'
      ? rule.target.factionKeyword ?? 'Faction'
      : `${rule.target.unitIds?.length ?? 0} unit(s)`

  const appliesToLabel = rule.appliesTo === 'both'
    ? 'Attacker & Defender'
    : rule.appliesTo === 'attacker' ? 'Attacker' : 'Defender'

  return (
    <div class="card bg-base-200">
      <div class="card-body p-3">
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            class="toggle toggle-sm toggle-accent"
            checked={rule.enabled}
            onChange={onToggle}
          />
          <div
            class="flex-1 cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
            <div class="font-medium text-sm">{rule.name}</div>
            <div class="text-xs opacity-60">
              {appliesToLabel} · {targetLabel}
            </div>
          </div>
          <button class="btn btn-ghost btn-xs" onClick={onEdit}>✏️</button>
          <button class="btn btn-ghost btn-xs text-error" onClick={onDelete}>🗑️</button>
        </div>

        {expanded && (
          <div class="mt-2 pt-2 border-t border-base-content/10 text-xs space-y-1">
            {rule.description && (
              <p class="opacity-70 italic">{rule.description}</p>
            )}
            <EffectsSummary effects={rule.effects} />
          </div>
        )}
      </div>
    </div>
  )
}

function EffectsSummary({ effects }: { effects: RuleEffects }) {
  const lines: string[] = []
  if (effects.hitModifier) lines.push(`${effects.hitModifier > 0 ? '+' : ''}${effects.hitModifier} to hit`)
  if (effects.woundModifier) lines.push(`${effects.woundModifier > 0 ? '+' : ''}${effects.woundModifier} to wound`)
  if (effects.ignoresCover) lines.push('Ignores Cover')
  if (effects.apModifier) lines.push(`${effects.apModifier > 0 ? '+' : ''}${effects.apModifier} AP`)
  if (effects.rerollHits) lines.push('Re-roll hits')
  if (effects.rerollWounds) lines.push('Re-roll wounds')
  if (effects.feelNoPain) lines.push(`Feel No Pain ${effects.feelNoPain}+`)
  if (effects.invulnOverride) lines.push(`Invulnerable Save ${effects.invulnOverride}+`)
  if (effects.bonusDamage) lines.push(`+${effects.bonusDamage} damage`)
  if (effects.critHitOn) lines.push(`Critical hits on ${effects.critHitOn}+`)
  if (effects.critWoundOn) lines.push(`Critical wounds on ${effects.critWoundOn}+`)
  if (effects.sustainedHits) lines.push(`Sustained Hits ${effects.sustainedHits}`)
  if (effects.lethalHits) lines.push('Lethal Hits')
  if (effects.saveModifier) lines.push(`${effects.saveModifier > 0 ? '+' : ''}${effects.saveModifier} to save`)

  return (
    <div class="flex flex-wrap gap-1">
      {lines.map((line, i) => (
        <span key={i} class="badge badge-sm badge-accent">{line}</span>
      ))}
    </div>
  )
}

// --- Rule Create/Edit Form ---

function RuleForm({
  rule,
  armyA,
  armyB,
  onSave,
  onCancel,
}: {
  rule: CustomRule | null
  armyA: ParsedRoster | null
  armyB: ParsedRoster | null
  onSave: (rule: CustomRule) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(rule?.name ?? '')
  const [appliesTo, setAppliesTo] = useState<'attacker' | 'defender' | 'both'>(rule?.appliesTo ?? 'attacker')
  const [targetType, setTargetType] = useState<'global' | 'faction' | 'unit'>(rule?.target.type ?? 'global')
  const [factionKeyword, setFactionKeyword] = useState(rule?.target.factionKeyword ?? '')
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>(rule?.target.unitIds ?? [])
  const [effects, setEffects] = useState<RuleEffects>(rule?.effects ?? {})
  const [description, setDescription] = useState(rule?.description ?? '')

  // Gather available factions and units from rosters
  const allUnits = [
    ...(armyA?.units ?? []),
    ...(armyB?.units ?? []),
  ]
  const factions = Array.from(new Set(
    allUnits.flatMap(u => u.keywords.filter(k => k.startsWith('Faction: ')).map(k => k.replace('Faction: ', '')))
  ))

  const handleSubmit = () => {
    if (!name.trim()) return

    const target: RuleTarget = { type: targetType }
    if (targetType === 'faction') target.factionKeyword = factionKeyword
    if (targetType === 'unit') target.unitIds = selectedUnitIds

    onSave({
      id: rule?.id ?? crypto.randomUUID(),
      name: name.trim(),
      appliesTo,
      target,
      effects,
      description: description.trim() || undefined,
      enabled: rule?.enabled ?? true,
    })
  }

  const toggleUnitId = (id: string) => {
    setSelectedUnitIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <div class="min-h-screen bg-base-100 text-base-content flex flex-col max-w-lg mx-auto">
      <div class="flex items-center justify-between px-4 py-3 bg-base-200 border-b border-base-content/10">
        <button class="btn btn-ghost btn-sm" onClick={onCancel}>
          ← Cancel
        </button>
        <h1 class="text-sm font-bold">{rule ? 'Edit Rule' : 'Create Rule'}</h1>
        <div class="w-16" />
      </div>

      <div class="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Name */}
        <div class="form-control">
          <label class="label"><span class="label-text text-xs">Rule Name</span></label>
          <input
            type="text"
            class="input input-bordered input-sm"
            placeholder="e.g. Spotted, Oath of Moment"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </div>

        {/* Description */}
        <div class="form-control">
          <label class="label"><span class="label-text text-xs">Description (optional)</span></label>
          <textarea
            class="textarea textarea-bordered textarea-sm"
            placeholder="Reminder text about when this applies"
            value={description}
            onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
          />
        </div>

        {/* Applies To */}
        <div class="form-control">
          <label class="label"><span class="label-text text-xs">Applies when unit is...</span></label>
          <div class="flex gap-2">
            {(['attacker', 'defender', 'both'] as const).map(opt => (
              <button
                key={opt}
                class={`btn btn-sm flex-1 ${appliesTo === opt ? 'btn-primary' : 'btn-ghost border border-base-content/20'}`}
                onClick={() => setAppliesTo(opt)}
              >
                {opt === 'both' ? 'Both' : opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Target Type */}
        <div class="form-control">
          <label class="label"><span class="label-text text-xs">Applies to...</span></label>
          <div class="flex gap-2">
            {(['global', 'faction', 'unit'] as const).map(opt => (
              <button
                key={opt}
                class={`btn btn-sm flex-1 ${targetType === opt ? 'btn-primary' : 'btn-ghost border border-base-content/20'}`}
                onClick={() => setTargetType(opt)}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Faction selector */}
        {targetType === 'faction' && (
          <div class="form-control">
            <label class="label"><span class="label-text text-xs">Faction</span></label>
            {factions.length === 0 ? (
              <p class="text-xs opacity-50">Load rosters first to see factions</p>
            ) : (
              <select
                class="select select-bordered select-sm"
                value={factionKeyword}
                onChange={(e) => setFactionKeyword((e.target as HTMLSelectElement).value)}
              >
                <option value="">Select faction...</option>
                {factions.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Unit multi-select */}
        {targetType === 'unit' && (
          <div class="form-control">
            <label class="label"><span class="label-text text-xs">Units (select multiple)</span></label>
            {allUnits.length === 0 ? (
              <p class="text-xs opacity-50">Load rosters first to see units</p>
            ) : (
              <div class="max-h-48 overflow-y-auto border border-base-content/20 rounded-lg p-2 space-y-1">
                {allUnits.map(unit => (
                  <label key={unit.id} class="flex items-center gap-2 cursor-pointer p-1 hover:bg-base-200 rounded">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs checkbox-accent"
                      checked={selectedUnitIds.includes(unit.id)}
                      onChange={() => toggleUnitId(unit.id)}
                    />
                    <span class="text-xs">{unit.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Effects */}
        <div class="form-control">
          <label class="label"><span class="label-text text-xs">Effects</span></label>
          <div class="space-y-2 border border-base-content/20 rounded-lg p-3">
            <EffectRow label="Hit modifier" type="number" value={effects.hitModifier} onChange={v => setEffects({ ...effects, hitModifier: v || undefined })} />
            <EffectRow label="Wound modifier" type="number" value={effects.woundModifier} onChange={v => setEffects({ ...effects, woundModifier: v || undefined })} />
            <EffectRow label="AP modifier" type="number" value={effects.apModifier} onChange={v => setEffects({ ...effects, apModifier: v || undefined })} />
            <EffectRow label="Bonus damage" type="number" value={effects.bonusDamage} onChange={v => setEffects({ ...effects, bonusDamage: v || undefined })} />
            <EffectRow label="Save modifier" type="number" value={effects.saveModifier} onChange={v => setEffects({ ...effects, saveModifier: v || undefined })} />
            <EffectRow label="Crit hits on" type="number" value={effects.critHitOn} onChange={v => setEffects({ ...effects, critHitOn: v || undefined })} placeholder="6" />
            <EffectRow label="Crit wounds on" type="number" value={effects.critWoundOn} onChange={v => setEffects({ ...effects, critWoundOn: v || undefined })} placeholder="6" />
            <EffectRow label="Sustained Hits" type="number" value={effects.sustainedHits} onChange={v => setEffects({ ...effects, sustainedHits: v || undefined })} />
            <EffectRow label="Feel No Pain" type="number" value={effects.feelNoPain} onChange={v => setEffects({ ...effects, feelNoPain: v || undefined })} />
            <EffectRow label="Invuln override" type="number" value={effects.invulnOverride} onChange={v => setEffects({ ...effects, invulnOverride: v || undefined })} />
            <EffectToggle label="Ignores Cover" value={effects.ignoresCover} onChange={v => setEffects({ ...effects, ignoresCover: v || undefined })} />
            <EffectToggle label="Re-roll hits" value={effects.rerollHits} onChange={v => setEffects({ ...effects, rerollHits: v || undefined })} />
            <EffectToggle label="Re-roll wounds" value={effects.rerollWounds} onChange={v => setEffects({ ...effects, rerollWounds: v || undefined })} />
            <EffectToggle label="Lethal Hits" value={effects.lethalHits} onChange={v => setEffects({ ...effects, lethalHits: v || undefined })} />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div class="p-4 border-t border-base-content/10">
        <button
          class="btn btn-primary w-full"
          onClick={handleSubmit}
          disabled={!name.trim()}
        >
          {rule ? 'Save Changes' : 'Create Rule'}
        </button>
      </div>
    </div>
  )
}

function EffectRow({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string
  type: 'number'
  value: number | undefined
  onChange: (v: number | undefined) => void
  placeholder?: string
}) {
  return (
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs">{label}</span>
      <input
        type={type}
        class="input input-bordered input-xs w-16 text-center"
        value={value ?? ''}
        placeholder={placeholder ?? '0'}
        onInput={(e) => {
          const v = parseInt((e.target as HTMLInputElement).value)
          onChange(isNaN(v) ? undefined : v)
        }}
      />
    </div>
  )
}

function EffectToggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | undefined
  onChange: (v: boolean | undefined) => void
}) {
  return (
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs">{label}</span>
      <input
        type="checkbox"
        class="toggle toggle-xs toggle-accent"
        checked={value ?? false}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked || undefined)}
      />
    </div>
  )
}
