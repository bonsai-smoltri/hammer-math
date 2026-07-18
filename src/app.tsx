import { useState, useEffect } from 'preact/hooks'
import { RosterUpload } from './components/RosterUpload'
import { BurgerMenu } from './components/BurgerMenu'
import { UnitPicker } from './components/UnitPicker'
import { WeaponSelector } from './components/WeaponSelector'
import { AttackSummary } from './components/AttackSummary'
import { DefenderStats } from './components/DefenderStats'
import { HealUnit } from './components/HealUnit'
import { PhaseNavigator } from './components/PhaseNavigator'
import { BattleSummary } from './components/BattleSummary'
import { WoundInput } from './components/WoundInput'
import { parseRoster } from './lib/roster-parser'
import { RulesPage } from './components/RulesPage'
import { saveRoster, loadRoster, clearRosters, saveGameState, loadGameState, clearGameState } from './lib/storage'
import { saveRules, loadRules } from './lib/rules-storage'
import { createBattleState, advancePhase, jumpToPhase, applyAttack, applyHeal } from './lib/battle-state'
import { estimateWounds } from './lib/combat-math'
import type { ParsedRoster, ParsedUnit, ParsedWeapon } from './types/roster'
import type { BattleState } from './types/battle'
import type { CustomRule } from './types/rules'
import type { DamageResult } from './lib/battle-state'

