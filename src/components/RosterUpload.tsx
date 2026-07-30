import type { ParsedRoster } from '../types/roster'

interface Props {
  onUpload: (file: File, army: 'A' | 'B') => void
  armyA: ParsedRoster | null
  armyB: ParsedRoster | null
  errors?: { A: string | null; B: string | null }
}

export function RosterUpload({ onUpload, armyA, armyB, errors }: Props) {
  return (
    <div class="space-y-3 mb-6">
      <UploadSlot
        label="Army A (Attacker)"
        roster={armyA}
        error={errors?.A ?? null}
        onFile={(f) => onUpload(f, 'A')}
      />
      <UploadSlot
        label="Army B (Defender)"
        roster={armyB}
        error={errors?.B ?? null}
        onFile={(f) => onUpload(f, 'B')}
      />
    </div>
  )
}

function UploadSlot({
  label,
  roster,
  error,
  onFile,
}: {
  label: string
  roster: ParsedRoster | null
  error: string | null
  onFile: (f: File) => void
}) {
  return (
    <div class="card bg-base-200">
      <div class="card-body p-4 gap-2">
        <h3 class="card-title text-sm">{label}</h3>

        {error && (
          <div role="alert" class="alert alert-error py-2 text-xs">
            <span>{error}</span>
          </div>
        )}

        {roster ? (
          <>
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
            <RosterWarnings roster={roster} />
          </>
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

/**
 * Anything the parser had to guess at. Silent guesses are worse than ugly
 * warnings — a misread Toughness quietly changes every wound roll.
 */
export function RosterWarnings({ roster }: { roster: ParsedRoster }) {
  const warnings = roster.warnings ?? []
  if (warnings.length === 0) return null

  return (
    <div role="alert" class="alert alert-warning py-2 text-xs items-start">
      <div>
        <div class="font-medium">
          {warnings.length} thing{warnings.length === 1 ? '' : 's'} the parser had to guess
        </div>
        <ul class="list-disc list-inside opacity-80 mt-1">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
