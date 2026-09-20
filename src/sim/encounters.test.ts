import { describe, expect, it } from 'vitest'
import { bankQty } from './bank'
import { createSave } from './createSave'
import {
  ARTISAN_DEFS,
  BLACK_MERCHANT_DEFS,
  BULK_BUY_DEFS,
  ENCOUNTER_SLOT_COUNT,
  EXPLORE_COST_TABLE,
  PAWN_DEFS,
  PASSERBY_DEFS,
  CHAPTER_BOSS_MIN_QUALITY,
  QUALITY_IDS,
  QUALITY_TABLE,
  clampChapterBossQuality,
  qualityRank,
  barterMerchant,
  boardSignature,
  buyMerchant,
  canClaimLoot,
  canExplore,
  canStartCombat,
  claimLoot,
  claimLootBlockReason,
  combatSupplyBlockReason,
  chapterNeedMul,
  LOOT_GOLD_BASE,
  enemyLootGoldFor,
  enemyNeedsFor,
  MAIN_NEED_ITEM_POOL,
  MAIN_NEED_TOOL_POOL,
  isLegacyGenericToolNeed,
  isMainNeedItem,
  itemNeedBase,
  mainNeedToolTierCenter,
  needEntries,
  pickMainNeedTool,
  resolveMainNeedItem,
  scaledDemandQty,
  scaledMainNeed,
  exploreBlockReason,
  exploreBoard,
  exploreCost,
  generateEncounterBoard,
  hydrateEncounterFields,
  makeStarterCopperPawn,
  STARTER_PAWN_ITEM_ID,
  STARTER_PAWN_LABEL,
  STARTER_PAWN_QTY,
  STARTER_PAWN_QUALITY,
  pickEncounterKind,
  isEncounterDone,
  isMerchantKind,
  isTradeKind,
  isWorkshopBuffActive,
  pawnGoldForMap,
  pawnMerchant,
  pawnRewardGold,
  qualityValueRatio,
  scaleGold,
  scaleNeedMap,
  sellBulk,
  shouldKeepOnExplore,
  stampLabel,
  startCombat,
  submitArtisan,
  workshopBuffMul,
} from './encounters'
import { initialRevealedWeaknessCount } from './combatAttrs'
import { isCombatWon, isFighting } from './combat'
import { assignWorker } from './assign'
import { currentSpeed } from './query'
import { recruitWorker, spawnWorker } from './recruit'
import { bulkUnitGold, ITEM_DEF, isStationToolId, pawnUnitGold, STATION_TOOL_BY_ID } from './tables'
import { ENCOUNTER_SLOT_TECH_IDS, encounterSlotCount } from './tech'
import { ticks } from './tick'
import type {
  ArtisanEncounter,
  BlackMerchantEncounter,
  BulkBuyEncounter,
  EncounterNeedMap,
  EncounterQuality,
  EnemyEncounter,
  ItemId,
  PasserbyEncounter,
  PawnEncounter,
  Save,
} from './types'

function stock(save: Save, needs: EncounterNeedMap) {
  for (const [itemId, qty] of Object.entries(needs) as Array<[ItemId, number]>) {
    save.bank[itemId] = qty
  }
}

function put(save: Save, index: number, enc: Save['encounters'][number]) {
  save.encounters[index] = enc
}

function fightSnap(outcome: 'win' | 'lose' | null) {
  return {
    startedAt: 0,
    timeoutAt: 120_000,
    workerIds: ['w-1'],
    workers: [{ id: 'w-1', label: '甲', hp: 10, hpMax: 24, atk: 4, spd: 5, nextActAt: 5_000 }],
    enemy: {
      id: 'enemy',
      label: '试敌',
      hp: outcome === 'win' ? 0 : 10,
      hpMax: 18,
      atk: 3,
      spd: 5,
      nextActAt: 5_000,
    },
    logs: [],
    outcome,
  }
}

function testEnemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'test-enemy',
    label: '试敌',
    quality: 'green',
    needs: { weapon: 1, meal: 1 },
    lootGold: enemyLootGoldFor(),
    departed: false,
    combat: null,
    lootClaimed: false,
    enemyRank: 'minion',
    weaknesses: ['fire', 'sword'],
    revealedWeaknesses: [],
    ...overrides,
  }
}

function testBlackMerchant(overrides: Partial<BlackMerchantEncounter> = {}): BlackMerchantEncounter {
  return {
    kind: 'blackMerchant',
    id: 'merchantBuy-test',
    label: '木货贩',
    quality: 'green',
    buyGold: 8,
    buyOffers: { meal: 1 },
    completed: false,
    ...overrides,
  }
}

function testPasserby(overrides: Partial<PasserbyEncounter> = {}): PasserbyEncounter {
  return {
    kind: 'passerby',
    id: 'merchantBarter-test',
    label: '换货路人',
    quality: 'green',
    wants: { wood: 4 },
    offers: { meal: 1 },
    completed: false,
    ...overrides,
  }
}

function testPawn(overrides: Partial<PawnEncounter> = {}): PawnEncounter {
  return {
    kind: 'pawn',
    id: 'merchantPawn-test',
    label: '兵器当',
    quality: 'green',
    pawnWants: { weapon: 1 },
    completed: false,
    ...overrides,
  }
}

function testArtisan(overrides: Partial<ArtisanEncounter> = {}): ArtisanEncounter {
  return {
    kind: 'artisan',
    id: 'artisanBlade-test',
    label: '修刃委托',
    quality: 'green',
    wants: { weapon: 1 },
    rewardGold: 0,
    buffMul: 1.15,
    buffDurationS: 180,
    completed: false,
    ...overrides,
  }
}

function testBulk(overrides: Partial<BulkBuyEncounter> = {}): BulkBuyEncounter {
  return {
    kind: 'bulkBuy',
    id: 'bulkBlade-test',
    label: '兵器收购',
    quality: 'green',
    wants: { weapon: 1 },
    rewardGold: bulkUnitGold('weapon'),
    completed: false,
    ...overrides,
  }
}

