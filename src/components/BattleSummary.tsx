import { useState } from 'preact/hooks'
import type { BattleState, BattleAction, PlayerTurn, CombatPhase } from '../types/battle'

interface Props {
  battleState: BattleState
  onDismiss: () => void
}

/** Check if an action is a "highlight" worth showing in the simplified view */
function isHighlight(action: BattleAction): boolean {
  if (action.type === 'attack') {
    if (action.defenderModelsRemaining === 0) return true
    if (action.modelsRemoved > 0) return true
    if (action.defenderModelsRemaining === 1 && action.defenderWoundsPerModel > 1) {
      const halfWounds = Math.ceil(action.defenderWoundsPerModel / 2)
      if (action.defenderWoundsRemaining < halfWounds) return true
    }
    return false
  }
  if (action.type === 'heal') {
    if (action.modelsRestored > 0) return true
    return false
  }
  return false
}

function formatAction(action: BattleAction): string {
  if (action.type === 'attack') {
    const kills = action.modelsRemoved > 0
      ? ` (${action.modelsRemoved} killed)`
      : ''
    return `${action.attackerUnitName} → ${action.defenderUnitName} w/ ${action.weaponName}: ${action.woundsDealt}W${kills}`
  }
  if (action.type === 'heal') {
    const models = action.modelsRestored > 0
      ? `, +${action.modelsRestored} model${action.modelsRestored > 1 ? 's' : ''}`
      : ''
    return `🩹 ${action.unitName}: +${action.woundsRestored}W healed${models}`
  }
  return ''
}

type PhaseKey = `${number}-${PlayerTurn}-${CombatPhase}`

const phaseOrder: [PlayerTurn, CombatPhase][] = [
  ['attacker', 'shooting'],
  ['attacker', 'fight'],
  ['defender', 'shooting'],
  ['defender', 'fight'],
]

export function BattleSummary({ battleState, onDismiss }: Props) {
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set())

  const toggleRound = (round: number) => {
    const next = new Set(expandedRounds)
    if (next.has(round)) next.delete(round)
    else next.add(round)
    setExpandedRounds(next)
  }

  const allActions = battleState.rounds.flatMap(r => r.actions)

  // Group for expanded view
  const grouped = new Map<PhaseKey, BattleAction[]>()
  for (const action of allActions) {
    const key: PhaseKey = `${action.round}-${action.turn}-${action.phase}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(action)
  }

  return (
    <div class="min-h-screen bg-base-100 text-base-content flex flex-col max-w-lg mx-auto">
      <div class="flex items-center justify-between px-4 py-3 bg-base-200 border-b border-base-content/10">
        <h1 class="text-lg font-bold">Battle Summary</h1>
        <button class="btn btn-ghost btn-sm" onClick={onDismiss}>
          ✕
        </button>
      </div>

      <div class="p-4 space-y-3 flex-1 overflow-y-auto">
        {allActions.length === 0 && (
          <p class="text-center opacity-50 mt-8">No actions recorded</p>
        )}

        {battleState.rounds.map(round => {
          const roundActions = allActions.filter(a => a.round === round.number)
          if (roundActions.length === 0) return null

          const highlights = roundActions.filter(isHighlight)
          const isExpanded = expandedRounds.has(round.number)

          return (
            <div key={round.number} class="card bg-base-200">
              {/* Round header — tap to expand full log */}
              <button
                class="w-full text-left px-4 py-3 flex items-center justify-between"
                onClick={() => toggleRound(round.number)}
              >
                <span class="text-sm font-bold">Round {round.number}</span>
                <span class="text-xs opacity-50">
                  {roundActions.length} action{roundActions.length > 1 ? 's' : ''} {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              <div class="px-4 pb-3">
                {/* Simplified highlights */}
                {!isExpanded && (
                  <div class="space-y-2">
                    {highlights.length > 0 ? highlights.map(action => (
                      <HighlightItem key={action.id} action={action} />
                    )) : (
                      <div class="text-xs opacity-40">No models removed or restored</div>
                    )}
                  </div>
                )}

                {/* Expanded full log */}
                {isExpanded && (
                  <div class="space-y-2 pt-1">
                    {phaseOrder.map(([turn, phase]) => {
                      const key: PhaseKey = `${round.number}-${turn}-${phase}`
                      const actions = grouped.get(key)
                      if (!actions || actions.length === 0) return null

                      return (
                        <div key={key}>
                          <div class="text-xs font-medium opacity-50 capitalize mb-1">
                            {turn} — {phase}
                          </div>
                          <div class="space-y-0.5 pl-2 border-l-2 border-base-content/10">
                            {actions.map(action => (
                              <div key={action.id} class="text-xs">
                                {formatAction(action)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HighlightItem({ action }: { action: BattleAction }) {
  if (action.type === 'attack') {
    const isDestroyed = action.defenderModelsRemaining === 0
    const isCriticalWound = action.modelsRemoved === 0 // single model below half

    if (isDestroyed) {
      return (
        <div class="flex items-center gap-3">
          <div class="text-lg">💀</div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">{action.defenderUnitName}</div>
            <div class="text-xs opacity-50">destroyed by {action.attackerUnitName}</div>
          </div>
        </div>
      )
    }

    if (isCriticalWound) {
      return (
        <div class="flex items-center gap-3">
          <div class="text-lg">🩸</div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">{action.defenderUnitName}</div>
            <div class="text-xs opacity-50">below half wounds — {action.attackerUnitName} w/ {action.weaponName}</div>
          </div>
        </div>
      )
    }

    // Models removed
    return (
      <div class="flex items-center gap-3">
        <div class="text-lg">⚔️</div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">{action.modelsRemoved} × {action.defenderUnitName}</div>
          <div class="text-xs opacity-50">models killed — {action.attackerUnitName} w/ {action.weaponName}</div>
        </div>
      </div>
    )
  }

  if (action.type === 'heal') {
    return (
      <div class="flex items-center gap-3">
        <div class="text-lg">🩹</div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">{action.modelsRestored} × {action.unitName}</div>
          <div class="text-xs opacity-50">models restored</div>
        </div>
      </div>
    )
  }

  return null
}
