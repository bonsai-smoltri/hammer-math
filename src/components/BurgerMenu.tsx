import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { ParsedRoster } from '../types/roster'
import type { BattleState, CombatPhase, PlayerTurn } from '../types/battle'
import { phaseHistory } from '../lib/battle-state'
import { RosterWarnings } from './RosterUpload'

interface Props {
  armyA: ParsedRoster
  armyB: ParsedRoster
  battleState: BattleState | null
  onReplace: (file: File, army: 'A' | 'B') => void
  onGoHome: () => void
  onClear: () => void
  onResetGame: () => void
  onOpenRules: () => void
  onAdvancePhase: () => void
  onJumpToPhase: (round: number, turn: PlayerTurn, phase: CombatPhase) => void
  onViewSummary: () => void
}

/**
 * The app's only chrome.
 *
 * Everything that is not resolving the current attack lives behind this one
 * button, including moving the battle on. Rows are full-bleed and touch-sized
 * with dividers rather than gaps, so the menu reads as a list and every row is a
 * target you cannot miss one-handed.
 */
export function BurgerMenu({
  armyA,
  armyB,
  battleState,
  onReplace,
  onGoHome,
  onClear,
  onResetGame,
  onOpenRules,
  onAdvancePhase,
  onJumpToPhase,
  onViewSummary,
}: Props) {
  const [showJump, setShowJump] = useState(false)
  const steps = battleState ? phaseHistory(battleState) : []
  const inProgress = battleState !== null && !battleState.battleComplete

  /** DaisyUI keeps the dropdown open while focus is inside it. */
  const close = () => {
    setShowJump(false)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  const run = (action: () => void) => () => {
    action()
    close()
  }

  return (
    <div class="dropdown dropdown-end shrink-0">
      <label
        tabIndex={0}
        class="btn btn-ghost h-11 w-11 min-h-11 p-0"
        aria-label="Menu"
        aria-haspopup="true"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </label>

      <div
        tabIndex={0}
        class="dropdown-content bg-base-200 rounded-box w-80 max-w-[calc(100vw-1rem)] shadow-xl z-50 overflow-hidden max-h-[85vh] overflow-y-auto"
      >
        {inProgress && (
          <MenuSection>
            <MenuItem onClick={run(onAdvancePhase)} emphasis>
              <span>Next Phase</span>
              <span class="opacity-60">
                R{battleState!.currentRound} {battleState!.currentTurn}{' '}
                {battleState!.currentPhase} →
              </span>
            </MenuItem>

            <MenuItem onClick={() => setShowJump(!showJump)} expanded={showJump}>
              <span>Jump to phase</span>
              <span aria-hidden="true">{showJump ? '▲' : '▼'}</span>
            </MenuItem>

            {showJump &&
              steps.map((step) => (
                <MenuItem
                  key={step.label}
                  onClick={run(() => onJumpToPhase(step.round, step.turn, step.phase))}
                  disabled={step.isCurrent}
                  inset
                >
                  <span class="capitalize">{step.label}</span>
                  {step.isCurrent && <span class="text-xs opacity-60">current</span>}
                </MenuItem>
              ))}
          </MenuSection>
        )}

        <MenuSection>
          {battleState && (
            <MenuItem onClick={run(onViewSummary)}>
              <span>📋 Battle log</span>
            </MenuItem>
          )}
          <MenuItem onClick={run(onGoHome)}>
            <span>🏠 Home</span>
          </MenuItem>
          <MenuItem onClick={run(onOpenRules)}>
            <span>⚙️ Custom rules</span>
          </MenuItem>
        </MenuSection>

        <MenuSection label="Loaded armies">
          <ArmyRow label="Army A" roster={armyA} onFile={(f) => onReplace(f, 'A')} />
          <ArmyRow label="Army B" roster={armyB} onFile={(f) => onReplace(f, 'B')} />
        </MenuSection>

        <MenuSection>
          <MenuItem onClick={run(onResetGame)} tone="warning">
            <span>Reset battle</span>
          </MenuItem>
          <MenuItem onClick={run(onClear)} tone="error">
            <span>Clear both armies</span>
          </MenuItem>
        </MenuSection>
      </div>
    </div>
  )
}

function MenuSection({ label, children }: { label?: string; children: ComponentChildren }) {
  return (
    <div class="border-b border-base-content/10 last:border-b-0">
      {label && <div class="px-4 pt-3 pb-1 text-xs uppercase opacity-40">{label}</div>}
      <div class="divide-y divide-base-content/5">{children}</div>
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  disabled = false,
  emphasis = false,
  inset = false,
  expanded,
  tone,
}: {
  children: ComponentChildren
  onClick: () => void
  disabled?: boolean
  emphasis?: boolean
  inset?: boolean
  expanded?: boolean
  tone?: 'warning' | 'error'
}) {
  const toneClass =
    tone === 'warning' ? 'text-warning' : tone === 'error' ? 'text-error' : ''
  return (
    <button
      class={`w-full flex items-center justify-between gap-2 text-left min-h-12 px-4 py-3 text-sm
        ${emphasis ? 'font-medium bg-primary/15' : ''}
        ${inset ? 'pl-8 text-xs' : ''}
        ${disabled ? 'opacity-40' : 'hover:bg-base-300 active:bg-base-300'}
        ${toneClass}`}
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expanded}
    >
      {children}
    </button>
  )
}

/** The whole row is the replace trigger, so it is a big target. */
function ArmyRow({
  label,
  roster,
  onFile,
}: {
  label: string
  roster: ParsedRoster
  onFile: (file: File) => void
}) {
  return (
    <>
      <label class="w-full flex items-center justify-between gap-2 min-h-12 px-4 py-3 cursor-pointer hover:bg-base-300 active:bg-base-300">
        <span class="min-w-0">
          <span class="block text-xs opacity-50">{label}</span>
          <span class="block text-sm truncate">
            {roster.name} ({roster.points}pts)
          </span>
        </span>
        <span class="text-xs text-primary shrink-0">Replace</span>
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
      <div class="px-4">
        <RosterWarnings roster={roster} />
      </div>
    </>
  )
}