function unlockMaxSlots(save: Save) {
  save.unlockedTechIds = [...ENCOUNTER_SLOT_TECH_IDS]
}

function needSnapshot(save: Save, map: EncounterNeedMap): Record<ItemId, number> {
  const out = {} as Record<ItemId, number>
  for (const itemId of Object.keys(map) as ItemId[]) {
    out[itemId] = bankQty(save, itemId)
  }
  return out
}

describe('encounter board', () => {
  it('new save starts with a green copper pawn wanting ore ×2', () => {
    expect(ITEM_DEF[STARTER_PAWN_ITEM_ID].label).toBe('铜矿')
    const save = createSave()
    expect(save.encounters).toHaveLength(4)
    const enc = save.encounters[0]
    expect(enc.kind).toBe('pawn')
    if (enc.kind !== 'pawn') return
    expect(enc.label).toBe(STARTER_PAWN_LABEL)
    expect(enc.quality).toBe(STARTER_PAWN_QUALITY)
    expect(enc.pawnWants).toEqual({ [STARTER_PAWN_ITEM_ID]: STARTER_PAWN_QTY })
    expect(enc.pawnWants).toEqual({ ore: 2 })
    expect(enc.rewardGold).toBe(pawnRewardGold(enc))
    expect(enc.rewardGold).toBe(scaleGold(pawnUnitGold('ore') * STARTER_PAWN_QTY, 1))
    expect(shouldKeepOnExplore(enc)).toBe(false)
  })

  it('puts the starter copper pawn on slot 0 and fills the rest', () => {
    const board = generateEncounterBoard(3, 3, { starterCopperPawn: true })
    expect(board).toHaveLength(3)
    expect(board[0]).toEqual(makeStarterCopperPawn(3, 0))
    expect(board[0].kind).toBe('pawn')
    if (board[0].kind === 'pawn') {
      expect(board[0].pawnWants).toEqual({ ore: 2 })
    }
    expect(board[1].id).not.toBe(board[0].id)
    expect(board[2].id).not.toBe(board[0].id)
  })

  it('starts at 4 slots; full rolls still cover all 6 kinds without gray', () => {
    const save = createSave()
    expect(save.encounters).toHaveLength(4)
    expect(encounterSlotCount(save)).toBe(4)
    expect(save.workshopBuff).toBeNull()

    const seenKinds = new Set<string>()
    const seenQualities = new Set<string>()
    for (let seed = 0; seed < 80; seed++) {
      const board = generateEncounterBoard(seed)
      expect(board).toHaveLength(ENCOUNTER_SLOT_COUNT)
      for (const enc of board) {
        seenKinds.add(enc.kind)
        seenQualities.add(enc.quality)
        expect(enc.quality).not.toBe('gray')
        expect(QUALITY_TABLE[enc.quality].weight).toBeGreaterThan(0)
        if (enc.kind === 'enemy') {
          expect(enc.weaknesses.length).toBeGreaterThanOrEqual(2)
          expect(enc.weaknesses.length).toBeLessThanOrEqual(4)
          expect(new Set(enc.weaknesses).size).toBe(enc.weaknesses.length)
          expect(enc.revealedWeaknesses).toEqual(
            enc.weaknesses.slice(0, initialRevealedWeaknessCount(enc.enemyRank)),
          )
          expect((enc as { distance?: unknown }).distance).toBeUndefined()
          expect((enc as { power?: unknown }).power).toBeUndefined()
          if (enc.chapterBoss) expect(enc.enemyRank).toBe('boss')
          else expect(enc.enemyRank).not.toBe('boss')
          expect(needEntries(enc.needs)).toHaveLength(1)
          expect(isMainNeedItem(needEntries(enc.needs)[0][0])).toBe(true)
          expect(isLegacyGenericToolNeed(needEntries(enc.needs)[0][0])).toBe(false)
        }
        if (enc.kind === 'artisan') {
          expect(needEntries(enc.wants)).toHaveLength(1)
          expect(isLegacyGenericToolNeed(needEntries(enc.wants)[0][0])).toBe(false)
          expect(enc.rewardGold).toBe(0)
        }
        if (enc.kind === 'passerby') {
          expect(needEntries(enc.wants)).toHaveLength(1)
          expect(isLegacyGenericToolNeed(needEntries(enc.wants)[0][0])).toBe(false)
        }
        if (enc.kind === 'pawn') {
          expect(needEntries(enc.pawnWants)).toHaveLength(1)
          expect(isLegacyGenericToolNeed(needEntries(enc.pawnWants)[0][0])).toBe(false)
        }
        if (enc.kind === 'bulkBuy') {
          expect(needEntries(enc.wants)).toHaveLength(1)
          expect(isLegacyGenericToolNeed(needEntries(enc.wants)[0][0])).toBe(false)
        }
        if (enc.kind === 'blackMerchant') expect(needEntries(enc.buyOffers)).toHaveLength(1)
      }
    }
    expect(seenKinds.has('enemy')).toBe(true)
    expect(seenKinds.has('blackMerchant')).toBe(true)
    expect(seenKinds.has('passerby')).toBe(true)
    expect(seenKinds.has('pawn')).toBe(true)
    expect(seenKinds.has('artisan')).toBe(true)
    expect(seenKinds.has('bulkBuy')).toBe(true)
    expect(seenQualities.has('gray')).toBe(false)
    expect(seenQualities.has('green')).toBe(true)
    expect(BLACK_MERCHANT_DEFS.length).toBeGreaterThan(0)
    expect(PASSERBY_DEFS.length).toBeGreaterThan(0)
    expect(PAWN_DEFS.length).toBeGreaterThan(0)
    expect(ARTISAN_DEFS.length).toBeGreaterThan(0)
    expect(BULK_BUY_DEFS.length).toBeGreaterThan(0)
    expect(isMerchantKind('blackMerchant')).toBe(true)
    expect(isTradeKind('artisan')).toBe(true)
    expect(isTradeKind('bulkBuy')).toBe(true)
  })

  it('uses one consume item and grows qty with quality, chapter, and boss mul', () => {
    expect(chapterNeedMul(1)).toBe(1)
    expect(chapterNeedMul(2)).toBeCloseTo(1.15)
    expect(chapterNeedMul(5)).toBeCloseTo(1.6)
    expect(scaledDemandQty('meal', 'green', 1)).toBe(2)
    expect(scaledDemandQty('meal', 'orange', 1)).toBeGreaterThan(scaledDemandQty('meal', 'green', 1))
    expect(scaledDemandQty('meal', 'green', 5)).toBeGreaterThan(scaledDemandQty('meal', 'green', 1))
    const green = scaledMainNeed('meal', 'green', 1)
    const boss = scaledMainNeed('meal', 'green', 1, true)
    expect(Object.keys(green)).toEqual(['meal'])
    expect(Object.keys(boss)).toEqual(['meal'])
    expect(boss.meal ?? 0).toBeGreaterThan(green.meal ?? 0)
    expect(boss.roast).toBeUndefined()
    expect(enemyNeedsFor()).toEqual(scaledMainNeed('meal', 'green', 1))
    expect(LOOT_GOLD_BASE).toBe(6)
    expect(enemyLootGoldFor()).toBe(6)
    expect(enemyLootGoldFor(true)).toBeGreaterThan(enemyLootGoldFor())
    expect(scaleGold(enemyLootGoldFor(), QUALITY_TABLE.orange.outputMul)).toBeGreaterThan(enemyLootGoldFor())

    let sawEnemy = false
    let sawArtisan = false
    for (let seed = 0; seed < 40; seed++) {
      const low = generateEncounterBoard(seed, 6, { mainChapter: 1 })
      const high = generateEncounterBoard(seed, 6, { mainChapter: 8 })
      const lowEnemy = low.find((enc) => enc.kind === 'enemy')
      const highEnemy = high.find((enc) => enc.kind === 'enemy')
      const lowArtisan = low.find((enc) => enc.kind === 'artisan')
      const highArtisan = high.find((enc) => enc.kind === 'artisan')
      if (lowEnemy?.kind === 'enemy' && highEnemy?.kind === 'enemy') {
        expect(needEntries(lowEnemy.needs)).toHaveLength(1)
        expect(needEntries(highEnemy.needs)).toHaveLength(1)
        const lowId = needEntries(lowEnemy.needs)[0][0]
        const highId = needEntries(highEnemy.needs)[0][0]
        if (isStationToolId(lowId) && isStationToolId(highId)) {
          expect(STATION_TOOL_BY_ID[lowId].stationId).toBe(STATION_TOOL_BY_ID[highId].stationId)
          expect(STATION_TOOL_BY_ID[highId].index).toBeGreaterThanOrEqual(STATION_TOOL_BY_ID[lowId].index)
        } else {
          expect(lowId).toBe(highId)
        }
        expect(needEntries(highEnemy.needs)[0][1]).toBeGreaterThan(needEntries(lowEnemy.needs)[0][1])
        sawEnemy = true
      }
      if (lowArtisan?.kind === 'artisan' && highArtisan?.kind === 'artisan') {
        expect(needEntries(lowArtisan.wants)).toHaveLength(1)
        expect(needEntries(highArtisan.wants)).toHaveLength(1)
        expect(lowArtisan.rewardGold).toBe(0)
        expect(needEntries(highArtisan.wants)[0][1]).toBeGreaterThan(needEntries(lowArtisan.wants)[0][1])
        sawArtisan = true
      }
      if (sawEnemy && sawArtisan) break
    }
    expect(sawEnemy).toBe(true)
    expect(sawArtisan).toBe(true)
  })

  it('resolves tool needs to forgeable station tools and raises tier with chapter/quality', () => {
    expect(MAIN_NEED_ITEM_POOL).toContain('tool')
    expect(MAIN_NEED_TOOL_POOL).toContain('miningTool01')
    expect(MAIN_NEED_TOOL_POOL).toContain('alchemyTool20')
    expect(MAIN_NEED_TOOL_POOL).not.toContain('tool')
    expect(MAIN_NEED_TOOL_POOL).not.toContain('ironTool')
    expect(MAIN_NEED_TOOL_POOL).not.toContain('mithrilTool')
    expect(pickMainNeedTool('green', 1, false, undefined, 0)).toBe('miningTool01')
    expect(resolveMainNeedItem('tool', 'green', 1, false, undefined, 0)).toBe('miningTool01')
    expect(resolveMainNeedItem('meal', 'green', 1)).toBe('meal')
    expect(isMainNeedItem('miningTool01')).toBe(true)
    expect(isMainNeedItem('tool')).toBe(false)
    expect(itemNeedBase('miningTool01')).toBe(2)
    expect(mainNeedToolTierCenter('green', 1)).toBeCloseTo(1)
    expect(mainNeedToolTierCenter('orange', 8)).toBeGreaterThan(mainNeedToolTierCenter('green', 1))
    expect(mainNeedToolTierCenter('orange', 8)).toBeGreaterThan(mainNeedToolTierCenter('green', 8))
    const highTool = pickMainNeedTool('orange', 16, true, undefined, 0)
    expect(isStationToolId(highTool)).toBe(true)
    if (isStationToolId(highTool)) {
      expect(STATION_TOOL_BY_ID[highTool].index).toBeGreaterThan(1)
    }
  })
})

