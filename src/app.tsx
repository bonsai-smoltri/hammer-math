import { useState, useEffect } from 'preact/hooks'
import { RosterUpload } from './components/RosterUpload'
import { BurgerMenu } from './components/BurgerMenu'
import { UnitPicker } from './components/UnitPicker'
import { WeaponSelector } from './components/WeaponSelector'
import { AttackSummary } from './components/AttackSummary'
import { DefenderStats } from './components/DefenderStats'
import { ModelCounter } from './components/ModelCounter'
import { parseRoster } from './lib/roster-parser'
import { saveRoster, loadRoster, clearRosters } from './lib/storage'
import type { ParsedRoster, ParsedUnit, ParsedWeapon } from './types/roster'

export function App() {
  const [armyA, setArmyA] = useState<ParsedRoster | null>(null)
  const [armyB, setArmyB] = useState<ParsedRoster | null>(null)
  const [attackingUnit, setAttackingUnit] = useState<ParsedUnit | null>(null)
  const [defendingUnit, setDefendingUnit] = useState<ParsedUnit | null>(null)
  const [selectedWeapon, setSelectedWeapon] = useState<ParsedWeapon | null>(null)
  const [picking, setPicking] = useState<'attacker' | 'defender' | null>(null)
  const [activeModels, setActiveModels] = useState<number | null>(null)

  // Load rosters from localStorage on mount
  useEffect(() => {
    const storedA = loadRoster('A')
    const storedB = loadRoster('B')
    if (storedA) setArmyA(storedA)
    if (storedB) setArmyB(storedB)
  }, [])

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

  const bothLoaded = armyA !== null && armyB !== null

  // Build the effective attacker with adjusted model count
  const effectiveAttacker = attackingUnit && activeModels !== null
    ? { ...attackingUnit, modelCount: activeModels }
    : attackingUnit

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
            />
          )}
          {picking === 'defender' && (
            <UnitPicker
              roster={armyB}
              onSelect={(unit) => {
                setDefendingUnit(unit)
                setPicking(null)
              }}
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
