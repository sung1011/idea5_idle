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
  isAllowedMainNeedKind,
  isLegacyGenericToolNeed,
  isMainNeedItem,
  itemNeedBase,
  mainNeedItemPool,
  mainNeedOutputsOfStation,
  mainNeedToolTierCenter,
  needEntries,
  pickMainNeedItem,
  pickMainNeedTool,
  resolveUnlockedMainNeedItem,
  resolveMainNeedItem,
  scaledDemandQty,
  scaledMainNeed,
  exploreBlockReason,
  exploreBoard,
  exploreCost,
  generateEncounterBoard,
  isExploreProtected,
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
import { isDungeonAffixId } from './dungeon'
import { isCombatWon, isFighting } from './combat'
import { assignWorker } from './assign'
import { currentSpeed } from './query'
import { recruitWorker, spawnWorker } from './recruit'
import {
  bulkUnitGold,
  ITEM_DEF,
  isPotionItemId,
  isRuneItemId,
  isStationToolId,
  itemProducerStation,
  pawnUnitGold,
  POTION_ITEM_IDS,
  RUNE_ITEM_IDS,
} from './tables'
import {
  BATTLEFIELD_SLOT_MAX,
  BATTLEFIELD_SLOT_MIN,
  ENCOUNTER_SLOT_TECH_IDS,
  MARKET_SLOT_MAX,
  MARKET_SLOT_MIN,
  battlefieldSlotCount,
  marketSlotCount,
} from './tech'
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
  if (enc.kind === 'enemy') {
    save.encounters[index] = enc
    return
  }
  if (!Array.isArray(save.marketEncounters)) save.marketEncounters = []
  save.marketEncounters[index] = enc
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
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MIN)
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MIN)
    const enc = save.marketEncounters[0]
    expect(enc.kind).toBe('pawn')
    if (enc.kind !== 'pawn') return
    expect(enc.label).toBe(STARTER_PAWN_LABEL)
    expect(enc.quality).toBe(STARTER_PAWN_QUALITY)
    expect(enc.pawnWants).toEqual({ [STARTER_PAWN_ITEM_ID]: STARTER_PAWN_QTY })
    expect(enc.pawnWants).toEqual({ ore: 2 })
    expect(enc.rewardGold).toBe(pawnRewardGold(enc))
    expect(enc.rewardGold).toBe(scaleGold(pawnUnitGold('ore') * STARTER_PAWN_QTY, 1))
    expect(shouldKeepOnExplore(enc)).toBe(false)
    expect(isExploreProtected(enc)).toBe(false)
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
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MIN)
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MIN)
    expect(battlefieldSlotCount(save)).toBe(BATTLEFIELD_SLOT_MIN)
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MIN)
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
          expect(enc.lootGold > 0 && (enc.lootDiamonds ?? 0) > 0).toBe(false)
          if (enc.enemyRank === 'boss') {
            expect(enc.lootGold).toBe(0)
            expect(enc.lootDiamonds).toBeGreaterThan(0)
          } else {
            expect(enc.lootGold + (enc.lootDiamonds ?? 0)).toBeGreaterThan(0)
          }
        }
        if (enc.kind === 'artisan') {
          expect(needEntries(enc.wants)).toHaveLength(1)
          expect(isLegacyGenericToolNeed(needEntries(enc.wants)[0][0])).toBe(false)
          expect(enc.rewardGold > 0 && (enc.rewardDiamonds ?? 0) > 0).toBe(false)
          expect(enc.rewardGold + (enc.rewardDiamonds ?? 0)).toBeGreaterThan(0)
        }
        if (enc.kind === 'passerby') {
          expect(needEntries(enc.wants)).toHaveLength(1)
          expect(isLegacyGenericToolNeed(needEntries(enc.wants)[0][0])).toBe(false)
          expect(needEntries(enc.offers)).toHaveLength(1)
          expect(isLegacyGenericToolNeed(needEntries(enc.offers)[0][0])).toBe(false)
        }
        if (enc.kind === 'pawn') {
          expect(needEntries(enc.pawnWants)).toHaveLength(1)
          expect(isLegacyGenericToolNeed(needEntries(enc.pawnWants)[0][0])).toBe(false)
          expect((enc.rewardGold ?? 0) > 0 && (enc.rewardDiamonds ?? 0) > 0).toBe(false)
          expect((enc.rewardGold ?? 0) + (enc.rewardDiamonds ?? 0)).toBeGreaterThan(0)
        }
        if (enc.kind === 'bulkBuy') {
          expect(needEntries(enc.wants)).toHaveLength(1)
          expect(isLegacyGenericToolNeed(needEntries(enc.wants)[0][0])).toBe(false)
          expect(enc.rewardGold > 0 && (enc.rewardDiamonds ?? 0) > 0).toBe(false)
          expect(enc.rewardGold + (enc.rewardDiamonds ?? 0)).toBeGreaterThan(0)
        }
        if (enc.kind === 'blackMerchant') {
          expect(needEntries(enc.buyOffers)).toHaveLength(1)
          expect(isLegacyGenericToolNeed(needEntries(enc.buyOffers)[0][0])).toBe(false)
        }
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
    expect(BLACK_MERCHANT_DEFS.every((def) => !needEntries(def.buyOffers).some(([id]) => isLegacyGenericToolNeed(id)))).toBe(
      true,
    )
    expect(PASSERBY_DEFS.length).toBeGreaterThan(0)
    expect(PASSERBY_DEFS.every((def) => !needEntries(def.offers).some(([id]) => isLegacyGenericToolNeed(id)))).toBe(true)
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
        expect(isAllowedMainNeedKind(lowId, mainNeedItemPool({ knightLevel: 1 }))).toBe(true)
        expect(isAllowedMainNeedKind(highId, mainNeedItemPool({ knightLevel: 1 }))).toBe(true)
        if (lowId === highId) {
          expect(needEntries(highEnemy.needs)[0][1]).toBeGreaterThan(needEntries(lowEnemy.needs)[0][1])
        } else if (isRuneItemId(lowId) && isRuneItemId(highId)) {
          expect(needEntries(highEnemy.needs)[0][1]).toBeGreaterThan(needEntries(lowEnemy.needs)[0][1])
        }
        sawEnemy = true
      }
      if (lowArtisan?.kind === 'artisan' && highArtisan?.kind === 'artisan') {
        expect(needEntries(lowArtisan.wants)).toHaveLength(1)
        expect(needEntries(highArtisan.wants)).toHaveLength(1)
        expect(lowArtisan.rewardGold > 0 && (lowArtisan.rewardDiamonds ?? 0) > 0).toBe(false)
        expect(needEntries(highArtisan.wants)[0][1]).toBeGreaterThan(needEntries(lowArtisan.wants)[0][1])
        sawArtisan = true
      }
      if (sawEnemy && sawArtisan) break
    }
    expect(sawEnemy).toBe(true)
    expect(sawArtisan).toBe(true)
  })

  it('resolves old tool needs to runes and raises qty with chapter/quality', () => {
    expect(MAIN_NEED_ITEM_POOL).toContain('runeSharp')
    expect(MAIN_NEED_TOOL_POOL).toEqual([...RUNE_ITEM_IDS])
    expect(MAIN_NEED_TOOL_POOL).not.toContain('tool')
    expect(MAIN_NEED_TOOL_POOL).not.toContain('ironTool')
    expect(MAIN_NEED_TOOL_POOL).not.toContain('mithrilTool')
    expect(isRuneItemId(pickMainNeedTool('green', 1, false, undefined, 0))).toBe(true)
    expect(isRuneItemId(resolveMainNeedItem('tool', 'green', 1, false, undefined, 0))).toBe(true)
    expect(resolveMainNeedItem('meal', 'green', 1)).toBe('meal')
    expect(isMainNeedItem('runeSharp')).toBe(true)
    expect(isMainNeedItem('tool')).toBe(false)
    expect(itemNeedBase('runeSharp')).toBe(2)
    expect(mainNeedToolTierCenter('green', 1)).toBeCloseTo(1)
    expect(mainNeedToolTierCenter('orange', 8)).toBeGreaterThan(mainNeedToolTierCenter('green', 1))
    expect(mainNeedToolTierCenter('orange', 8)).toBeGreaterThan(mainNeedToolTierCenter('green', 8))
    const highTool = pickMainNeedTool('orange', 16, true, undefined, 0)
    expect(isRuneItemId(highTool)).toBe(true)
  })
})