describe('exploreBoard', () => {
  it('deducts gold and replaces refreshable slots on the current board', () => {
    const save = createSave()
    const beforeGold = save.gold
    const beforeCost = exploreCost(save)
    const beforeSig = boardSignature(save.encounters)
    expect(beforeCost).toBe(EXPLORE_COST_TABLE[0])

    const result = exploreBoard(save)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('探索完成')
    expect(save.gold).toBe(beforeGold - beforeCost)
    expect(save.exploreCount).toBe(1)
    expect(save.encounters).toHaveLength(4)
    expect(boardSignature(save.encounters)).not.toBe(beforeSig)
  })

  it('does not explore when gold is short', () => {
    const save = createSave()
    const beforeSig = boardSignature(save.encounters)
    save.gold = 0
    expect(canExplore(save)).toBe(false)
    expect(exploreBlockReason(save)).toContain('金币不够')
    expect(exploreBlockReason(save)).toContain('探索')
    const result = exploreBoard(save)
    expect(result.ok).toBe(false)
    expect(save.gold).toBe(0)
    expect(save.exploreCount).toBe(0)
    expect(boardSignature(save.encounters)).toBe(beforeSig)
  })

  it('keeps fighting, won, or lost enemies and replaces idle or claimed ones', () => {
    const save = createSave()
    unlockMaxSlots(save)
    const now = 2_000_000_000_000
    const fighting = testEnemy({
      id: 'keep-fight',
      departed: true,
      combat: fightSnap(null),
    })
    const won = testEnemy({
      id: 'keep-win',
      departed: true,
      combat: fightSnap('win'),
    })
    const idle = testEnemy({ id: 'swap-idle' })
    const claimed = testEnemy({
      id: 'swap-claimed',
      departed: true,
      combat: fightSnap('win'),
      lootClaimed: true,
    })
    const passerby = testPasserby({ id: 'swap-passerby' })
    const sixth = testEnemy({ id: 'swap-sixth' })
    put(save, 0, fighting)
    put(save, 1, won)
    put(save, 2, idle)
    put(save, 3, claimed)
    put(save, 4, passerby)
    put(save, 5, sixth)

    expect(shouldKeepOnExplore(fighting, now)).toBe(true)
    expect(shouldKeepOnExplore(won, now)).toBe(true)
    expect(shouldKeepOnExplore(idle, now)).toBe(false)
    expect(shouldKeepOnExplore(claimed, now)).toBe(false)
    expect(shouldKeepOnExplore(passerby, now)).toBe(false)
    expect(
      shouldKeepOnExplore(
        testEnemy({ id: 'keep-idle-boss', chapterBoss: true, departed: false, combat: null }),
        now,
      ),
    ).toBe(true)

    const result = exploreBoard(save, now)
    expect(result.ok).toBe(true)
    expect(save.encounters).toHaveLength(6)
    expect(save.encounters[0].id).toBe('keep-fight')
    expect(save.encounters[1].id).toBe('keep-win')
    expect(save.encounters[2].id).not.toBe('swap-idle')
    expect(save.encounters[3].id).not.toBe('swap-claimed')
    expect(save.encounters[4].id).not.toBe('swap-passerby')
    expect(save.encounters[5].id).not.toBe('swap-sixth')
  })

  it('can still roll enemies into empty slots when kept fights occupy the old enemy-only indices', () => {
    const save = createSave()
    unlockMaxSlots(save)
    save.gold = 10_000
    const now = 3_000_000_000_000
    save.encounters = [
      testEnemy({ id: 'keep-0', departed: true, combat: fightSnap(null) }),
      testPasserby({ id: 'empty-1' }),
      testEnemy({ id: 'keep-2', departed: true, combat: fightSnap(null) }),
      testEnemy({ id: 'keep-3', departed: true, combat: fightSnap(null) }),
      testArtisan({ id: 'empty-4' }),
      testBulk({ id: 'empty-5' }),
    ]
    let newEnemy = 0
    const draws = 40
    for (let i = 0; i < draws; i++) {
      expect(exploreBoard(save, now).ok).toBe(true)
      expect(save.encounters[0].id).toBe('keep-0')
      expect(save.encounters[2].id).toBe('keep-2')
      expect(save.encounters[3].id).toBe('keep-3')
      for (const idx of [1, 4, 5]) {
        const enc = save.encounters[idx]
        if (enc.kind === 'enemy' && enc.id !== 'keep-0' && enc.id !== 'keep-2' && enc.id !== 'keep-3') {
          newEnemy += 1
        }
      }
    }
    expect(newEnemy).toBeGreaterThanOrEqual(8)
  })

  it('picks encounter kinds by weight instead of board-index modulo', () => {
    const counts: Record<string, number> = {
      enemy: 0,
      blackMerchant: 0,
      passerby: 0,
      pawn: 0,
      artisan: 0,
      bulkBuy: 0,
    }
    const rng = { rngState: 17 }
    const n = 1400
    for (let i = 0; i < n; i++) {
      counts[pickEncounterKind(rng)] += 1
    }
    expect(counts.enemy).toBeGreaterThan(n * 0.2)
    expect(counts.enemy).toBeLessThan(n * 0.4)
    expect(counts.blackMerchant).toBeGreaterThan(0)
    expect(counts.passerby).toBeGreaterThan(0)
    expect(counts.pawn).toBeGreaterThan(0)
    expect(counts.artisan).toBeGreaterThan(0)
    expect(counts.bulkBuy).toBeGreaterThan(0)
  })
})

