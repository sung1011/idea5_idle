import { describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import {
  combatSupplyBlockReason,
  generateEncounterBoard,
  hydrateEncounterFields,
  exploreBoard,
  isStarterCopperPawn,
  isStarterGuideEnemy,
  isStarterHerbEnemy,
  makeStarterCopperPawn,
  makeStarterGuideEnemy,
  makeStarterHerbEnemy,
  STARTER_GUIDE_HERB_QTY,
  STARTER_GUIDE_REVEALED,
  STARTER_GUIDE_WEAKNESSES,
  STARTER_HERB_QTY,
  startCombat,
} from './encounters'
import { assignWorker } from './assign'
import { isFighting } from './combat'
import { currentSpeed } from './query'
import { spawnWorker } from './recruit'
import { HERBALISM_DROP_TABLE } from './tables'
import {
  BATTLEFIELD_SLOT_MAX,
  BATTLEFIELD_SLOT_MIN,
  MARKET_SLOT_MAX,
  MARKET_SLOT_MIN,
  battlefieldSlotCount,
  marketSlotCount,
  researchTech,
} from './tech'
import type { EnemyEncounter, Save } from './types'

function fightSnap(): EnemyEncounter['combat'] {
  return {
    startedAt: 0,
    timeoutAt: 120_000,
    workerIds: ['w-1'],
    workers: [{ id: 'w-1', label: '甲', hp: 10, hpMax: 24, atk: 4, spd: 5, nextActAt: 5_000 }],
    enemy: { id: 'enemy', label: '试敌', hp: 10, hpMax: 18, atk: 3, spd: 5, nextActAt: 5_000 },
    logs: [],
    outcome: null,
  }
}

describe('mainline battlefield / market boards', () => {
  it('puts the starter copper pawn on the market board', () => {
    const save = createSave()
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MIN)
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MIN)
    expect(save.encounters.every((enc) => enc.kind === 'enemy')).toBe(true)
    expect(isStarterCopperPawn(save.marketEncounters[0])).toBe(false)
    save.knightLevel = 16
    save.marketEncounters = generateEncounterBoard(17, marketSlotCount(save), {
      rng: save,
      mainChapter: save.mainChapter,
      board: 'market',
      starterCopperPawn: true,
      save,
    })
    expect(isStarterCopperPawn(save.marketEncounters[0])).toBe(true)
    expect(save.marketEncounters[0]).toMatchObject(makeStarterCopperPawn(17, 0))
  })

  it('pins a fixed green minion on a new battlefield and keeps it through explore', () => {
    const save = createSave()
    const first = save.encounters[0]
    expect(isStarterGuideEnemy(first)).toBe(true)
    expect(first).toMatchObject(makeStarterGuideEnemy(0, 0))
    if (first.kind !== 'enemy') return
    expect(first.needs).toEqual({ herb: STARTER_GUIDE_HERB_QTY })
    expect(first.lootGold).toBe(6)
    expect(first.lootDiamonds).toBe(0)
    expect(first.quality).toBe('green')
    expect(first.enemyRank).toBe('minion')
    expect(first.revealedWeaknesses).toEqual(['sword', 'fire'])
    const second = save.encounters[1]
    expect(isStarterHerbEnemy(second)).toBe(true)
    expect(isStarterGuideEnemy(second)).toBe(false)
    expect(second).toMatchObject(makeStarterHerbEnemy(0, 1))
    if (second.kind !== 'enemy') return
    expect(second.needs).toEqual({ herb: 2 })
    expect(second.lootGold).toBe(6)
    expect(second.lootDiamonds).toBe(0)
    expect(second.quality).toBe('green')
    expect(second.enemyRank).toBe('minion')
    expect(second.revealedWeaknesses).toEqual(['axe', 'bow'])
    expect(exploreBoard(save).ok).toBe(true)
    expect(save.encounters[0].id).toBe(first.id)
    expect(save.encounters[1].id).toBe(second.id)
    const rolled = generateEncounterBoard(3, 2, { board: 'battlefield' })
    expect(rolled.some((enc) => isStarterGuideEnemy(enc) || isStarterHerbEnemy(enc))).toBe(false)
  })

  it('charges the guide minion two herbs and starts once that herb is in the bank', () => {
    const save = createSave()
    expect(save.bank).toEqual({})
    const first = save.encounters[0]
    expect(isStarterGuideEnemy(first)).toBe(true)
    if (first.kind !== 'enemy') return
    expect(STARTER_GUIDE_HERB_QTY).toBe(2)
    expect(STARTER_GUIDE_HERB_QTY).toBe(STARTER_HERB_QTY)
    expect(first.needs).toEqual({ herb: 2 })
    expect(first.needs).not.toHaveProperty('anyPotion')
    expect(first.quality).toBe('green')
    expect(first.weaknesses).toEqual([...STARTER_GUIDE_WEAKNESSES])
    expect(first.revealedWeaknesses).toEqual([...STARTER_GUIDE_REVEALED])

    const herbalist = spawnWorker(save)
    expect(assignWorker(save, herbalist.id, 'herbalism').ok).toBe(true)
    const herbWeight = HERBALISM_DROP_TABLE.find((row) => row.itemId === 'herb')?.weight ?? 0
    const weightSum = HERBALISM_DROP_TABLE.reduce((sum, row) => sum + row.weight, 0)
    const herbsInThreeMinutes = currentSpeed(save, 'herbalism') * 180 * (herbWeight / weightSum)
    expect(herbsInThreeMinutes).toBeGreaterThanOrEqual(STARTER_GUIDE_HERB_QTY)

    const fighter = spawnWorker(save)
    expect(combatSupplyBlockReason(save, 0)).toContain('货不够')
    expect(startCombat(save, 0, [fighter.id]).ok).toBe(false)
    save.bank.salve = 1
    expect(combatSupplyBlockReason(save, 0)).toContain('货不够')
    save.bank.herb = 1
    expect(startCombat(save, 0, [fighter.id]).ok).toBe(false)
    save.bank.herb = STARTER_GUIDE_HERB_QTY
    expect(combatSupplyBlockReason(save, 0)).toBeNull()
    expect(startCombat(save, 0, [fighter.id]).ok).toBe(true)
    expect(save.bank.herb ?? 0).toBe(0)
    expect(isFighting(first)).toBe(true)
  })

  it('generates only enemies on battlefield and only trades on market', () => {
    for (let seed = 0; seed < 24; seed++) {
      const battle = generateEncounterBoard(seed, BATTLEFIELD_SLOT_MAX, { board: 'battlefield' })
      const market = generateEncounterBoard(seed, MARKET_SLOT_MAX, { board: 'market' })
      expect(battle).toHaveLength(BATTLEFIELD_SLOT_MAX)
      expect(market).toHaveLength(MARKET_SLOT_MAX)
      expect(battle.every((enc) => enc.kind === 'enemy')).toBe(true)
      expect(market.every((enc) => enc.kind !== 'enemy')).toBe(true)
    }
  })

  it('splits an old mixed board and keeps an in-progress fight', () => {
    const save = createSave()
    const fight: EnemyEncounter = {
      kind: 'enemy',
      id: 'keep-fight',
      label: '试敌',
      quality: 'green',
      needs: { meal: 1 },
      lootGold: 6,
      departed: true,
      combat: fightSnap(),
      lootClaimed: false,
      enemyRank: 'minion',
      weaknesses: ['fire'],
      revealedWeaknesses: [],
    }
    save.encounters = [
      fight,
      {
        kind: 'pawn',
        id: 'old-pawn',
        label: '工具当',
        quality: 'green',
        pawnWants: { tool: 1 },
        completed: false,
      },
    ] as Save['encounters']
    save.marketEncounters = []
    hydrateEncounterFields(save)
    expect(save.encounters.some((enc) => enc.id === 'keep-fight')).toBe(true)
    const kept = save.encounters.find((enc) => enc.id === 'keep-fight')
    expect(kept && kept.kind === 'enemy' && isFighting(kept)).toBe(true)
    expect(save.encounters.every((enc) => enc.kind === 'enemy')).toBe(true)
    expect(save.marketEncounters.some((enc) => enc.id === 'old-pawn')).toBe(true)
    expect(save.marketEncounters.every((enc) => enc.kind !== 'enemy')).toBe(true)
  })

  it('grows only the matching board when researching slot techs', () => {
    const save = createSave()
    save.techPoints = 99
    expect(researchTech(save, 'pathOutpost').ok).toBe(true)
    expect(battlefieldSlotCount(save)).toBe(3)
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MIN)
    expect(save.encounters).toHaveLength(3)
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MIN)

    expect(researchTech(save, 'marketLicense').ok).toBe(true)
    expect(battlefieldSlotCount(save)).toBe(3)
    expect(marketSlotCount(save)).toBe(3)
    expect(save.encounters).toHaveLength(3)
    expect(save.marketEncounters).toHaveLength(3)
  })
})
