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
  QUALITY_IDS,
  QUALITY_TABLE,
  barterMerchant,
  boardSignature,
  buyMerchant,
  canClaimLoot,
  canDepartEncounter,
  canExplore,
  claimLoot,
  claimLootBlockReason,
  departBlockReason,
  departEncounter,
  enemyLootGoldFor,
  enemyNeedsFor,
  exploreBlockReason,
  exploreBoard,
  exploreCost,
  generateEncounterBoard,
  hydrateEncounterFields,
  isEncounterDone,
  isMerchantKind,
  isTradeKind,
  isWorkshopBuffActive,
  marchDurationS,
  pawnGoldForMap,
  pawnMerchant,
  pawnRewardGold,
  qualityValueRatio,
  scaleGold,
  scaleNeedMap,
  sellBulk,
  shouldKeepOnExplore,
  stampLabel,
  submitArtisan,
  workshopBuffMul,
} from './encounters'
import { settleOffline } from './offline'
import { assignWorker } from './assign'
import { currentSpeed } from './query'
import { recruitWorker } from './recruit'
import { bulkUnitGold, pawnUnitGold } from './tables'
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

function firstOf<K extends Save['encounters'][number]['kind']>(save: Save, kind: K): number {
  return save.encounters.findIndex((enc) => enc.kind === kind)
}

function put(save: Save, index: number, enc: Save['encounters'][number]) {
  save.encounters[index] = enc
}

function testEnemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'test-enemy',
    label: '试敌',
    quality: 'green',
    distance: 'near',
    power: 'weak',
    needs: { weapon: 1, meal: 1 },
    lootGold: enemyLootGoldFor('near', 'weak'),
    departed: false,
    marchEndsAt: null,
    lootClaimed: false,
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
    rewardGold: 10,
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

function needSnapshot(save: Save, map: EncounterNeedMap): Record<ItemId, number> {
  const out = {} as Record<ItemId, number>
  for (const itemId of Object.keys(map) as ItemId[]) {
    out[itemId] = bankQty(save, itemId)
  }
  return out
}

