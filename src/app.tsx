import { useState, useEffect, useMemo } from 'preact/hooks'
import { BurgerMenu } from './components/BurgerMenu'
import { HomePage } from './components/HomePage'
import { UnitPicker } from './components/UnitPicker'
import { WeaponSelector } from './components/WeaponSelector'
import { AttackSummary } from './components/AttackSummary'
import { ProfilePanel } from './components/ProfilePanel'
import { BattleSummary } from './components/BattleSummary'
import { WoundInput } from './components/WoundInput'
import { parseRoster } from './lib/roster-parser'
import { RulesPage } from './components/RulesPage'
import { saveRoster, loadRoster, clearRosters, saveGameState, loadGameState, clearGameState, loadShowDamageEstimates, saveShowDamageEstimates } from './lib/storage'
import {
  addBattleRecord,
  hasRecordedActions,
  loadBattleHistory,
  removeBattleRecord,
  saveBattleHistory,
  toBattleRecord,
} from './lib/battle-history'
import { emptyPayload, loadRulesPayload, saveRulesPayload, type RulesPayload } from './lib/rules-storage'
import {
  createBattleState,
  advancePhase,
  jumpToPhase,
  applyAttack,
  setBattleShocked,
  setUnitWounds,
  weaponUsage,
} from './lib/battle-state'
import type { ParsedAttachment, ParsedRoster, ParsedUnit, ParsedWeapon } from './types/roster'
import type { BattleRecord, BattleState } from './types/battle'
import type { KeywordAttachment } from './types/rules'
import type { DamageResult } from './lib/battle-state'

/** Which screen is showing. There is no router: the app is four screens deep. */
type View = 'home' | 'combat' | 'rules' | 'summary'