describe('unlock-gated main need pool', () => {
  it('expands by currently unlocked stations, not chapter number', () => {
    expect(mainNeedOutputsOfStation('herbalism')).toEqual(['herb', 'spice'])
    expect(mainNeedOutputsOfStation('alchemy')).toEqual([...POTION_ITEM_IDS])
    expect(mainNeedOutputsOfStation('hunting')).toEqual(['meat', 'fish', 'tooth', 'blood', 'eye', 'junk'])
    expect(mainNeedOutputsOfStation('cooking')).toEqual(['meal', 'roast', 'stew'])
    expect(mainNeedOutputsOfStation('mining')).toEqual(['ore', 'ironOre', 'mithrilOre'])
    expect(mainNeedOutputsOfStation('inscription')).toEqual([...RUNE_ITEM_IDS])
    expect(mainNeedItemPool({ knightLevel: 1 })).toEqual(['herb', 'spice'])
    expect(mainNeedItemPool({ knightLevel: 2 })).toEqual(['herb', 'spice', ...POTION_ITEM_IDS])
    expect(mainNeedItemPool({ knightLevel: 4 })).toEqual(['herb', 'spice', ...POTION_ITEM_IDS])
    expect(mainNeedItemPool({ knightLevel: 5 })).toEqual([
      'herb',
      'spice',
      ...POTION_ITEM_IDS,
      'meat',
      'fish',
      'tooth',
      'blood',
      'eye',
      'junk',
    ])
    expect(mainNeedItemPool({ knightLevel: 5 })).not.toContain('meal')
    expect(mainNeedItemPool({ knightLevel: 6 })).toContain('meal')
    expect(mainNeedItemPool({ knightLevel: 6 })).toContain('roast')
    expect(mainNeedItemPool({ knightLevel: 6 })).toContain('stew')
    expect(mainNeedItemPool({ knightLevel: 6 })).not.toContain('ore')
    expect(mainNeedItemPool({ knightLevel: 8 })).toContain('meal')
    expect(mainNeedItemPool({ knightLevel: 8 })).not.toContain('ore')
    expect(mainNeedItemPool({ knightLevel: 9 })).toContain('ore')
    expect(mainNeedItemPool({ knightLevel: 9 })).toContain('ironOre')
    expect(mainNeedItemPool({ knightLevel: 9 })).toContain('mithrilOre')
    expect(mainNeedItemPool({ knightLevel: 9 })).not.toContain('runeSharp')
    expect(mainNeedItemPool({ knightLevel: 10 })).toContain('runeSharp')
    expect(mainNeedItemPool()).toEqual(['herb', 'spice'])
    expect(MAIN_NEED_ITEM_POOL).toEqual(mainNeedItemPool({ knightLevel: 10 }))
    expect(MAIN_NEED_ITEM_POOL).not.toContain('potion')
  })

  it('picks only herbalism goods at knight 1 and potions once alchemy unlocks', () => {
    const lv1 = new Set<ItemId>()
    const lv2 = new Set<ItemId>()
    for (let seed = 1; seed <= 80; seed++) {
      lv1.add(pickMainNeedItem({ rngState: seed }, 'green', 8, false, { knightLevel: 1 }))
      lv2.add(pickMainNeedItem({ rngState: seed }, 'green', 1, false, { knightLevel: 2 }))
    }
    expect([...lv1].sort()).toEqual(['herb', 'spice'])
    expect([...lv2].every((id) => id === 'herb' || id === 'spice' || isPotionItemId(id))).toBe(true)
    expect([...lv2].some((id) => isPotionItemId(id))).toBe(true)
    expect(lv2.has('potion')).toBe(false)
    expect(lv2.has('meal')).toBe(false)
  })

  it('still resolves tool and potion markers inside the allowed pool', () => {
    expect(isRuneItemId(resolveMainNeedItem('tool', 'green', 1, false, undefined, 0))).toBe(true)
    expect(isPotionItemId(resolveMainNeedItem('potion', 'green', 1, false, undefined, 0))).toBe(true)
    expect(resolveUnlockedMainNeedItem('tool', 'green', 1, false, undefined, 0, { knightLevel: 1 })).toMatch(
      /^herb|spice$/,
    )
    expect(
      isPotionItemId(resolveUnlockedMainNeedItem('potion', 'green', 1, false, undefined, 0, { knightLevel: 2 })),
    ).toBe(true)
    expect(
      isRuneItemId(resolveUnlockedMainNeedItem('tool', 'green', 1, false, undefined, 0, { knightLevel: 10 })),
    ).toBe(true)
    expect(resolveUnlockedMainNeedItem('salve', 'green', 1, false, undefined, 0, { knightLevel: 2 })).toBe('salve')
    expect(resolveUnlockedMainNeedItem('meal', 'green', 1, false, undefined, 0, { knightLevel: 6 })).toBe('meal')
    expect(resolveUnlockedMainNeedItem('meal', 'green', 1, false, undefined, 3, { knightLevel: 1 })).toMatch(
      /^herb|spice$/,
    )
  })

  it('gates new battlefield needs and market wants; starter copper pawn stays ore ×2', () => {
    const save = createSave()
    expect(save.knightLevel).toBe(1)
    expect(save.mainChapter).toBe(1)
    expect(save.marketEncounters[0].kind).toBe('pawn')
    if (save.marketEncounters[0].kind === 'pawn') {
      expect(save.marketEncounters[0].pawnWants).toEqual({ ore: 2 })
    }
    for (const enc of save.encounters) {
      expect(enc.kind).toBe('enemy')
      if (enc.kind !== 'enemy') continue
      expect(['herb', 'spice']).toContain(needEntries(enc.needs)[0][0])
    }

    const lv1Save = createSave()
    lv1Save.knightLevel = 1
    const lv1Market = generateEncounterBoard(9, 4, {
      board: 'market',
      mainChapter: 8,
      save: lv1Save,
    })
    for (const enc of lv1Market) {
      if (enc.kind === 'passerby' || enc.kind === 'artisan' || enc.kind === 'bulkBuy') {
        expect(['herb', 'spice']).toContain(needEntries(enc.wants)[0][0])
      }
      if (enc.kind === 'pawn') {
        expect(['herb', 'spice']).toContain(needEntries(enc.pawnWants)[0][0])
      }
    }

    const openSave = createSave()
    openSave.knightLevel = 10
    let sawTool = false
    let sawPotion = false
    for (let seed = 0; seed < 60; seed++) {
      const battle = generateEncounterBoard(seed, 4, {
        board: 'battlefield',
        mainChapter: 1,
        save: openSave,
      })
      for (const enc of battle) {
        if (enc.kind !== 'enemy') continue
        const id = needEntries(enc.needs)[0][0]
        if (isRuneItemId(id)) sawTool = true
        if (isPotionItemId(id)) sawPotion = true
      }
      if (sawTool && sawPotion) break
    }
    expect(sawTool).toBe(true)
    expect(sawPotion).toBe(true)
  })
})

