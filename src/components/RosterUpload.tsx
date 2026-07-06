import type { ParsedRoster } from '../types/roster'

interface Props {
  onUpload: (file: File, army: 'A' | 'B') => void
  armyA: ParsedRoster | null
  armyB: ParsedRoster | null
}

export function RosterUpload({ onUpload, armyA, armyB }: Props) {
  return (
    <div class="space-y-3 mb-6">
      <UploadSlot
        label="Army A (Attacker)"
        roster={armyA}
        onFile={(f) => onUpload(f, 'A')}
      />
      <UploadSlot
        label="Army B (Defender)"
        roster={armyB}
        onFile={(f) => onUpload(f, 'B')}
      />
    </div>
  )
}

function UploadSlot({
  label,
  roster,
  onFile,
}: {
  label: string
  roster: ParsedRoster | null
  onFile: (f: File) => void
}) {
  return (
    <div class="card bg-base-200">
      <div class="card-body p-4">
        <h3 class="card-title text-sm">{label}</h3>
        {roster ? (
          <div class="flex items-center justify-between">
            <span class="text-success text-sm">
              ✓ {roster.name} ({roster.points}pts, {roster.units.length} units)
            </span>
            <label class="btn btn-ghost btn-xs">
              Replace
              <input
                type="file"
                accept=".json"
                class="hidden"
                onChange={(e) => {
                  const file = (e.target as HTMLInputElement).files?.[0]
                  if (file) onFile(file)
                }}
              />
            </label>
          </div>
        ) : (
          <label class="block cursor-pointer border-2 border-dashed border-base-content/20 rounded-lg p-6 text-center opacity-60 hover:opacity-100 hover:border-primary transition-all">
            Tap to upload roster JSON
            <input
              type="file"
              accept=".json"
              class="hidden"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) onFile(file)
              }}
            />
          </label>
        )}
      </div>
    </div>
  )
}