describe('encounter board', () => {
  it('always has 6 slots and can roll all 6 kinds without gray', () => {
    const save = createSave()
    expect(save.encounters).toHaveLength(ENCOUNTER_SLOT_COUNT)
    expect(save.workshopBuff).toBeNull()

    const seenKinds = new Set<string>()
    const seenQualities = new Set<string>()
    for (let seed = 0; seed < 80; seed++) {
      const board = generateEncounterBoard(seed)
      expect(board).toHaveLength(6)
      for (const enc of board) {
        seenKinds.add(enc.kind)
        seenQualities.add(enc.quality)
        expect(enc.quality).not.toBe('gray')
        expect(QUALITY_TABLE[enc.quality].weight).toBeGreaterThan(0)
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

  it('gives far encounters more food and strong encounters more ore/weapons', () => {
    const nearWeak = enemyNeedsFor('near', 'weak')
    const farWeak = enemyNeedsFor('far', 'weak')
    const nearStrong = enemyNeedsFor('near', 'strong')
    expect(farWeak.meal ?? 0).toBeGreaterThan(nearWeak.meal ?? 0)
    expect(farWeak.fish ?? 0).toBeGreaterThan(nearWeak.fish ?? 0)
    expect(nearStrong.weapon ?? 0).toBe(0)
    expect(nearStrong.ore ?? 0).toBeGreaterThan(nearWeak.ore ?? 0)
  })
})

describe('exploreBoard', () => {
  it('deducts gold and replaces refreshable slots on the 6-slot board', () => {
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
    expect(save.encounters).toHaveLength(6)
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

  it('keeps marching or loot-ready enemies and replaces idle or claimed ones', () => {
    const save = createSave()
    const now = 2_000_000_000_000
    const marching = testEnemy({
      id: 'keep-march',
      departed: true,
      marchEndsAt: now + 10 * 60 * 1000,
    })
    const lootReady = testEnemy({
      id: 'keep-loot',
      departed: true,
      marchEndsAt: now - 1000,
    })
    const idle = testEnemy({ id: 'swap-idle' })
    const claimed = testEnemy({
      id: 'swap-claimed',
      departed: true,
      marchEndsAt: now - 1000,
      lootClaimed: true,
    })
    const passerby = testPasserby({ id: 'swap-passerby' })
    const sixth = testEnemy({ id: 'swap-sixth' })
    put(save, 0, marching)
    put(save, 1, lootReady)
    put(save, 2, idle)
    put(save, 3, claimed)
    put(save, 4, passerby)
    put(save, 5, sixth)

    expect(shouldKeepOnExplore(marching, now)).toBe(true)
    expect(shouldKeepOnExplore(lootReady, now)).toBe(true)
    expect(shouldKeepOnExplore(idle, now)).toBe(false)
    expect(shouldKeepOnExplore(claimed, now)).toBe(false)
    expect(shouldKeepOnExplore(passerby, now)).toBe(false)

    const result = exploreBoard(save, now)
    expect(result.ok).toBe(true)
    expect(save.encounters).toHaveLength(6)
    expect(save.encounters[0].id).toBe('keep-march')
    expect(save.encounters[1].id).toBe('keep-loot')
    expect(save.encounters[2].id).not.toBe('swap-idle')
    expect(save.encounters[3].id).not.toBe('swap-claimed')
    expect(save.encounters[4].id).not.toBe('swap-passerby')
    expect(save.encounters[5].id).not.toBe('swap-sixth')
  })
})

describe('enemy march and loot', () => {
  it('one-click depart fails when short and does not take goods or start a march', () => {
    const save = createSave()
    const index = firstOf(save, 'enemy')
    const enemy = save.encounters[index]
    expect(enemy.kind).toBe('enemy')
    if (enemy.kind !== 'enemy') return

    save.bank.weapon = 0
    save.bank.meal = 0
    const bankBefore = { ...save.bank }
    expect(canDepartEncounter(save, index)).toBe(false)
    expect(departBlockReason(save, index)).toContain('货不够')
    const result = departEncounter(save, index)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('货不够')
    expect(save.bank).toEqual(bankBefore)
    expect(save.departCount).toBe(0)
    expect(save.lastDepartAt).toBeNull()
    expect(enemy.departed).toBe(false)
    expect(enemy.marchEndsAt).toBeNull()
    expect(enemy.submitted).toBeUndefined()
  })

  it('one click takes all supplies and starts the march without paying gold', () => {
    const save = createSave()
    save.gold = 10
    const index = firstOf(save, 'enemy')
    const enemy = save.encounters[index]
    expect(enemy.kind).toBe('enemy')
    if (enemy.kind !== 'enemy') return

    stock(save, { weapon: 4, meal: 4, fish: 4, ore: 4, wood: 4 })
    const now = 1_700_000_000_000
    const bankBefore = needSnapshot(save, enemy.needs)
    expect(canDepartEncounter(save, index)).toBe(true)
    const result = departEncounter(save, index, now)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('已出发，行军')
    expect(save.gold).toBe(10)
    for (const [itemId, qty] of Object.entries(enemy.needs) as Array<[ItemId, number]>) {
      expect(bankQty(save, itemId)).toBe(bankBefore[itemId] - qty)
    }
    expect(save.departCount).toBe(1)
    expect(save.lastDepartAt).toBe(now)
    expect(enemy.departed).toBe(true)
    expect(enemy.submitted).toBeUndefined()
    expect(enemy.lootClaimed).toBe(false)
    expect(enemy.marchEndsAt).toBe(now + marchDurationS(enemy.distance, enemy.power) * 1000)
    expect(canClaimLoot(save, index, now)).toBe(false)
    expect(claimLootBlockReason(save, index, now)).toBe('行军尚未结束')
    expect(departEncounter(save, index, now + 1000).ok).toBe(false)
  })

  it('lets a leftover submitted save depart without taking goods again', () => {
    const save = createSave()
    save.gold = 6
    save.bank = { weapon: 1, meal: 1 }
    const enemy = testEnemy({
      needs: { weapon: 2, meal: 2 },
      submitted: true,
    })
    put(save, 0, enemy)
    const now = 1_710_000_000_000
    const result = departEncounter(save, 0, now)
    expect(result.ok).toBe(true)
    expect(save.bank).toEqual({ weapon: 1, meal: 1 })
    expect(save.gold).toBe(6)
    expect(enemy.departed).toBe(true)
    expect(enemy.submitted).toBeUndefined()
    expect(enemy.marchEndsAt).toBe(now + marchDurationS(enemy.distance, enemy.power) * 1000)
  })

  it('cannot claim loot before the march ends', () => {
    const save = createSave()
    const now = 1_800_000_000_000
    put(save, 0, testEnemy({ departed: true, marchEndsAt: now + 60_000 }))
    const gold = save.gold
    const result = claimLoot(save, 0, now)
    expect(result.ok).toBe(false)
    expect(claimLootBlockReason(save, 0, now)).toBe('行军尚未结束')
    expect(save.gold).toBe(gold)
    if (save.encounters[0].kind === 'enemy') expect(save.encounters[0].lootClaimed).toBe(false)
  })

  it('claims table gold only after the march ends and does not add bank items', () => {
    const save = createSave()
    save.gold = 10
    save.bank = { wood: 2, meal: 1 }
    const enemy = testEnemy({
      departed: true,
      marchEndsAt: 1_000,
      lootGold: 14,
    })
    put(save, 0, enemy)
    const result = claimLoot(save, 0, 2_000)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('金币 +14')
    expect(save.gold).toBe(24)
    expect(save.bank).toEqual({ wood: 2, meal: 1 })
    expect(enemy.lootClaimed).toBe(true)
    expect(claimLoot(save, 0, 3_000).ok).toBe(false)
  })

  it('can claim loot after offline time crosses the march end', () => {
    const save = createSave()
    save.gold = 10
    save.bank = { ore: 3 }
    const now = 5_000_000
    const durationS = marchDurationS('near', 'weak')
    put(
      save,
      0,
      testEnemy({
        departed: true,
        marchEndsAt: now + durationS * 1000,
        lootGold: 8,
      }),
    )
    save.lastTick = now
    const later = now + (durationS + 30) * 1000
    const offline = settleOffline(save, later)
    expect(offline.save.encounters[0].kind).toBe('enemy')
    if (offline.save.encounters[0].kind !== 'enemy') return
    expect(offline.save.encounters[0].lootClaimed).toBe(false)
    expect(offline.save.gold).toBe(10)
    expect(bankQty(offline.save, 'ore')).toBe(3)

    const result = claimLoot(offline.save, 0, later)
    expect(result.ok).toBe(true)
    expect(offline.save.gold).toBe(18)
    expect(bankQty(offline.save, 'ore')).toBe(3)
    if (offline.save.encounters[0].kind === 'enemy') {
      expect(offline.save.encounters[0].lootClaimed).toBe(true)
    }
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
  it('builds a 6-slot board and migrates a legacy order into the first enemy', () => {
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
    expect(save.encounters).toHaveLength(6)
    expect(save.encounters[0].kind).toBe('enemy')
    if (save.encounters[0].kind !== 'enemy') return
    expect(save.encounters[0].id).toBe('campKitchen')
    expect(save.encounters[0].label).toBe('营地开伙')
    expect(save.encounters[0].submitted).toBe(true)
    expect(save.encounters[0].departed).toBe(false)
    expect(save.encounters[0].lootGold).toBe(10)
    expect(save.encounters[0].quality).toBe('green')
    expect(save.encounters[0].marchEndsAt).toBeNull()
    expect(save.encounters[0].lootClaimed).toBe(false)
    expect(save.currentOrderId).toBeUndefined()
    expect(save.orderIndex).toBeUndefined()
    expect(save.orderSubmitted).toBeUndefined()
  })

  it('migrates a generic merchant into a passerby when it has barter fields', () => {
    const save = createSave()
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

  it('pads a leftover 5-slot board to 6 without losing the first marching enemy', () => {
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
    expect(save.encounters).toHaveLength(6)
    expect(save.encounters[0].id).toBe('keep-five-pad')
  })
})

describe('encounter quality', () => {
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
  it('lets an artisan take finished goods for gold plus a workshop yield buff', () => {
    const save = createSave()
    save.gold = 20
    put(save, 0, testArtisan())
    stock(save, { weapon: 2 })
    const now = 3_000_000_000_000
    const result = submitArtisan(save, 0, now)
    expect(result.ok).toBe(true)
    expect(save.gold).toBe(30)
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

  it('refreshes completed trades and claimed loot but keeps marching or loot-ready enemies', () => {
    const save = createSave()
    const now = 2_100_000_000_000
    const marching = testEnemy({
      id: 'keep-march',
      departed: true,
      marchEndsAt: now + 10 * 60 * 1000,
    })
    const claimed = testEnemy({
      id: 'swap-claimed',
      departed: true,
      marchEndsAt: now - 1000,
      lootClaimed: true,
    })
    const doneArtisan = testArtisan({ id: 'swap-artisan', completed: true })
    const doneBulk = testBulk({ id: 'swap-bulk', completed: true })
    const idle = testPasserby({ id: 'swap-idle' })
    put(save, 0, marching)
    put(save, 1, claimed)
    put(save, 2, doneArtisan)
    put(save, 3, doneBulk)
    put(save, 4, idle)
    expect(shouldKeepOnExplore(claimed, now)).toBe(false)
    expect(shouldKeepOnExplore(doneArtisan, now)).toBe(false)
    expect(exploreBoard(save, now).ok).toBe(true)
    expect(save.encounters[0].id).toBe('keep-march')
    expect(save.encounters[1].id).not.toBe('swap-claimed')
    expect(save.encounters[2].id).not.toBe('swap-artisan')
    expect(save.encounters[3].id).not.toBe('swap-bulk')
    expect(save.encounters[4].id).not.toBe('swap-idle')
  })
})