export function App() {
  const [armyA, setArmyA] = useState<ParsedRoster | null>(null)
  const [armyB, setArmyB] = useState<ParsedRoster | null>(null)
  const [attackingUnit, setAttackingUnit] = useState<ParsedUnit | null>(null)
  const [defendingUnit, setDefendingUnit] = useState<ParsedUnit | null>(null)
  const [selectedWeapon, setSelectedWeapon] = useState<ParsedWeapon | null>(null)
  const [picking, setPicking] = useState<'attacker' | 'defender' | null>(null)
  const [battleState, setBattleState] = useState<BattleState | null>(null)
  const [swapped, setSwapped] = useState(false)
  const [view, setView] = useState<View>('home')
  /** Set when reading back a past battle rather than the live one. */
  const [viewingRecord, setViewingRecord] = useState<BattleRecord | null>(null)
  const [history, setHistory] = useState<BattleRecord[]>([])
  const [rulesPayload, setRulesPayload] = useState<RulesPayload>(emptyPayload())
  const [showDamageEstimates, setShowDamageEstimates] = useState(false)
  const [rosterErrors, setRosterErrors] = useState<{ A: string | null; B: string | null }>({
    A: null,
    B: null,
  })

  // Load rosters and game state from localStorage on mount
  useEffect(() => {
    const storedA = loadRoster('A')
    const storedB = loadRoster('B')
    if (storedA) setArmyA(storedA)
    if (storedB) setArmyB(storedB)

    // Load custom rules and keyword attachments
    setRulesPayload(loadRulesPayload())
    setHistory(loadBattleHistory())
    setShowDamageEstimates(loadShowDamageEstimates())

    // Restore game state
    const savedGame = loadGameState()
    if (savedGame && storedA && storedB) {
      if (savedGame.battleState) {
        setBattleState(savedGame.battleState)
        // A battle already under way is what you want on screen after the phone
        // locks mid-game, so skip the home screen in that case.
        setView('combat')
      }
      setSwapped(savedGame.swapped ?? false)

      const allUnits = [...storedA.units, ...storedB.units]

      if (savedGame.attackingUnitId) {
        const unit = allUnits.find(u => u.id === savedGame.attackingUnitId)
        if (unit) setAttackingUnit(unit)
      }
      if (savedGame.defendingUnitId) {
        const unit = allUnits.find(u => u.id === savedGame.defendingUnitId)
        if (unit) setDefendingUnit(unit)
      }
      if (savedGame.selectedWeaponName && savedGame.attackingUnitId) {
        const attacker = allUnits.find(u => u.id === savedGame.attackingUnitId)
        if (attacker) {
          const weapon = attacker.weapons.find(w => w.name === savedGame.selectedWeaponName)
          if (weapon) setSelectedWeapon(weapon)
        }
      }
    }
  }, [])

  // Persist game state to localStorage on every change
  useEffect(() => {
    if (battleState || attackingUnit || defendingUnit || selectedWeapon) {
      saveGameState({
        battleState,
        attackingUnitId: attackingUnit?.id ?? null,
        defendingUnitId: defendingUnit?.id ?? null,
        selectedWeaponName: selectedWeapon?.name ?? null,
        swapped,
      })
    }
  }, [battleState, attackingUnit, defendingUnit, selectedWeapon, swapped])

  /**
   * Files the battle in progress under past battles, if anything happened in it.
   * Called whenever a battle leaves the active slot, so it is the only place
   * history is written and a battle can never be archived twice.
   */
  const archiveActiveBattle = (state: BattleState | null, aName?: string, bName?: string) => {
    if (!state || !hasRecordedActions(state)) return
    const record = toBattleRecord(
      state,
      aName ?? armyA?.name ?? 'Army A',
      bName ?? armyB?.name ?? 'Army B'
    )
    const next = addBattleRecord(history, record)
    setHistory(next)
    saveBattleHistory(next)
  }

  const clearSelections = () => {
    setAttackingUnit(null)
    setDefendingUnit(null)
    setSelectedWeapon(null)
    setPicking(null)
    setSwapped(false)
  }

  const handleRosterUpload = (file: File, army: 'A' | 'B') => {
    const reader = new FileReader()
    reader.onerror = () =>
      setRosterErrors((prev) => ({ ...prev, [army]: `Could not read ${file.name}.` }))
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string)
        const parsed = parseRoster(json)
        if (parsed.units.length === 0) {
          setRosterErrors((prev) => ({
            ...prev,
            [army]: `No units found in ${file.name}. Export the roster as BattleScribe JSON, not .ros.`,
          }))
          return
        }
        setRosterErrors((prev) => ({ ...prev, [army]: null }))
        saveRoster(army, parsed)
        // Changing an army ends the battle it was fighting.
        archiveActiveBattle(battleState)
        if (army === 'A') setArmyA(parsed)
        else setArmyB(parsed)
        clearSelections()
        clearGameState()
        setBattleState(null)
        setView('home')
      } catch (err) {
        console.error('Failed to parse roster:', err)
        setRosterErrors((prev) => ({
          ...prev,
          [army]: `${file.name} is not valid JSON.`,
        }))
      }
    }
    reader.readAsText(file)
  }

  const handleClear = () => {
    archiveActiveBattle(battleState)
    clearRosters()
    clearGameState()
    setArmyA(null)
    setArmyB(null)
    clearSelections()
    setBattleState(null)
    setView('home')
  }

  /** Starts a fresh battle with the loaded armies, filing away any current one. */
  const handleCommence = () => {
    if (!armyA || !armyB) return
    archiveActiveBattle(battleState)
    clearGameState()
    clearSelections()
    setBattleState(createBattleState(armyA, armyB))
    setView('combat')
  }

  const handleResetGame = () => {
    archiveActiveBattle(battleState)
    clearGameState()
    clearSelections()
    if (armyA && armyB) {
      setBattleState(createBattleState(armyA, armyB))
      setView('combat')
    } else {
      setBattleState(null)
      setView('home')
    }
  }

  const handleDeleteRecord = (id: string) => {
    const next = removeBattleRecord(history, id)
    setHistory(next)
    saveBattleHistory(next)
  }

  const handleSaveRules = (payload: RulesPayload) => {
    setRulesPayload(payload)
    saveRulesPayload(payload)
  }

  const handleToggleDamageEstimates = () => {
    const next = !showDamageEstimates
    setShowDamageEstimates(next)
    saveShowDamageEstimates(next)
  }

  const handleSwap = () => {
    setSwapped(!swapped)
    setAttackingUnit(null)
    setDefendingUnit(null)
    setSelectedWeapon(null)
  }

  const handleAdvancePhase = () => {
    if (battleState) {
      const newState = advancePhase(battleState)
      setBattleState(newState)
      // Clear unit/weapon selections when turn changes
      if (newState.currentTurn !== battleState.currentTurn || newState.currentRound !== battleState.currentRound) {
        setAttackingUnit(null)
        setDefendingUnit(null)
        setSelectedWeapon(null)
      }
      setSwapped(false)
      if (newState.battleComplete) {
        setViewingRecord(null)
        setView('summary')
      }
    }
  }

  // Determine which roster is attacking/defending based on current turn and swap toggle
  const isDefenderTurn = battleState?.currentTurn === 'defender'
  const flipped = swapped ? !isDefenderTurn : isDefenderTurn
  const attackingRoster = flipped ? armyB : armyA
  const defendingRoster = flipped ? armyA : armyB

  const handleAttackConfirm = (woundsDealt: number, damageResult: DamageResult) => {
    if (!battleState || !attackingUnit || !defendingUnit || !selectedWeapon) return

    const newState = applyAttack(
      battleState,
      attackingUnit.id,
      attackingUnit.name,
      selectedWeapon.name,
      defendingUnit.id,
      defendingUnit.name,
      woundsDealt,
      damageResult
    )
    setBattleState(newState)
  }

  const bothLoaded = armyA !== null && armyB !== null

  const allUnits = useMemo(
    () => [...(armyA?.units ?? []), ...(armyB?.units ?? [])],
    [armyA, armyB]
  )

  /**
   * Only attachments the roster explicitly marks are applied. A Leader ability
   * saying a Character *can* join a squad is not a statement that it did, so
   * those are offered as suggestions on the Attachments tab instead.
   */
  const rosterAttachments = useMemo<KeywordAttachment[]>(() => {
    const out: KeywordAttachment[] = []
    for (const link of [...(armyA?.attachments ?? []), ...(armyB?.attachments ?? [])]) {
      const id = `attach-${link.leaderUnitId}-${link.bodyguardUnitId}`
      out.push({
        id,
        name: `${link.leaderName} leads ${link.bodyguardName}`,
        keywords: [],
        ruleIds: [],
        unitIds: [link.bodyguardUnitId],
        sourceUnitId: link.leaderUnitId,
        enabled: !rulesPayload.disabledAttachmentIds.includes(id),
      })
    }
    return out
  }, [armyA, armyB, rulesPayload.disabledAttachmentIds])

  const attachmentSuggestions = useMemo<ParsedAttachment[]>(
    () => [...(armyA?.attachmentCandidates ?? []), ...(armyB?.attachmentCandidates ?? [])],
    [armyA, armyB]
  )

  const attachments = useMemo(
    () => [...rosterAttachments, ...rulesPayload.attachments],
    [rosterAttachments, rulesPayload.attachments]
  )

  const attackerWoundState = battleState && attackingUnit
    ? battleState.unitWounds[attackingUnit.id] ?? null
    : null

  /** Weapons this unit has already attacked with this round — an indicator only. */
  const attackerWeaponUsage = useMemo(
    () =>
      battleState && attackingUnit ? weaponUsage(battleState, attackingUnit.id) : undefined,
    [battleState, attackingUnit]
  )

  const defenderWoundState = battleState && defendingUnit
    ? battleState.unitWounds[defendingUnit.id] ?? null
    : null

  // Surviving models drive the attacker's effective model count
  const effectiveAttacker = attackingUnit && attackerWoundState
    ? { ...attackingUnit, modelCount: attackerWoundState.woundsRemaining.length }
    : attackingUnit

  const effectiveDefender = defendingUnit && defenderWoundState
    ? { ...defendingUnit, modelCount: defenderWoundState.woundsRemaining.length }
    : defendingUnit

  /** Weapons are lost with the models carrying them. */
  const defaultWeaponCount = (() => {
    if (!selectedWeapon || !attackingUnit) return undefined
    const count = selectedWeapon.count ?? attackingUnit.modelCount
    if (!attackerWoundState || attackerWoundState.startingModelCount <= 1) return count
    const survivors = attackerWoundState.woundsRemaining.length
    if (survivors >= attackerWoundState.startingModelCount) return count
    return Math.max(0, Math.round((count * survivors) / attackerWoundState.startingModelCount))
  })()

  const baseOptions = useMemo(
    () => ({
      attackerBattleShocked: attackerWoundState?.battleShocked ?? false,
      targetBattleShocked: defenderWoundState?.battleShocked ?? false,
    }),
    [attackerWoundState?.battleShocked, defenderWoundState?.battleShocked]
  )

  // Show rules page
  if (view === 'rules') {
    return (
      <RulesPage
        payload={rulesPayload}
        onChange={handleSaveRules}
        onBack={() => setView(battleState ? 'combat' : 'home')}
        units={allUnits}
        rosterAttachments={rosterAttachments}
        suggestions={attachmentSuggestions}
      />
    )
  }

  // Battle log — either the live battle or one read back from history
  if (view === 'summary') {
    const shown = viewingRecord?.state ?? battleState
    if (shown) {
      return (
        <BattleSummary
          battleState={shown}
          onDismiss={() => {
            const cameFromHistory = viewingRecord !== null
            setViewingRecord(null)
            setView(cameFromHistory || !battleState ? 'home' : 'combat')
          }}
        />
      )
    }
  }

  if (view === 'home' || !bothLoaded || !battleState) {
    return (
      <HomePage
        armyA={armyA}
        armyB={armyB}
        errors={rosterErrors}
        onUpload={handleRosterUpload}
        activeBattle={battleState}
        history={history}
        onCommence={handleCommence}
        onResume={() => setView('combat')}
        onViewRecord={(record) => {
          setViewingRecord(record)
          setView('summary')
        }}
        onDeleteRecord={handleDeleteRecord}
        onOpenRules={() => setView('rules')}
      />
    )
  }

  return (
    <div class="min-h-screen bg-base-100 text-base-content flex flex-col max-w-lg mx-auto">
      {/* Sticky header: round/phase + the one menu, always in reach */}
      <div class="sticky top-0 z-40 bg-base-200/95 backdrop-blur border-b border-base-content/10 pt-safe">
        <div class="flex items-center justify-between gap-2 px-3 py-1">
          <div class="text-sm font-medium min-w-0">
            {battleState.battleComplete ? (
              <span class="text-success">Battle complete</span>
            ) : (
              <>
                <span class="opacity-60">R{battleState.currentRound}</span>{' '}
                <span class="capitalize">{battleState.currentTurn}</span>{' '}
                <span class="capitalize">{battleState.currentPhase}</span>
              </>
            )}
          </div>
          <BurgerMenu
            armyA={armyA}
            armyB={armyB}
            battleState={battleState}
            onReplace={handleRosterUpload}
            onGoHome={() => setView('home')}
            onClear={handleClear}
            onResetGame={handleResetGame}
            onOpenRules={() => setView('rules')}
            onAdvancePhase={handleAdvancePhase}
            onJumpToPhase={(round, turn, phase) => {
              setBattleState(jumpToPhase(battleState, round, turn, phase))
              clearSelections()
            }}
            onViewSummary={() => {
              setViewingRecord(null)
              setView('summary')
            }}
            showDamageEstimates={showDamageEstimates}
            onToggleDamageEstimates={handleToggleDamageEstimates}
          />
        </div>
      </div>

      {/* Attacker | swap | Defender */}
      <div class="flex items-center border-b border-base-content/10">
        <button
          class={`flex-1 min-w-0 py-3 px-2 text-center text-sm font-medium transition-colors ${
            picking === 'attacker' ? 'bg-primary text-primary-content' : 'hover:bg-base-200'
          }`}
          onClick={() => setPicking(picking === 'attacker' ? null : 'attacker')}
        >
          <div class="text-xs opacity-60">Attacker</div>
          <div class="truncate">{attackingUnit?.name ?? '—'}</div>
        </button>

        <button
          class="btn btn-ghost h-11 w-11 min-h-11 p-0 self-center shrink-0"
          onClick={handleSwap}
          aria-label="Swap attacker and defender"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>

        <button
          class={`flex-1 min-w-0 py-3 px-2 text-center text-sm font-medium transition-colors ${
            picking === 'defender' ? 'bg-secondary text-secondary-content' : 'hover:bg-base-200'
          }`}
          onClick={() => setPicking(picking === 'defender' ? null : 'defender')}
        >
          <div class="text-xs opacity-60">Defender</div>
          <div class="truncate">{defendingUnit?.name ?? '—'}</div>
        </button>
      </div>

      {/* Collapsible profiles: stats, wounds, battle-shock, battlefield abilities */}
      {!picking && (
        <ProfilePanel
          attacker={attackingUnit}
          defender={defendingUnit}
          attackerWounds={attackerWoundState}
          defenderWounds={defenderWoundState}
          rules={rulesPayload.rules}
          attachments={attachments}
          allUnits={allUnits}
          onSetWounds={(unitId, total) => setBattleState(setUnitWounds(battleState, unitId, total))}
          onSetBattleShocked={(unitId, value) =>
            setBattleState(setBattleShocked(battleState, unitId, value))
          }
        />
      )}

      {/* Unit picker dropdown */}
      {picking === 'attacker' && (
        <UnitPicker
          roster={attackingRoster!}
          onSelect={(unit) => {
            setAttackingUnit(unit)
            setSelectedWeapon(null)
            setPicking(null)
          }}
          unitWounds={battleState.unitWounds}
        />
      )}
      {picking === 'defender' && (
        <UnitPicker
          roster={defendingRoster!}
          onSelect={(unit) => {
            setDefendingUnit(unit)
            setPicking(null)
          }}
          unitWounds={battleState.unitWounds}
        />
      )}

      {/* Main content */}
      {!picking && (
        <div class="p-4 pb-safe space-y-4 flex-1">
          {attackingUnit && (
            <WeaponSelector
              unit={attackingUnit}
              selected={selectedWeapon}
              onSelect={setSelectedWeapon}
              usage={attackerWeaponUsage}
            />
          )}

          {selectedWeapon && effectiveDefender && effectiveAttacker && (
            <AttackSummary
              attacker={effectiveAttacker}
              weapon={selectedWeapon}
              defender={effectiveDefender}
              rules={rulesPayload.rules}
              attachments={attachments}
              pinnedRuleIds={rulesPayload.pinnedRuleIds}
              allUnits={allUnits}
              baseOptions={baseOptions}
              defaultWeaponCount={defaultWeaponCount}
              showDamageEstimates={showDamageEstimates}
            />
          )}

          {selectedWeapon && defendingUnit && effectiveAttacker && defenderWoundState && !defenderWoundState.isDead && (
            <WoundInput
              weapon={selectedWeapon}
              defenderWoundState={defenderWoundState}
              onConfirm={handleAttackConfirm}
            />
          )}

          {defenderWoundState?.isDead && (
            <div class="card bg-base-200 p-4 text-center">
              <span class="text-2xl">💀</span>
              <p class="font-bold text-error mt-1">Unit Destroyed</p>
            </div>
          )}

          {!attackingUnit && !defendingUnit && (
            <p class="text-center opacity-50 mt-8">
              Select an attacker and defender to begin
            </p>
          )}
        </div>
      )}
    </div>
  )
}