export function App() {
  const [armyA, setArmyA] = useState<ParsedRoster | null>(null)
  const [armyB, setArmyB] = useState<ParsedRoster | null>(null)
  const [attackingUnit, setAttackingUnit] = useState<ParsedUnit | null>(null)
  const [defendingUnit, setDefendingUnit] = useState<ParsedUnit | null>(null)
  const [selectedWeapon, setSelectedWeapon] = useState<ParsedWeapon | null>(null)
  const [picking, setPicking] = useState<'attacker' | 'defender' | null>(null)
  const [battleState, setBattleState] = useState<BattleState | null>(null)
  const [swapped, setSwapped] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [customRules, setCustomRules] = useState<CustomRule[]>([])

  // Load rosters and game state from localStorage on mount
  useEffect(() => {
    const storedA = loadRoster('A')
    const storedB = loadRoster('B')
    if (storedA) setArmyA(storedA)
    if (storedB) setArmyB(storedB)

    // Load custom rules
    setCustomRules(loadRules())

    // Restore game state
    const savedGame = loadGameState()
    if (savedGame && storedA && storedB) {
      if (savedGame.battleState) setBattleState(savedGame.battleState)
      setSwapped(savedGame.swapped ?? false)

      // Restore selected units by ID
      const allUnitsA = storedA.units
      const allUnitsB = storedB.units
      const allUnits = [...allUnitsA, ...allUnitsB]

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

  // Initialize battle state when both rosters are loaded
  useEffect(() => {
    if (armyA && armyB && !battleState) {
      setBattleState(createBattleState(armyA, armyB))
    }
  }, [armyA, armyB])

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

  const handleRosterUpload = (file: File, army: 'A' | 'B') => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string)
        const parsed = parseRoster(json)
        saveRoster(army, parsed)
        if (army === 'A') {
          setArmyA(parsed)
          setAttackingUnit(null)
          setSelectedWeapon(null)
        } else {
          setArmyB(parsed)
          setDefendingUnit(null)
        }
        // Reset battle state when rosters change
        clearGameState()
        setBattleState(null)
      } catch (err) {
        console.error('Failed to parse roster:', err)
      }
    }
    reader.readAsText(file)
  }

  const handleClear = () => {
    clearRosters()
    clearGameState()
    setArmyA(null)
    setArmyB(null)
    setAttackingUnit(null)
    setDefendingUnit(null)
    setSelectedWeapon(null)
    setBattleState(null)
  }

  const handleResetGame = () => {
    clearGameState()
    setAttackingUnit(null)
    setDefendingUnit(null)
    setSelectedWeapon(null)
    setSwapped(false)
    if (armyA && armyB) {
      setBattleState(createBattleState(armyA, armyB))
    } else {
      setBattleState(null)
    }
  }

  const handleSaveRules = (rules: CustomRule[]) => {
    setCustomRules(rules)
    saveRules(rules)
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
        setShowSummary(true)
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

  // Get attacker wound state for HealUnit and model count
  const attackerWoundState = battleState && attackingUnit
    ? battleState.unitWounds[attackingUnit.id] ?? null
    : null

  // Build the effective attacker with model count from wound state
  const effectiveAttacker = attackingUnit && attackerWoundState
    ? { ...attackingUnit, modelCount: attackerWoundState.woundsRemaining.length }
    : attackingUnit

  // Get defender wound state for WoundInput
  const defenderWoundState = battleState && defendingUnit
    ? battleState.unitWounds[defendingUnit.id] ?? null
    : null

  // Calculate recommended target (highest estimated wounds from current weapon)
  const recommendedTargetId = (() => {
    if (!effectiveAttacker || !selectedWeapon || !defendingRoster || !battleState) return null
    let bestId: string | null = null
    let bestWounds = 0
    const defaultOptions = {
      inHalfRange: false,
      remainedStationary: false,
      targetInCover: false,
      advanced: false,
      charged: false,
      indirectFiring: false,
      spotterAvailable: false,
    }
    for (const unit of defendingRoster.units) {
      if (battleState.unitWounds[unit.id]?.isDead) continue
      const est = estimateWounds(effectiveAttacker, selectedWeapon, unit, defaultOptions)
      if (est > bestWounds) {
        bestWounds = est
        bestId = unit.id
      }
    }
    return bestId
  })()

  // Show rules page
  if (showRules) {
    return (
      <RulesPage
        rules={customRules}
        onSave={handleSaveRules}
        onBack={() => setShowRules(false)}
        armyA={armyA}
        armyB={armyB}
      />
    )
  }

  // Show battle summary
  if (showSummary && battleState) {
    return (
      <BattleSummary
        battleState={battleState}
        onDismiss={() => setShowSummary(false)}
      />
    )
  }

  return (
    <div class="min-h-screen bg-base-100 text-base-content flex flex-col max-w-lg mx-auto">
      {/* Upload view */}
      {!bothLoaded && (
        <div class="p-4">
          <h1 class="text-xl font-bold text-center mb-6">W40k Combat Math</h1>
          <RosterUpload onUpload={handleRosterUpload} armyA={armyA} armyB={armyB} />
        </div>
      )}

      {/* Combat view */}
      {bothLoaded && (
        <>
          {/* Round/Phase indicator */}
          {battleState && (
            <div class="flex items-center justify-between px-4 py-2 bg-base-200 border-b border-base-content/10">
              <div class="text-sm font-medium">
                Round {battleState.currentRound} — <span class="capitalize">{battleState.currentTurn}</span> <span class="capitalize">{battleState.currentPhase}</span> Phase
              </div>
              <PhaseNavigator
                battleState={battleState}
                onAdvance={handleAdvancePhase}
                onJumpTo={(round, turn, phase) => {
                  if (!battleState) return
                  setBattleState(jumpToPhase(battleState, round, turn, phase))
                  setAttackingUnit(null)
                  setDefendingUnit(null)
                  setSelectedWeapon(null)
                  setSwapped(false)
                }}
                onViewSummary={() => setShowSummary(true)}
              />
            </div>
          )}

          {/* Top bar: Attacker | Swap | Defender | Menu */}
          <div class="flex items-center border-b border-base-content/10">
            <button
              class={`flex-1 min-w-0 py-3 px-2 text-center text-sm font-medium transition-colors ${
                picking === 'attacker'
                  ? 'bg-primary text-primary-content'
                  : 'hover:bg-base-200'
              }`}
              onClick={() => setPicking(picking === 'attacker' ? null : 'attacker')}
            >
              <div class="text-xs opacity-60">Attacker</div>
              <div class="truncate">{attackingUnit?.name ?? '—'}</div>
            </button>

            {/* Swap button */}
            <button
              class="btn btn-ghost btn-sm px-1 self-center"
              onClick={handleSwap}
              aria-label="Swap attacker and defender"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>

            <button
              class={`flex-1 min-w-0 py-3 px-2 text-center text-sm font-medium transition-colors ${
                picking === 'defender'
                  ? 'bg-secondary text-secondary-content'
                  : 'hover:bg-base-200'
              }`}
              onClick={() => setPicking(picking === 'defender' ? null : 'defender')}
            >
              <div class="text-xs opacity-60">Defender</div>
              <div class="truncate">{defendingUnit?.name ?? '—'}</div>
            </button>
            <BurgerMenu
              armyA={armyA}
              armyB={armyB}
              onReplace={handleRosterUpload}
              onClear={handleClear}
              onResetGame={handleResetGame}
              onOpenRules={() => setShowRules(true)}
            />
          </div>

          {/* Unit picker dropdown */}
          {picking === 'attacker' && (
            <UnitPicker
              roster={attackingRoster!}
              onSelect={(unit) => {
                setAttackingUnit(unit)
                setSelectedWeapon(null)
                setPicking(null)
              }}
              unitWounds={battleState?.unitWounds}
            />
          )}
          {picking === 'defender' && (
            <UnitPicker
              roster={defendingRoster!}
              onSelect={(unit) => {
                setDefendingUnit(unit)
                setPicking(null)
              }}
              unitWounds={battleState?.unitWounds}
              recommendedUnitId={recommendedTargetId}
            />
          )}

          {/* Main content */}
          {!picking && (
            <div class="p-4 space-y-4 flex-1">
              {/* Heal/restore unit */}
              {attackingUnit && attackerWoundState && (
                <HealUnit
                  unitWoundState={attackerWoundState}
                  originalModelCount={attackingUnit.modelCount}
                  onCommit={(woundsRestored) => {
                    if (!battleState) return
                    setBattleState(applyHeal(
                      battleState,
                      attackingUnit.id,
                      attackingUnit.name,
                      woundsRestored,
                      attackingUnit.modelCount,
                      attackingUnit.wounds
                    ))
                  }}
                />
              )}

              {/* Weapon selector */}
              {attackingUnit && (
                <WeaponSelector
                  unit={attackingUnit}
                  selected={selectedWeapon}
                  onSelect={setSelectedWeapon}
                />
              )}

              {/* Defender stat summary */}
              {defendingUnit && (
                <DefenderStats unit={defendingUnit} />
              )}

              {/* Attack summary */}
              {selectedWeapon && defendingUnit && effectiveAttacker && (
                <AttackSummary
                  attacker={effectiveAttacker}
                  weapon={selectedWeapon}
                  defender={defendingUnit}
                  customRules={customRules}
                  onToggleRule={(ruleId) => {
                    const updated = customRules.map(r =>
                      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
                    )
                    handleSaveRules(updated)
                  }}
                />
              )}

              {/* Wound input + Attack button */}
              {selectedWeapon && defendingUnit && effectiveAttacker && defenderWoundState && !defenderWoundState.isDead && (
                <WoundInput
                  weapon={selectedWeapon}
                  defenderWoundState={defenderWoundState}
                  onConfirm={handleAttackConfirm}
                />
              )}

              {/* Dead defender notice */}
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
        </>
      )}
    </div>
  )
}