describe('enemy combat and loot', () => {
  it('does not start or take goods when supplies are short', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    const enemy = testEnemy({ needs: { weapon: 1, meal: 1 } })
    put(save, 0, enemy)
    const index = 0

    save.bank.weapon = 0
    save.bank.meal = 0
    const bankBefore = { ...save.bank }
    expect(canStartCombat(save, index, [worker.id])).toBe(false)
    expect(combatSupplyBlockReason(save, index)).toContain('货不够')
    const result = startCombat(save, index, [worker.id])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('货不够')
    expect(save.bank).toEqual(bankBefore)
    expect(save.departCount).toBe(0)
    expect(save.lastDepartAt).toBeNull()
    expect(enemy.departed).toBe(false)
    expect(enemy.combat).toBeNull()
    expect(enemy.submitted).toBeUndefined()
  })

  it('takes supplies once, starts combat without paying gold, and blocks claim while fighting', () => {
    const save = createSave()
    save.gold = 10
    const worker = spawnWorker(save)
    const enemy = testEnemy({ needs: { weapon: 1, meal: 1 } })
    put(save, 0, enemy)
    const index = 0

    stock(save, { weapon: 4, meal: 4, fish: 4, ore: 4, wood: 4 })
    const now = 1_700_000_000_000
    const bankBefore = needSnapshot(save, enemy.needs)
    expect(canStartCombat(save, index, [worker.id])).toBe(true)
    const result = startCombat(save, index, [worker.id], now)
    expect(result.ok).toBe(true)
    expect(save.gold).toBe(10)
    for (const [itemId, qty] of Object.entries(enemy.needs) as Array<[ItemId, number]>) {
      expect(bankQty(save, itemId)).toBe(bankBefore[itemId] - qty)
    }
    expect(save.departCount).toBe(1)
    expect(save.lastDepartAt).toBe(now)
    expect(enemy.departed).toBe(true)
    expect(enemy.submitted).toBeUndefined()
    expect(enemy.lootClaimed).toBe(false)
    expect(isFighting(enemy)).toBe(true)
    expect(worker.assignment).toBeNull()
    expect(canClaimLoot(save, index, now)).toBe(false)
    expect(claimLootBlockReason(save, index, now)).toBe('战斗尚未结束')
    expect(startCombat(save, index, [worker.id], now + 1000).ok).toBe(false)
  })

  it('lets a leftover submitted save start without taking goods again', () => {
    const save = createSave()
    save.gold = 6
    save.bank = { weapon: 1, meal: 1 }
    const worker = spawnWorker(save)
    const enemy = testEnemy({
      needs: { weapon: 2, meal: 2 },
      submitted: true,
    })
    put(save, 0, enemy)
    const now = 1_710_000_000_000
    const result = startCombat(save, 0, [worker.id], now)
    expect(result.ok).toBe(true)
    expect(save.bank).toEqual({ weapon: 1, meal: 1 })
    expect(save.gold).toBe(6)
    expect(enemy.departed).toBe(true)
    expect(enemy.submitted).toBeUndefined()
    expect(isFighting(enemy)).toBe(true)
  })

  it('cannot claim loot while fighting', () => {
    const save = createSave()
    const now = 1_800_000_000_000
    put(save, 0, testEnemy({ departed: true, combat: fightSnap(null) }))
    const gold = save.gold
    const result = claimLoot(save, 0, now)
    expect(result.ok).toBe(false)
    expect(claimLootBlockReason(save, 0, now)).toBe('战斗尚未结束')
    expect(save.gold).toBe(gold)
    if (save.encounters[0].kind === 'enemy') expect(save.encounters[0].lootClaimed).toBe(false)
  })

  it('claims table gold only after a win and does not add bank items', () => {
    const save = createSave()
    save.gold = 10
    save.bank = { wood: 2, meal: 1 }
    const enemy = testEnemy({
      departed: true,
      combat: fightSnap('win'),
      lootGold: 14,
    })
    put(save, 0, enemy)
    expect(isCombatWon(enemy)).toBe(true)
    const result = claimLoot(save, 0, 2_000)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('金币 +14')
    expect(save.gold).toBe(24)
    expect(save.bank).toEqual({ wood: 2, meal: 1 })
    expect(enemy.lootClaimed).toBe(true)
    expect(claimLoot(save, 0, 3_000).ok).toBe(false)
  })

  it('migrates a leftover march into a winnable claim without offline waiting', () => {
    const save = createSave()
    save.gold = 10
    save.bank = { ore: 3 }
    save.encounters = [
      {
        kind: 'enemy',
        id: 'old-march',
        label: '旧行军',
        quality: 'green',
        distance: 'near',
        power: 'weak',
        needs: { meal: 1 },
        lootGold: 8,
        departed: true,
        marchEndsAt: 5_000_000 + 60_000,
        lootClaimed: false,
      },
      testPasserby({ id: 'p1' }),
      testBlackMerchant({ id: 'b1' }),
      testPawn({ id: 'w1' }),
      testArtisan({ id: 'a1' }),
      testEnemy({ id: 'e2' }),
    ] as unknown as Save['encounters']
    hydrateEncounterFields(save)
    expect(save.encounters[0].kind).toBe('enemy')
    if (save.encounters[0].kind !== 'enemy') return
    expect(isCombatWon(save.encounters[0])).toBe(true)
    expect(save.encounters[0].lootClaimed).toBe(false)
    expect((save.encounters[0] as { distance?: unknown }).distance).toBeUndefined()
    expect((save.encounters[0] as { power?: unknown }).power).toBeUndefined()
    const result = claimLoot(save, 0, 6_000_000)
    expect(result.ok).toBe(true)
    expect(save.gold).toBe(18)
    expect(bankQty(save, 'ore')).toBe(3)
  })

  it('fills missing enemy needs/loot from the quality table and ignores leftover distance/power', () => {
    const save = createSave()
    save.encounters = [
      {
        kind: 'enemy',
        id: 'bare-enemy',
        label: '无远近旧敌',
        quality: 'green',
        distance: 'far',
        power: 'strong',
        departed: false,
        combat: null,
        lootClaimed: false,
      },
    ] as unknown as Save['encounters']
    hydrateEncounterFields(save)
    expect(save.encounters[0].kind).toBe('enemy')
    if (save.encounters[0].kind !== 'enemy') return
    expect(save.encounters[0].needs).toEqual(scaledMainNeed('meal', 'green', 1))
    expect(save.encounters[0].lootGold).toBe(enemyLootGoldFor())
    expect(save.encounters[0].enemyRank).toBe('minion')
    expect((save.encounters[0] as { distance?: unknown }).distance).toBeUndefined()
    expect((save.encounters[0] as { power?: unknown }).power).toBeUndefined()
  })

  it('keeps a leftover multi-item enemy needs map so a rematch is not rewritten', () => {
    const save = createSave()
    save.encounters = [
      {
        kind: 'enemy',
        id: 'old-multi',
        label: '旧多物敌',
        quality: 'green',
        needs: { meal: 2, ore: 2, fish: 1 },
        lootGold: 12,
        departed: true,
        combat: fightSnap(null),
        lootClaimed: false,
      },
    ] as unknown as Save['encounters']
    hydrateEncounterFields(save)
    expect(save.encounters[0].kind).toBe('enemy')
    if (save.encounters[0].kind !== 'enemy') return
    expect(save.encounters[0].needs).toEqual({ meal: 2, ore: 2, fish: 1 })
  })
})