describe('exploreBoard', () => {
  it('deducts gold and replaces refreshable slots on the current board', () => {
    const save = createSave()
    const beforeGold = save.gold
    const beforeCost = exploreCost(save)
    const beforeSig = boardSignature([...save.encounters, ...save.marketEncounters])
    expect(beforeCost).toBe(EXPLORE_COST_TABLE[0])

    const result = exploreBoard(save)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('探索完成')
    expect(save.gold).toBe(beforeGold - beforeCost)
    expect(save.exploreCount).toBe(1)
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MIN)
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MIN)
    expect(boardSignature([...save.encounters, ...save.marketEncounters])).not.toBe(beforeSig)
  })

  it('does not explore when gold is short', () => {
    const save = createSave()
    const beforeSig = boardSignature([...save.encounters, ...save.marketEncounters])
    save.gold = 0
    expect(canExplore(save)).toBe(false)
    expect(exploreBlockReason(save)).toContain('金币不够')
    expect(exploreBlockReason(save)).toContain('探索')
    const result = exploreBoard(save)
    expect(result.ok).toBe(false)
    expect(save.gold).toBe(0)
    expect(save.exploreCount).toBe(0)
    expect(boardSignature([...save.encounters, ...save.marketEncounters])).toBe(beforeSig)
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
    const extra = testEnemy({ id: 'swap-sixth' })
    save.encounters = [fighting, won, idle, extra]
    save.marketEncounters = [passerby]

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
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MAX)
    expect(save.encounters.every((enc) => enc.kind === 'enemy')).toBe(true)
    expect(save.encounters[0].id).toBe('keep-fight')
    expect(save.encounters[1].id).toBe('keep-win')
    expect(save.encounters[2].id).not.toBe('swap-idle')
    expect(save.encounters.map((enc) => enc.id)).not.toContain('swap-sixth')
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MAX)
    expect(save.marketEncounters.every((enc) => enc.kind !== 'enemy')).toBe(true)
    expect(save.marketEncounters.some((enc) => enc.id === 'swap-passerby')).toBe(false)
  })

  it('marks explore-protected orders and shares shouldKeepOnExplore', () => {
    const now = 2_000_000_000_000
    const fighting = testEnemy({ id: 'fix-fight', departed: true, combat: fightSnap(null) })
    const won = testEnemy({ id: 'fix-win', departed: true, combat: fightSnap('win') })
    const lost = testEnemy({ id: 'fix-lose', departed: true, combat: fightSnap('lose') })
    const idleBoss = testEnemy({
      id: 'fix-idle-boss',
      chapterBoss: true,
      enemyRank: 'boss',
      departed: false,
      combat: null,
    })
    const idle = testEnemy({ id: 'fix-idle' })
    const claimed = testEnemy({
      id: 'fix-claimed',
      departed: true,
      combat: fightSnap('win'),
      lootClaimed: true,
    })
    const claimedBoss = testEnemy({
      id: 'fix-claimed-boss',
      chapterBoss: true,
      enemyRank: 'boss',
      departed: true,
      combat: fightSnap('win'),
      lootClaimed: true,
    })
    const samples = [
      fighting,
      won,
      lost,
      idleBoss,
      idle,
      claimed,
      claimedBoss,
      testPasserby({ id: 'fix-passerby' }),
      testPawn({ id: 'fix-pawn' }),
      testArtisan({ id: 'fix-artisan' }),
      testBulk({ id: 'fix-bulk' }),
      testBlackMerchant({ id: 'fix-buy' }),
      makeStarterCopperPawn(),
    ]
    for (const enc of samples) {
      expect(isExploreProtected(enc, now)).toBe(shouldKeepOnExplore(enc, now))
    }
    expect(isExploreProtected(fighting, now)).toBe(true)
    expect(isExploreProtected(won, now)).toBe(true)
    expect(isExploreProtected(lost, now)).toBe(true)
    expect(isExploreProtected(idleBoss, now)).toBe(true)
    expect(isExploreProtected(idle, now)).toBe(false)
    expect(isExploreProtected(claimed, now)).toBe(false)
    expect(isExploreProtected(claimedBoss, now)).toBe(false)
    expect(isExploreProtected(testPasserby({ id: 'fix-market' }), now)).toBe(false)
    expect(isExploreProtected(makeStarterCopperPawn(), now)).toBe(false)
  })

  it('keeps battlefield as enemies and market as trades when exploring', () => {
    const save = createSave()
    unlockMaxSlots(save)
    save.gold = 10_000
    const now = 3_000_000_000_000
    save.encounters = [
      testEnemy({ id: 'keep-0', departed: true, combat: fightSnap(null) }),
      testEnemy({ id: 'keep-2', departed: true, combat: fightSnap(null) }),
      testEnemy({ id: 'keep-3', departed: true, combat: fightSnap(null) }),
    ]
    save.marketEncounters = [
      testPasserby({ id: 'empty-1' }),
      testArtisan({ id: 'empty-4' }),
      testBulk({ id: 'empty-5' }),
    ]
    expect(exploreBoard(save, now).ok).toBe(true)
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MAX)
    expect(save.encounters.every((enc) => enc.kind === 'enemy')).toBe(true)
    expect(save.encounters[0].id).toBe('keep-0')
    expect(save.encounters.some((enc) => enc.id === 'keep-2')).toBe(true)
    expect(save.encounters.some((enc) => enc.id === 'keep-3')).toBe(true)
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MAX)
    expect(save.marketEncounters.every((enc) => enc.kind !== 'enemy')).toBe(true)
    expect(save.marketEncounters.some((enc) => enc.id === 'empty-1')).toBe(false)
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

  it('claims diamonds instead of gold when the order is a diamond drop', () => {
    const save = createSave()
    save.gold = 10
    save.diamonds = 4
    const enemy = testEnemy({
      departed: true,
      combat: fightSnap('win'),
      lootGold: 0,
      lootDiamonds: 3,
    })
    put(save, 0, enemy)
    const result = claimLoot(save, 0, 2_000)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('钻石 +3')
    expect(save.gold).toBe(10)
    expect(save.diamonds).toBe(7)
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

  it('keeps a leftover multi-item enemy needs map so an old fighting order is not rewritten', () => {
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
    expect(save.marketEncounters[0].kind === 'blackMerchant' && save.marketEncounters[0].completed).toBe(true)
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
    save.marketEncounters = []
    hydrateEncounterFields(save)
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MIN)
    expect(save.encounters.every((enc) => enc.kind === 'enemy')).toBe(true)
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MIN)
    expect(save.marketEncounters[0].kind).toBe('pawn')
    if (save.marketEncounters[0].kind !== 'pawn') return
    expect(save.marketEncounters[0].pawnWants).toEqual({ ore: 2 })
    expect(save.marketEncounters[0].label).toBe('铜矿当')
  })

  it('does not force a starter copper pawn onto an existing old board', () => {
    const save = createSave()
    save.encounters = [testEnemy({ id: 'legacy-keep' })]
    save.marketEncounters = []
    hydrateEncounterFields(save)
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MIN)
    expect(save.encounters[0].id).toBe('legacy-keep')
    expect(save.encounters.every((enc) => enc.kind === 'enemy')).toBe(true)
    expect(save.marketEncounters.every((enc) => enc.kind !== 'enemy')).toBe(true)
    expect(
      [...save.encounters, ...save.marketEncounters].some((enc) => enc.kind === 'pawn' && enc.label === '铜矿当'),
    ).toBe(false)
  })

  it('builds a 4-slot board and migrates a legacy order into the first enemy', () => {
    const save = createSave() as Save & {
      currentOrderId?: string
      orderIndex?: number
      orderSubmitted?: boolean
      encounters: Save['encounters']
    }
    save.encounters = []
    save.marketEncounters = []
    save.currentOrderId = 'campKitchen'
    save.orderIndex = 2
    save.orderSubmitted = true
    hydrateEncounterFields(save)
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MIN)
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
    save.marketEncounters = []
    hydrateEncounterFields(save)
    expect(save.encounters.every((enc) => enc.kind === 'enemy')).toBe(true)
    expect(save.marketEncounters[0].kind).toBe('passerby')
    if (save.marketEncounters[0].kind !== 'passerby') return
    expect(save.marketEncounters[0].id).toContain('merchantBarter')
    expect(save.marketEncounters[0].wants).toEqual({ wood: 4 })
    expect(save.marketEncounters[0].offers).toEqual({ meal: 1 })
    expect(save.marketEncounters[0].quality).toBe('green')
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
    save.marketEncounters = []
    hydrateEncounterFields(save)
    expect(save.workshopBuff).toBeNull()
    expect(save.encounters.every((enc) => enc.kind === 'enemy')).toBe(true)
    expect(save.marketEncounters[0].kind).toBe('blackMerchant')
    if (save.marketEncounters[0].kind === 'blackMerchant') {
      expect(save.marketEncounters[0].quality).toBe('green')
      expect(save.marketEncounters[0].completed).toBe(true)
    }
    expect(save.marketEncounters[1].kind).toBe('pawn')
    if (save.marketEncounters[1].kind === 'pawn') {
      expect(save.marketEncounters[1].quality).toBe('green')
      expect(save.marketEncounters[1].pawnWants).toEqual({ weapon: 1 })
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

  it('keeps a leftover fighting enemy when splitting an old mixed board', () => {
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
    save.marketEncounters = []
    hydrateEncounterFields(save)
    expect(save.encounters.every((enc) => enc.kind === 'enemy')).toBe(true)
    expect(save.encounters[0].id).toBe('keep-five-pad')
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MIN)
    expect(save.marketEncounters.every((enc) => enc.kind !== 'enemy')).toBe(true)
  })

  it('remaps leftover generic tool and potion consume maps so old orders can jump', () => {
    const save = createSave()
    unlockMaxSlots(save)
    save.encounters = [
      testEnemy({ id: 'old-tool-need', needs: { tool: 2 } }),
      testEnemy({ id: 'old-potion-need', needs: { potion: 3 } }),
    ]
    save.marketEncounters = [
      testPasserby({ id: 'old-barter-tool', wants: { ironTool: 1 }, offers: { tool: 1 } }),
      testBlackMerchant({ id: 'old-buy-tool', buyOffers: { mithrilTool: 1 } }),
      testPawn({ id: 'old-pawn-tool', pawnWants: { tool: 1 } }),
    ]
    hydrateEncounterFields(save)

    const enemyIdx = save.encounters.findIndex((enc) => enc.id === 'old-tool-need')
    const enemy = save.encounters[enemyIdx]
    expect(enemy?.kind).toBe('enemy')
    if (enemy?.kind !== 'enemy') return
    const needId = needEntries(enemy.needs)[0][0]
    expect(needId).toBe(resolveMainNeedItem('tool', 'green', save.mainChapter, false, undefined, enemyIdx))
    expect(isRuneItemId(needId)).toBe(true)
    expect(isLegacyGenericToolNeed(needId)).toBe(false)
    expect(enemy.needs[needId]).toBe(2)
    expect(itemProducerStation(needId)).toBe('inscription')

    const potionEnemy = save.encounters.find((enc) => enc.id === 'old-potion-need')
    expect(potionEnemy?.kind === 'enemy' && potionEnemy.needs).toEqual({ salve: 3 })
    expect(itemProducerStation('salve')).toBe('alchemy')

    const barterIdx = save.marketEncounters.findIndex((enc) => enc.id === 'old-barter-tool')
    const barter = save.marketEncounters[barterIdx]
    expect(barter?.kind).toBe('passerby')
    if (barter?.kind !== 'passerby') return
    const wantId = needEntries(barter.wants)[0][0]
    const offerId = needEntries(barter.offers)[0][0]
    expect(wantId).toBe(resolveMainNeedItem('ironTool', 'green', save.mainChapter, false, undefined, barterIdx + 17))
    expect(offerId).toBe(resolveMainNeedItem('tool', 'green', save.mainChapter, false, undefined, barterIdx + 7))
    expect(isLegacyGenericToolNeed(wantId)).toBe(false)
    expect(isLegacyGenericToolNeed(offerId)).toBe(false)
    expect(itemProducerStation(wantId)).toBe('inscription')
    expect(itemProducerStation(offerId)).toBe('inscription')

    const buyIdx = save.marketEncounters.findIndex((enc) => enc.id === 'old-buy-tool')
    const buy = save.marketEncounters[buyIdx]
    expect(buy?.kind).toBe('blackMerchant')
    if (buy?.kind !== 'blackMerchant') return
    const buyId = needEntries(buy.buyOffers)[0][0]
    expect(buyId).toBe(resolveMainNeedItem('mithrilTool', 'green', save.mainChapter, false, undefined, buyIdx + 31))
    expect(isLegacyGenericToolNeed(buyId)).toBe(false)
    expect(itemProducerStation(buyId)).toBe('inscription')

    const pawnIdx = save.marketEncounters.findIndex((enc) => enc.id === 'old-pawn-tool')
    const pawn = save.marketEncounters[pawnIdx]
    expect(pawn?.kind).toBe('pawn')
    if (pawn?.kind !== 'pawn') return
    const pawnId = needEntries(pawn.pawnWants)[0][0]
    expect(pawnId).toBe(resolveMainNeedItem('tool', 'green', save.mainChapter, false, undefined, pawnIdx))
    expect(isLegacyGenericToolNeed(pawnId)).toBe(false)
    expect(itemProducerStation(pawnId)).toBe('inscription')
  })

  it('fills missing break-shield fields on a mid-fight enemy', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    save.encounters = [
      testEnemy({
        id: 'old-fight',
        departed: true,
        combat: {
          startedAt: 1_000,
          timeoutAt: 901_000,
          workerIds: [worker.id],
          workers: [
            {
              id: worker.id,
              label: worker.name ?? worker.id,
              hp: worker.hp,
              hpMax: worker.hpMax,
              atk: 4,
              spd: 5,
              nextActAt: 6_000,
            },
          ],
          enemy: {
            id: 'enemy',
            label: '试敌',
            hp: 2_000,
            hpMax: 2_400,
            atk: 3,
            spd: 20,
            nextActAt: 1_000,
          },
          logs: [],
          outcome: null,
        },
      }),
    ]
    save.marketEncounters = []
    hydrateEncounterFields(save)
    const after = save.encounters.find((enc) => enc.id === 'old-fight')
    expect(after?.kind).toBe('enemy')
    if (after?.kind !== 'enemy') return
    expect(after.combat?.shieldMax).toBeGreaterThanOrEqual(2)
    expect(after.combat?.shieldMax).toBeLessThanOrEqual(3)
    expect(after.combat?.shield).toBe(after.combat?.shieldMax)
    expect(after.combat?.stunnedUntil).toBeNull()
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
    put(save, 0, testArtisan({ rewardGold: 0 }))
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
    expect(save.marketEncounters[0].kind === 'artisan' && save.marketEncounters[0].completed).toBe(true)
    expect(stampLabel(save.marketEncounters[0])).toBe('完成')
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
    save.encounters = [fighting, claimed]
    save.marketEncounters = [doneArtisan, doneBulk, idle]
    expect(shouldKeepOnExplore(claimed, now)).toBe(false)
    expect(shouldKeepOnExplore(doneArtisan, now)).toBe(false)
    expect(exploreBoard(save, now).ok).toBe(true)
    expect(save.encounters[0].id).toBe('keep-fight')
    expect(save.encounters.some((enc) => enc.id === 'swap-claimed')).toBe(false)
    expect(save.encounters.every((enc) => enc.kind === 'enemy')).toBe(true)
    expect(save.marketEncounters.every((enc) => enc.kind !== 'enemy')).toBe(true)
    expect(save.marketEncounters.some((enc) => enc.id === 'swap-artisan')).toBe(false)
    expect(save.marketEncounters.some((enc) => enc.id === 'swap-bulk')).toBe(false)
    expect(save.marketEncounters.some((enc) => enc.id === 'swap-idle')).toBe(false)
  })
})

