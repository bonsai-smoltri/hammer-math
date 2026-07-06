import { useState, useEffect } from 'preact/hooks'
import { RosterUpload } from './components/RosterUpload'
import { BurgerMenu } from './components/BurgerMenu'
import { UnitPicker } from './components/UnitPicker'
import { WeaponSelector } from './components/WeaponSelector'
import { AttackSummary } from './components/AttackSummary'
import { DefenderStats } from './components/DefenderStats'
import { ModelCounter } from './components/ModelCounter'
import { WoundInput } from './components/WoundInput'
import { parseRoster } from './lib/roster-parser'
import { saveRoster, loadRoster, clearRosters } from './lib/storage'
import { createBattleState, advancePhase, applyAttack } from './lib/battle-state'
import { estimateWounds } from './lib/combat-math'
import type { ParsedRoster, ParsedUnit, ParsedWeapon } from './types/roster'
import type { BattleState } from './types/battle'
import type { DamageResult } from './lib/battle-state'

export function App() {
  const [armyA, setArmyA] = useState<ParsedRoster | null>(null)
  const [armyB, setArmyB] = useState<ParsedRoster | null>(null)
  const [attackingUnit, setAttackingUnit] = useState<ParsedUnit | null>(null)
  const [defendingUnit, setDefendingUnit] = useState<ParsedUnit | null>(null)
  const [selectedWeapon, setSelectedWeapon] = useState<ParsedWeapon | null>(null)
  const [picking, setPicking] = useState<'attacker' | 'defender' | null>(null)
  const [activeModels, setActiveModels] = useState<number | null>(null)
  const [battleState, setBattleState] = useState<BattleState | null>(null)

  // Load rosters from localStorage on mount
  useEffect(() => {
    const storedA = loadRoster('A')
    const storedB = loadRoster('B')
    if (storedA) setArmyA(storedA)
    if (storedB) setArmyB(storedB)
  }, [])

  // Initialize battle state when both rosters are loaded
  useEffect(() => {
    if (armyA && armyB && !battleState) {
      setBattleState(createBattleState(armyA, armyB))
    }
  }, [armyA, armyB])

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
          setActiveModels(null)
        } else {
          setArmyB(parsed)
          setDefendingUnit(null)
        }
        // Reset battle state when rosters change
        setBattleState(null)
      } catch (err) {
        console.error('Failed to parse roster:', err)
      }
    }
    reader.readAsText(file)
  }

  const handleClear = () => {
    clearRosters()
    setArmyA(null)
    setArmyB(null)
    setAttackingUnit(null)
    setDefendingUnit(null)
    setSelectedWeapon(null)
    setActiveModels(null)
    setBattleState(null)
  }

  const handleSwap = () => {
    const prevAttacker = attackingUnit
    const prevDefender = defendingUnit
    setAttackingUnit(prevDefender)
    setDefendingUnit(prevAttacker)
    setSelectedWeapon(null)
    setActiveModels(prevDefender ? prevDefender.modelCount : null)
    // Swap which roster is which
    const prevA = armyA
    const prevB = armyB
    setArmyA(prevB)
    setArmyB(prevA)
    if (prevB) saveRoster('A', prevB)
    if (prevA) saveRoster('B', prevA)
  }

  const handleAdvancePhase = () => {
    if (battleState) {
      setBattleState(advancePhase(battleState))
    }
  }

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

  // Build the effective attacker with adjusted model count
  const effectiveAttacker = attackingUnit && activeModels !== null
    ? { ...attackingUnit, modelCount: activeModels }
    : attackingUnit

  // Get defender wound state for WoundInput
  const defenderWoundState = battleState && defendingUnit
    ? battleState.unitWounds[defendingUnit.id] ?? null
    : null

  // Calculate recommended target (highest estimated wounds from current weapon)
  const recommendedTargetId = (() => {
    if (!effectiveAttacker || !selectedWeapon || !armyB || !battleState) return null
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
    for (const unit of armyB.units) {
      if (battleState.unitWounds[unit.id]?.isDead) continue
      const est = estimateWounds(effectiveAttacker, selectedWeapon, unit, defaultOptions)
      if (est > bestWounds) {
        bestWounds = est
        bestId = unit.id
      }
    }
    return bestId
  })()

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
                Round {battleState.currentRound} — <span class="capitalize">{battleState.currentPhase}</span> Phase
              </div>
              <button
                class="btn btn-ghost btn-xs"
                onClick={handleAdvancePhase}
              >
                Next Phase →
              </button>
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
            />
          </div>

          {/* Unit picker dropdown */}
          {picking === 'attacker' && (
            <UnitPicker
              roster={armyA}
              onSelect={(unit) => {
                setAttackingUnit(unit)
                setSelectedWeapon(null)
                setActiveModels(unit.modelCount)
                setPicking(null)
              }}
              unitWounds={battleState?.unitWounds}
            />
          )}
          {picking === 'defender' && (
            <UnitPicker
              roster={armyB}
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
              {/* Model count adjuster */}
              {attackingUnit && activeModels !== null && (
                <ModelCounter
                  max={attackingUnit.modelCount}
                  value={activeModels}
                  onChange={setActiveModels}
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