describe('merchant kinds', () => {
  it('lets a black merchant sell goods for gold', () => {
    const save = createSave()
    put(save, 0, testBlackMerchant())
    save.gold = 20
    save.bank = {}
    expect(buyMerchant(save, 0).ok).toBe(true)
    expect(save.gold).toBe(12)
    expect(bankQty(save, 'meal')).toBe(1)
    expect(save.encounters[0].kind === 'blackMerchant' && save.encounters[0].completed).toBe(true)
  })

  it('still buys and barters when stock already exceeds the old bank cap', () => {
    const buy = createSave()
    put(buy, 0, testBlackMerchant())
    buy.gold = 20
    buy.bank.meal = 400
    expect(buyMerchant(buy, 0).ok).toBe(true)
    expect(bankQty(buy, 'meal')).toBe(401)

    const swap = createSave()
    const passerby = testPasserby()
    put(swap, 0, passerby)
    stock(swap, { wood: 8, meal: 400 })
    expect(barterMerchant(swap, 0).ok).toBe(true)
    expect(bankQty(swap, 'meal')).toBe(401)
    expect(bankQty(swap, 'wood')).toBe(4)
  })

  it('lets a passerby barter wants for offers', () => {
    const save = createSave()
    const passerby = testPasserby()
    put(save, 0, passerby)
    stock(save, { wood: 8, meal: 1 })
    const beforeWants = needSnapshot(save, passerby.wants)
    const beforeOffers = needSnapshot(save, passerby.offers)
    expect(barterMerchant(save, 0).ok).toBe(true)
    expect(passerby.completed).toBe(true)
    for (const [itemId, qty] of Object.entries(passerby.wants) as Array<[ItemId, number]>) {
      expect(bankQty(save, itemId)).toBe(beforeWants[itemId] - qty)
    }
    for (const [itemId, qty] of Object.entries(passerby.offers) as Array<[ItemId, number]>) {
      expect(bankQty(save, itemId)).toBe(beforeOffers[itemId] + qty)
    }
  })

  it('lets a pawnshop trade listed goods for table gold', () => {
    const save = createSave()
    const pawn = testPawn({ pawnWants: { weapon: 1, wood: 2 } })
    put(save, 0, pawn)
    save.gold = 5
    stock(save, { weapon: 2, wood: 5, meal: 3 })
    const quote = pawnGoldForMap(pawn.pawnWants)
    expect(quote).toBe(pawnUnitGold('weapon') * 1 + pawnUnitGold('wood') * 2)
    expect(pawnMerchant(save, 0).ok).toBe(true)
    expect(save.gold).toBe(5 + quote)
    expect(bankQty(save, 'weapon')).toBe(1)
    expect(bankQty(save, 'wood')).toBe(3)
    expect(bankQty(save, 'meal')).toBe(3)
    expect(pawn.completed).toBe(true)
    expect(stampLabel(pawn)).toBe('成交')
    expect(isEncounterDone(pawn)).toBe(true)
  })

  it('does not let a black merchant barter', () => {
    const save = createSave()
    put(save, 0, testBlackMerchant())
    stock(save, { wood: 8, meal: 2 })
    const gold = save.gold
    const result = barterMerchant(save, 0)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('黑心商人不能以物易物')
    expect(save.gold).toBe(gold)
    expect(bankQty(save, 'wood')).toBe(8)
  })

  it('does not let a passerby buy with gold', () => {
    const save = createSave()
    put(save, 0, testPasserby())
    save.gold = 40
    const result = buyMerchant(save, 0)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('路人不能购买')
    expect(save.gold).toBe(40)
  })

  it('does not let a pawnshop sell goods for gold', () => {
    const save = createSave()
    put(save, 0, testPawn())
    save.gold = 40
    const result = buyMerchant(save, 0)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('当铺不能购买')
    expect(save.gold).toBe(40)
    expect(bankQty(save, 'weapon')).toBe(0)
  })

  it('does not take pawn goods when the bank is short', () => {
    const save = createSave()
    const pawn = testPawn({ pawnWants: { weapon: 1 } })
    put(save, 0, pawn)
    save.gold = 4
    save.bank.weapon = 0
    const result = pawnMerchant(save, 0)
    expect(result.ok).toBe(false)
    expect(pawn.completed).toBe(false)
    expect(save.gold).toBe(4)
  })
})