describe('battlefield affixes', () => {
  it('rolls one affix per battlefield enemy and none on market orders', () => {
    const save = createSave()
    expect(save.encounters.every((enc) => enc.kind === 'enemy' && isDungeonAffixId(enc.affixId))).toBe(true)
    expect(save.marketEncounters.every((enc) => !('affixId' in enc && enc.affixId))).toBe(true)
  })

  it('re-rolls the affix when explore replaces a battlefield slot', () => {
    const save = createSave()
    const idle = testEnemy({ id: 'swap-affix', affixId: 'thickHide' })
    const fighting = testEnemy({
      id: 'keep-affix',
      affixId: 'jagged',
      departed: true,
      combat: fightSnap(null),
    })
    save.encounters = [fighting, idle]
    expect(exploreBoard(save).ok).toBe(true)
    expect(save.encounters[0].id).toBe('keep-affix')
    expect(save.encounters[0].kind === 'enemy' && save.encounters[0].affixId).toBe('jagged')
    const refreshed = save.encounters[1]
    expect(refreshed.kind).toBe('enemy')
    if (refreshed.kind !== 'enemy') return
    expect(refreshed.id).not.toBe('swap-affix')
    expect(isDungeonAffixId(refreshed.affixId)).toBe(true)
  })

  it('pads a missing affix on hydrate but leaves a live fight untouched', () => {
    const save = createSave()
    const idle = testEnemy({ id: 'pad-idle' })
    delete idle.affixId
    const fighting = testEnemy({
      id: 'pad-fight',
      departed: true,
      combat: fightSnap(null),
    })
    delete fighting.affixId
    save.encounters = [idle, fighting]
    hydrateEncounterFields(save)
    expect(save.encounters[0].kind === 'enemy' && isDungeonAffixId(save.encounters[0].affixId)).toBe(true)
    expect(save.encounters[1].kind === 'enemy' && save.encounters[1].affixId).toBeUndefined()
  })
})

describe('gold or diamond order rewards', () => {
  it('gives bosses diamonds and keeps starter pawn on gold', () => {
    const field = generateEncounterBoard(0, 2, { board: 'battlefield', mainLootClaims: 10 })
    const boss = field.find((enc) => enc.kind === 'enemy' && enc.chapterBoss)
    expect(boss?.kind).toBe('enemy')
    if (boss?.kind !== 'enemy') return
    expect(boss.enemyRank).toBe('boss')
    expect(boss.lootGold).toBe(0)
    expect(boss.lootDiamonds).toBeGreaterThan(0)

    const starter = makeStarterCopperPawn()
    expect(starter.rewardGold).toBeGreaterThan(0)
    expect(starter.rewardDiamonds).toBe(0)
  })

  it('pays artisan diamonds when the order rolled diamonds', () => {
    const save = createSave()
    save.gold = 8
    save.diamonds = 2
    const artisan = testArtisan({ rewardGold: 0, rewardDiamonds: 2 })
    put(save, 0, artisan)
    stock(save, { weapon: 1 })
    const result = submitArtisan(save, 0, 4_000)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('钻石 +2')
    expect(save.gold).toBe(8)
    expect(save.diamonds).toBe(4)
  })
})
