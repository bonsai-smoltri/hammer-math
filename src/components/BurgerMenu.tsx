import type { ParsedRoster } from '../types/roster'

interface Props {
  armyA: ParsedRoster
  armyB: ParsedRoster
  onReplace: (file: File, army: 'A' | 'B') => void
  onClear: () => void
}

export function BurgerMenu({ armyA, armyB, onReplace, onClear }: Props) {
  return (
    <div class="dropdown dropdown-end self-center shrink-0">
      <label tabIndex={0} class="btn btn-ghost btn-sm">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </label>
      <div tabIndex={0} class="dropdown-content menu bg-base-200 rounded-box w-72 p-4 shadow-xl z-50 space-y-3">
        <h3 class="text-sm font-medium opacity-70">Loaded Armies</h3>

        {/* Army A - whole item is the replace trigger */}
        <label class="block cursor-pointer rounded-lg p-3 hover:bg-base-300 transition-colors">
          <div class="text-xs opacity-50">Army A (Attacker)</div>
          <div class="text-sm text-success">{armyA.name} ({armyA.points}pts)</div>
          <div class="text-xs text-primary mt-1">Tap to replace</div>
          <input
            type="file"
            accept=".json"
            class="hidden"
            onChange={(e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (file) onReplace(file, 'A')
            }}
          />
        </label>

        {/* Army B - whole item is the replace trigger */}
        <label class="block cursor-pointer rounded-lg p-3 hover:bg-base-300 transition-colors">
          <div class="text-xs opacity-50">Army B (Defender)</div>
          <div class="text-sm text-success">{armyB.name} ({armyB.points}pts)</div>
          <div class="text-xs text-primary mt-1">Tap to replace</div>
          <input
            type="file"
            accept=".json"
            class="hidden"
            onChange={(e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (file) onReplace(file, 'B')
            }}
          />
        </label>

        <div class="divider my-0"></div>

        <button
          class="btn btn-ghost btn-sm text-error w-full"
          onClick={onClear}
        >
          Clear both armies
        </button>
      </div>
    </div>
  )
}