describe('hydrateEncounterFields', () => {
  it('builds a starter copper pawn when the board is empty', () => {
    const save = createSave()
    save.encounters = []
    hydrateEncounterFields(save)
    expect(save.encounters).toHaveLength(4)
    expect(save.encounters[0].kind).toBe('pawn')
    if (save.encounters[0].kind !== 'pawn') return
    expect(save.encounters[0].pawnWants).toEqual({ ore: 2 })
    expect(save.encounters[0].label).toBe('铜矿当')
  })

  it('does not force a starter copper pawn onto an existing old board', () => {
    const save = createSave()
    save.encounters = [testEnemy({ id: 'legacy-keep' })]
    hydrateEncounterFields(save)
    expect(save.encounters).toHaveLength(4)
    expect(save.encounters[0].id).toBe('legacy-keep')
    expect(save.encounters.some((enc) => enc.kind === 'pawn' && enc.label === '铜矿当')).toBe(false)
  })

  it('builds a 4-slot board and migrates a legacy order into the first enemy', () => {
    const save = createSave() as Save & {
      currentOrderId?: string
      orderIndex?: number
      orderSubmitted?: boolean
      encounters: Save['encounters']
    }
    save.encounters = []
    save.currentOrderId = 'campKitchen'
    save.orderIndex = 2
    save.orderSubmitted = true
    hydrateEncounterFields(save)
    expect(save.encounters).toHaveLength(4)
    expect(save.encounters[0].kind).toBe('enemy')
    if (save.encounters[0].kind !== 'enemy') return
    expect(save.encounters[0].id).toBe('campKitchen')
    expect(save.encounters[0].label).toBe('营地开伙')
    expect(save.encounters[0].submitted).toBe(true)
    expect(save.encounters[0].departed).toBe(false)
    expect(save.encounters[0].lootGold).toBe(10)
    expect(save.encounters[0].quality).toBe('green')
    expect(save.encounters[0].combat).toBeNull()
    expect(save.encounters[0].lootClaimed).toBe(false)
    expect(save.currentOrderId).toBeUndefined()
    expect(save.orderIndex).toBeUndefined()
    expect(save.orderSubmitted).toBeUndefined()
  })

  it('migrates a generic merchant into a passerby when it has barter fields', () => {
    const save = createSave()
    unlockMaxSlots(save)
    const legacy = {
      kind: 'merchant',
      id: 'woodPeddler-0-1',
      label: '木货贩',
      wants: { wood: 4 },
      offers: { meal: 1 },
      buyGold: 8,
      buyOffers: { meal: 1 },
      completed: false,
    }
    save.encounters = [legacy, testEnemy({ id: 'e1' }), testEnemy({ id: 'e2' }), testEnemy({ id: 'e3' }), testEnemy({ id: 'e4' })] as unknown as Save['encounters']
    hydrateEncounterFields(save)
    expect(save.encounters[0].kind).toBe('passerby')
    if (save.encounters[0].kind !== 'passerby') return
    expect(save.encounters[0].id).toContain('merchantBarter')
    expect(save.encounters[0].wants).toEqual({ wood: 4 })
    expect(save.encounters[0].offers).toEqual({ meal: 1 })
    expect(save.encounters[0].quality).toBe('green')
  })

  it('migrates shady and pawnshop kinds plus missing workshop buff', () => {
    const save = createSave()
    unlockMaxSlots(save)
    delete (save as { workshopBuff?: unknown }).workshopBuff
    save.encounters = [
      {
        kind: 'shady',
        id: 'merchantBuy-old',
        label: '木货贩',
        buyGold: 8,
        buyOffers: { meal: 1 },
        completed: true,
      },
      {
        kind: 'pawnshop',
        id: 'merchantPawn-old',
        label: '兵器当',
        pawnWants: { weapon: 1 },
        completed: false,
      },
      testEnemy({ id: 'e1' }),
      testEnemy({ id: 'e2' }),
      testEnemy({ id: 'e3' }),
    ] as unknown as Save['encounters']
    hydrateEncounterFields(save)
    expect(save.workshopBuff).toBeNull()
    expect(save.encounters[0].kind).toBe('blackMerchant')
    if (save.encounters[0].kind === 'blackMerchant') {
      expect(save.encounters[0].quality).toBe('green')
      expect(save.encounters[0].completed).toBe(true)
    }
    expect(save.encounters[1].kind).toBe('pawn')
    if (save.encounters[1].kind === 'pawn') {
      expect(save.encounters[1].quality).toBe('green')
      expect(save.encounters[1].pawnWants).toEqual({ weapon: 1 })
    }
  })

  it('keeps a pinned targetRuleId and drops an unknown one', () => {
    const pinnedSave = createSave()
    pinnedSave.encounters = [testEnemy({ id: 'pin-cleave', targetRuleId: 'cleave2' })]
    hydrateEncounterFields(pinnedSave)
    expect(pinnedSave.encounters[0].kind).toBe('enemy')
    if (pinnedSave.encounters[0].kind === 'enemy') {
      expect(pinnedSave.encounters[0].targetRuleId).toBe('cleave2')
    }

    const dirtySave = createSave()
    dirtySave.encounters = [testEnemy({ id: 'bad-rule', targetRuleId: 'rand4' as EnemyEncounter['targetRuleId'] })]
    hydrateEncounterFields(dirtySave)
    expect(dirtySave.encounters[0].kind).toBe('enemy')
    if (dirtySave.encounters[0].kind === 'enemy') {
      expect(dirtySave.encounters[0].targetRuleId).toBeUndefined()
    }
  })

  it('fills old enemy revealedWeaknesses by rank without rerolling weaknesses', () => {
    const save = createSave()
    save.encounters = [
      testEnemy({
        id: 'old-minion',
        enemyRank: 'minion',
        weaknesses: ['fire', 'ice', 'dark'],
        revealedWeaknesses: [],
      }),
    ]
    hydrateEncounterFields(save)
    expect(save.encounters[0].kind).toBe('enemy')
    if (save.encounters[0].kind !== 'enemy') return
    expect(save.encounters[0].weaknesses).toEqual(['fire', 'ice', 'dark'])
    expect(save.encounters[0].revealedWeaknesses).toEqual(['fire', 'ice'])
  })

  it('keeps a leftover fighting enemy when shrinking an old 5-slot board to 4', () => {
    const save = createSave()
    const now = 2_200_000_000_000
    const marching = testEnemy({
      id: 'keep-five-pad',
      departed: true,
      marchEndsAt: now + 60_000,
    })
    save.encounters = [
      marching,
      testPasserby({ id: 'p1' }),
      testBlackMerchant({ id: 'b1' }),
      testPawn({ id: 'w1' }),
      testArtisan({ id: 'a1' }),
    ] as unknown as Save['encounters']
    hydrateEncounterFields(save)
    expect(save.encounters).toHaveLength(4)
    expect(save.encounters[0].id).toBe('keep-five-pad')
  })
})

