import { useMemo, useState } from 'preact/hooks'
import { normalizeKeyword } from '../lib/rules/keywords'

interface Props {
  /** Keywords available from the loaded armies. */
  available: string[]
  selected: string[]
  onChange: (keywords: string[]) => void
  /** Allow keywords that are not in any loaded army (e.g. 'Stealth'). */
  allowCustom?: boolean
  placeholder?: string
}

/**
 * Searchable keyword multi-select.
 *
 * The list is the keywords parsed from the loaded rosters, so it stays in sync
 * with the armies rather than being a hardcoded set. Faction keywords are in the
 * same list — a faction keyword is just a keyword.
 */
export function KeywordPicker({
  available,
  selected,
  onChange,
  allowCustom = false,
  placeholder = 'Search keywords…',
}: Props) {
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pool = available.filter((keyword) => !isSelected(selected, keyword))
    if (!needle) return pool
    return pool.filter((keyword) => keyword.toLowerCase().includes(needle))
  }, [available, selected, query])

  const trimmedQuery = query.trim()
  const canAddCustom =
    allowCustom &&
    trimmedQuery.length > 0 &&
    !isSelected(selected, trimmedQuery) &&
    !available.some((keyword) => normalizeKeyword(keyword) === normalizeKeyword(trimmedQuery))

  const add = (keyword: string) => {
    onChange([...selected, keyword])
    setQuery('')
  }

  const remove = (keyword: string) =>
    onChange(selected.filter((k) => normalizeKeyword(k) !== normalizeKeyword(keyword)))

  return (
    <div class="space-y-2">
      {/* Selected */}
      {selected.length > 0 && (
        <div class="flex flex-wrap gap-1">
          {selected.map((keyword) => (
            <button
              key={keyword}
              class="badge badge-sm badge-primary gap-1"
              onClick={() => remove(keyword)}
              aria-label={`Remove ${keyword}`}
            >
              {keyword}
              <span aria-hidden="true">✕</span>
            </button>
          ))}
        </div>
      )}

      <input
        type="search"
        class="input input-bordered input-sm w-full"
        placeholder={placeholder}
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        aria-label="Search keywords"
      />

      {available.length === 0 && !allowCustom && (
        <p class="text-xs opacity-50">Load rosters to see their keywords.</p>
      )}

      {(matches.length > 0 || canAddCustom) && (
        <div class="max-h-40 overflow-y-auto border border-base-content/20 rounded-lg p-2 flex flex-wrap gap-1">
          {canAddCustom && (
            <button class="badge badge-sm badge-accent gap-1" onClick={() => add(trimmedQuery)}>
              <span aria-hidden="true">+</span> {trimmedQuery}
            </button>
          )}
          {matches.map((keyword) => (
            <button
              key={keyword}
              class="badge badge-sm badge-ghost hover:badge-primary"
              onClick={() => add(keyword)}
            >
              {keyword}
            </button>
          ))}
        </div>
      )}

      {matches.length === 0 && !canAddCustom && available.length > 0 && (
        <p class="text-xs opacity-50">
          {selected.length === available.length ? 'All keywords selected.' : 'No keywords match.'}
        </p>
      )}
    </div>
  )
}

function isSelected(selected: string[], keyword: string): boolean {
  const needle = normalizeKeyword(keyword)
  return selected.some((k) => normalizeKeyword(k) === needle)
}
