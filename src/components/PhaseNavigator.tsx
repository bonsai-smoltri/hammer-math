import { useState, useRef } from 'preact/hooks'
import type { BattleState } from '../types/battle'
import type { PlayerTurn } from '../types/battle'
import type { CombatPhase } from '../types/battle'

interface PhaseStep {
  round: number
  turn: PlayerTurn
  phase: CombatPhase
  label: string
}

interface Props {
  battleState: BattleState
  onAdvance: () => void
  onJumpTo: (round: number, turn: PlayerTurn, phase: CombatPhase) => void
  onViewSummary?: () => void
}

const HOLD_DELAY = 500 // ms to trigger dropdown

export function PhaseNavigator({ battleState, onAdvance, onJumpTo, onViewSummary }: Props) {
  const [showDropdown, setShowDropdown] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didHold = useRef(false)

  // Build list of all phases from start to current
  const phases: PhaseStep[] = []
  const phaseOrder: [PlayerTurn, CombatPhase][] = [
    ['attacker', 'shooting'],
    ['attacker', 'fight'],
    ['defender', 'shooting'],
    ['defender', 'fight'],
  ]

  for (let r = 1; r <= battleState.currentRound; r++) {
    for (const [turn, phase] of phaseOrder) {
      phases.push({
        round: r,
        turn,
        phase,
        label: `R${r} ${turn} ${phase}`,
      })
      // Stop at current position
      if (r === battleState.currentRound && turn === battleState.currentTurn && phase === battleState.currentPhase) {
        break
      }
    }
    // If we've reached the current round, the inner break handles it
    if (r === battleState.currentRound) break
  }

  const handlePointerDown = () => {
    didHold.current = false
    holdTimer.current = setTimeout(() => {
      didHold.current = true
      setShowDropdown(true)
    }, HOLD_DELAY)
  }

  const handlePointerUp = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    if (!didHold.current) {
      onAdvance()
    }
  }

  const handlePointerLeave = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  const handleSelect = (step: PhaseStep) => {
    setShowDropdown(false)
    onJumpTo(step.round, step.turn, step.phase)
  }

  if (battleState.battleComplete) {
    return (
      <button class="btn btn-ghost btn-xs text-success" onClick={onViewSummary}>
        View Summary
      </button>
    )
  }

  return (
    <div class="relative">
      <button
        class="btn btn-ghost btn-xs select-none"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        Next Phase →
      </button>

      {showDropdown && (
        <>
          {/* Backdrop */}
          <div
            class="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          {/* Dropdown */}
          <div class="absolute right-0 top-full mt-1 z-50 bg-base-200 border border-base-content/10 rounded-lg shadow-xl max-h-60 overflow-y-auto w-52">
            <div class="p-2 text-xs opacity-50 font-medium">Jump to phase</div>
            {phases.map((step, i) => {
              const isCurrent = i === phases.length - 1
              return (
                <button
                  key={i}
                  class={`w-full text-left px-3 py-2 text-sm hover:bg-base-300 transition-colors ${
                    isCurrent ? 'opacity-50' : ''
                  }`}
                  onClick={() => handleSelect(step)}
                  disabled={isCurrent}
                >
                  <span class="capitalize">{step.label}</span>
                  {isCurrent && <span class="ml-2 text-xs opacity-60">(current)</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