describe('encounter quality', () => {
  it('clamps chapter-boss quality up to orange and keeps orange-or-higher', () => {
    expect(CHAPTER_BOSS_MIN_QUALITY).toBe('orange')
    expect(QUALITY_TABLE.orange.id).toBe('orange')
    expect(clampChapterBossQuality('gray')).toBe('orange')
    expect(clampChapterBossQuality('green')).toBe('orange')
    expect(clampChapterBossQuality('blue')).toBe('orange')
    expect(clampChapterBossQuality('purple')).toBe('orange')
    expect(clampChapterBossQuality('orange')).toBe('orange')
    expect(qualityRank('orange')).toBeGreaterThan(qualityRank('purple'))
  })

  it('keeps gray in the table but never rolls it, and value ratio rises with quality', () => {
    expect(QUALITY_TABLE.gray.weight).toBe(0)
    expect(QUALITY_IDS).toEqual(['gray', 'green', 'blue', 'purple', 'orange'])
    const ratios = (['green', 'blue', 'purple', 'orange'] as EncounterQuality[]).map(qualityValueRatio)
    expect(ratios[0]).toBeCloseTo(1)
    expect(ratios[1]).toBeCloseTo(1.4 / 1.25)
    expect(ratios[2]).toBeCloseTo(2 / 1.6)
    expect(ratios[3]).toBeCloseTo(3 / 2.2)
    expect(ratios[1]).toBeGreaterThan(ratios[0])
    expect(ratios[2]).toBeGreaterThan(ratios[1])
    expect(ratios[3]).toBeGreaterThan(ratios[2])
  })

  it('makes higher quality deals demand more, pay more, and earn a better ratio', () => {
    const baseWants = { weapon: 2, meal: 2 }
    const baseGold = pawnGoldForMap(baseWants)
    const greenNeed = scaleNeedMap(baseWants, QUALITY_TABLE.green.demandMul)
    const orangeNeed = scaleNeedMap(baseWants, QUALITY_TABLE.orange.demandMul)
    const greenGold = scaleGold(baseGold, QUALITY_TABLE.green.outputMul)
    const orangeGold = scaleGold(baseGold, QUALITY_TABLE.orange.outputMul)
    expect(orangeNeed.weapon ?? 0).toBeGreaterThan(greenNeed.weapon ?? 0)
    expect(orangeGold).toBeGreaterThan(greenGold)
    const greenNeedSum = Object.values(greenNeed).reduce((a, b) => a + (b ?? 0), 0)
    const orangeNeedSum = Object.values(orangeNeed).reduce((a, b) => a + (b ?? 0), 0)
    expect(orangeGold / orangeNeedSum).toBeGreaterThan(greenGold / greenNeedSum)
  })
})

