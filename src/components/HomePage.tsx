import type { ParsedRoster } from '../types/roster'
import type { BattleRecord, BattleState } from '../types/battle'
import { battleHeadline } from '../lib/battle-history'
import { RosterUpload } from './RosterUpload'

interface Props {
  armyA: ParsedRoster | null
  armyB: ParsedRoster | null
  errors: { A: string | null; B: string | null }
  onUpload: (file: File, army: 'A' | 'B') => void
  /** The battle in progress, if there is one to go back to. */
  activeBattle: BattleState | null
  history: BattleRecord[]
  onCommence: () => void
  onResume: () => void
  onViewRecord: (record: BattleRecord) => void
  onDeleteRecord: (id: string) => void
  onOpenRules: () => void
}

/**
 * The landing screen: pick two armies, start a battle, or open a past one.
 *
 * Starting a battle is explicit rather than implicit in having two rosters
 * loaded, so the round counter never begins ticking before the game does.
 */
export function HomePage({
  armyA,
  armyB,
  errors,
  onUpload,
  activeBattle,
  history,
  onCommence,
  onResume,
  onViewRecord,
  onDeleteRecord,
  onOpenRules,
}: Props) {
  const bothLoaded = armyA !== null && armyB !== null

  return (
    <div class="min-h-screen bg-base-100 text-base-content flex flex-col max-w-lg mx-auto">
      <div class="px-4 pt-safe">
        <h1 class="text-xl font-bold text-center py-4">W40k Combat Math</h1>
      </div>

      <div class="px-4 pb-safe space-y-4 flex-1">
        <RosterUpload onUpload={onUpload} armyA={armyA} armyB={armyB} errors={errors} />

        {activeBattle && (
          <button class="btn btn-primary btn-block h-14 text-base" onClick={onResume}>
            Resume battle
            <span class="text-xs opacity-70">
              R{activeBattle.currentRound} {activeBattle.currentTurn} {activeBattle.currentPhase}
            </span>
          </button>
        )}

        <button
          class={`btn btn-block h-14 text-base ${activeBattle ? 'btn-outline' : 'btn-primary'}`}
          disabled={!bothLoaded}
          onClick={onCommence}
        >
          ⚔️ {activeBattle ? 'Commence new battle' : 'Commence battle'}
        </button>

        {!bothLoaded && (
          <p class="text-center text-xs opacity-50">
            Load both armies to start a battle.
          </p>
        )}
        {activeBattle && (
          <p class="text-center text-xs opacity-50">
            Starting a new battle files the current one under past battles.
          </p>
        )}

        <button class="btn btn-ghost btn-block h-12" onClick={onOpenRules}>
          ⚙️ Custom Rules
        </button>

        <PastBattles
          history={history}
          onViewRecord={onViewRecord}
          onDeleteRecord={onDeleteRecord}
        />
      </div>
    </div>
  )
}

function PastBattles({
  history,
  onViewRecord,
  onDeleteRecord,
}: {
  history: BattleRecord[]
  onViewRecord: (record: BattleRecord) => void
  onDeleteRecord: (id: string) => void
}) {
  return (
    <div class="pt-2">
      <h2 class="text-sm font-medium opacity-70 mb-2">Past battles</h2>

      {history.length === 0 ? (
        <p class="text-xs opacity-50">
          Finished battles are kept here so you can read the log back.
        </p>
      ) : (
        <ul class="rounded-box overflow-hidden border border-base-content/10 divide-y divide-base-content/10">
          {history.map((record) => (
            <li key={record.id} class="flex items-stretch bg-base-200">
              <button
                class="flex-1 min-w-0 text-left px-4 py-3 hover:bg-base-300 transition-colors"
                onClick={() => onViewRecord(record)}
              >
                <div class="text-sm font-medium truncate">
                  {record.armyAName} vs {record.armyBName}
                </div>
                <div class="text-xs opacity-60">
                  {formatWhen(record.savedAt)} · {record.completed ? 'complete' : 'abandoned'} after
                  R{record.roundsPlayed}
                </div>
                <div class="text-xs opacity-50">{battleHeadline(record)}</div>
              </button>
              <button
                class="px-4 text-error hover:bg-base-300 transition-colors"
                onClick={() => onDeleteRecord(record.id)}
                aria-label={`Delete battle ${record.armyAName} vs ${record.armyBName}`}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatWhen(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}