describe('artisan and bulk buy', () => {
  it('lets an artisan take finished goods for a workshop yield buff and does not change gold', () => {
    const save = createSave()
    save.gold = 20
    put(save, 0, testArtisan({ rewardGold: 10 }))
    stock(save, { weapon: 2 })
    const now = 3_000_000_000_000
    const result = submitArtisan(save, 0, now)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.message).toContain('工坊产量 +15%')
      expect(result.message).not.toContain('金币 +')
    }
    expect(save.gold).toBe(20)
    expect(bankQty(save, 'weapon')).toBe(1)
    expect(save.encounters[0].kind === 'artisan' && save.encounters[0].completed).toBe(true)
    expect(stampLabel(save.encounters[0])).toBe('完成')
    expect(isWorkshopBuffActive(save, now)).toBe(true)
    expect(workshopBuffMul(save, now)).toBeCloseTo(1.15)
    expect(workshopBuffMul(save, now + 181_000)).toBe(1)
    expect(submitArtisan(save, 0, now).ok).toBe(false)
  })

  it('speeds the workshop while the artisan buff is active', () => {
    const save = createSave()
    expect(recruitWorker(save).ok).toBe(true)
    assignWorker(save, save.workers[0].id, 'mining')
    const plain = currentSpeed(save, 'mining')
    save.workshopBuff = { mul: 1.15, endsAt: Date.now() + 60_000 }
    expect(currentSpeed(save, 'mining')).toBeCloseTo(plain * 1.15)
    const next = ticks(save, 20)
    expect(next.stations.mining.completed).toBeGreaterThanOrEqual(1)
  })

  it('pays more than the pawnshop for the same finished goods', () => {
    const save = createSave()
    const wants = { weapon: 1 }
    const pawn = testPawn({ pawnWants: wants })
    const bulk = testBulk({ wants, rewardGold: bulkUnitGold('weapon') })
    put(save, 0, pawn)
    put(save, 1, bulk)
    save.gold = 0
    stock(save, { weapon: 2 })
    expect(pawnRewardGold(pawn)).toBe(pawnUnitGold('weapon'))
    expect(bulk.rewardGold).toBeGreaterThan(pawnRewardGold(pawn))
    expect(sellBulk(save, 1).ok).toBe(true)
    expect(save.gold).toBe(bulk.rewardGold)
    expect(bankQty(save, 'weapon')).toBe(1)
    expect(bulk.completed).toBe(true)
    expect(stampLabel(bulk)).toBe('成交')
  })

  it('refreshes completed trades and claimed loot but keeps fighting enemies', () => {
    const save = createSave()
    unlockMaxSlots(save)
    const now = 2_100_000_000_000
    const fighting = testEnemy({
      id: 'keep-fight',
      departed: true,
      combat: fightSnap(null),
    })
    const claimed = testEnemy({
      id: 'swap-claimed',
      departed: true,
      combat: fightSnap('win'),
      lootClaimed: true,
    })
    const doneArtisan = testArtisan({ id: 'swap-artisan', completed: true })
    const doneBulk = testBulk({ id: 'swap-bulk', completed: true })
    const idle = testPasserby({ id: 'swap-idle' })
    put(save, 0, fighting)
    put(save, 1, claimed)
    put(save, 2, doneArtisan)
    put(save, 3, doneBulk)
    put(save, 4, idle)
    expect(shouldKeepOnExplore(claimed, now)).toBe(false)
    expect(shouldKeepOnExplore(doneArtisan, now)).toBe(false)
    expect(exploreBoard(save, now).ok).toBe(true)
    expect(save.encounters[0].id).toBe('keep-fight')
    expect(save.encounters[1].id).not.toBe('swap-claimed')
    expect(save.encounters[2].id).not.toBe('swap-artisan')
    expect(save.encounters[3].id).not.toBe('swap-bulk')
    expect(save.encounters[4].id).not.toBe('swap-idle')
  })
})
