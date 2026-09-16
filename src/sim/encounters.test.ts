import { describe, expect, it } from 'vitest'
import { bankQty } from './bank'
import { createSave } from './createSave'
import {
  ENCOUNTER_SLOT_COUNT,
  EXPLORE_COST_TABLE,
  PAWNSHOP_DEFS,
  PASSERBY_DEFS,
  QUALITY_DEF,
  SHADY_DEFS,
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
  encounterStampLabel,
  enemyLootGoldFor,
  enemyNeedsFor,
  exploreBlockReason,
  exploreBoard,
  exploreCost,
  generateEncounterBoard,
  hydrateEncounterFields,
  isEncounterSettled,
  isMerchantKind,
  marchDurationS,
  needMapQtySum,
  pawnGoldForEncounter,
  pawnGoldForMap,
  pawnMerchant,
  pickEncounterQuality,
  qualityRewardMul,
  shouldKeepOnExplore,
} from './encounters'
import { settleOffline } from './offline'
import { pawnUnitGold } from './tables'
import type {
  EncounterNeedMap,
  EncounterQuality,
  EnemyEncounter,
  ItemId,
  PasserbyEncounter,
  PawnshopEncounter,
  Save,
  ShadyEncounter,
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

function testShady(overrides: Partial<ShadyEncounter> = {}): ShadyEncounter {
  return {
    kind: 'shady',
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

function testPawn(overrides: Partial<PawnshopEncounter> = {}): PawnshopEncounter {
  return {
    kind: 'pawnshop',
    id: 'merchantPawn-test',
    label: '兵器当',
    quality: 'green',
    pawnWants: { weapon: 1 },
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
  it('always has 6 slots mixing enemies and merchant kinds', () => {
    const save = createSave()
    expect(ENCOUNTER_SLOT_COUNT).toBe(6)
    expect(save.encounters).toHaveLength(ENCOUNTER_SLOT_COUNT)
    expect(save.encounters.some((enc) => enc.kind === 'enemy')).toBe(true)
    expect(save.encounters.some((enc) => isMerchantKind(enc.kind))).toBe(true)

    const seen = new Set<string>()
    for (let seed = 0; seed < 24; seed++) {
      const board = generateEncounterBoard(seed)
      expect(board).toHaveLength(6)
      expect(board.some((enc) => enc.kind === 'enemy')).toBe(true)
      expect(board.some((enc) => isMerchantKind(enc.kind))).toBe(true)
      for (const enc of board) seen.add(enc.kind)
    }
    expect(seen.has('shady')).toBe(true)
    expect(seen.has('passerby')).toBe(true)
    expect(seen.has('pawnshop')).toBe(true)
    expect(SHADY_DEFS.length).toBeGreaterThan(0)
    expect(PASSERBY_DEFS.length).toBeGreaterThan(0)
    expect(PAWNSHOP_DEFS.length).toBeGreaterThan(0)
  })

  it('gives far encounters more food and strong encounters more ore/weapons', () => {
    const nearWeak = enemyNeedsFor('near', 'weak')
    const farWeak = enemyNeedsFor('far', 'weak')
    const nearStrong = enemyNeedsFor('near', 'strong')
    expect(farWeak.meal ?? 0).toBeGreaterThan(nearWeak.meal ?? 0)
    expect(farWeak.fish ?? 0).toBeGreaterThan(nearWeak.fish ?? 0)
    expect(nearStrong.weapon ?? 0).toBeGreaterThan(nearWeak.weapon ?? 0)
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
  it('lets a shady merchant sell goods for gold', () => {
    const save = createSave()
    put(save, 0, testShady())
    save.gold = 20
    save.bank = {}
    expect(buyMerchant(save, 0).ok).toBe(true)
    expect(save.gold).toBe(12)
    expect(bankQty(save, 'meal')).toBe(1)
    expect(save.encounters[0].kind === 'shady' && save.encounters[0].completed).toBe(true)
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
  })

  it('does not let a shady merchant barter', () => {
    const save = createSave()
    put(save, 0, testShady())
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

describe('encounter quality', () => {
  const ranked: EncounterQuality[] = ['green', 'blue', 'purple', 'orange']

  it('keeps green as baseline and raises demand, payout and value ratio', () => {
    expect(QUALITY_DEF.gray.exploreWeight).toBe(0)
    expect(QUALITY_DEF.green.exploreWeight).toBeGreaterThan(QUALITY_DEF.blue.exploreWeight)
    expect(QUALITY_DEF.blue.exploreWeight).toBeGreaterThan(QUALITY_DEF.purple.exploreWeight)
    expect(QUALITY_DEF.purple.exploreWeight).toBeGreaterThan(QUALITY_DEF.orange.exploreWeight)

    let prevDemand = 0
    let prevReward = 0
    let prevValue = 0
    for (const quality of ranked) {
      const def = QUALITY_DEF[quality]
      const rewardMul = qualityRewardMul(quality)
      expect(def.demandMul).toBeGreaterThanOrEqual(prevDemand)
      expect(rewardMul).toBeGreaterThan(prevReward)
      expect(def.valueMul).toBeGreaterThan(prevValue)
      prevDemand = def.demandMul
      prevReward = rewardMul
      prevValue = def.valueMul
    }
    expect(QUALITY_DEF.gray.valueMul).toBeLessThan(QUALITY_DEF.green.valueMul)
  })

  it('never rolls gray when generating explore boards', () => {
    const seen = new Set<EncounterQuality>()
    for (let seed = 0; seed < 80; seed++) {
      expect(pickEncounterQuality(seed, seed % 6)).not.toBe('gray')
      const board = generateEncounterBoard(seed)
      expect(board).toHaveLength(6)
      for (const enc of board) {
        expect(enc.quality).not.toBe('gray')
        seen.add(enc.quality)
      }
    }
    expect(seen.has('green')).toBe(true)
    expect(seen.has('blue')).toBe(true)
    expect(seen.has('purple')).toBe(true)
    expect(seen.has('orange')).toBe(true)
  })

  it('gives higher quality enemies more supplies, more gold and better loot per item', () => {
    let prevDemand = 0
    let prevLoot = 0
    let prevRoi = 0
    for (const quality of ranked) {
      const needs = enemyNeedsFor('far', 'strong', quality)
      const demand = needMapQtySum(needs)
      const loot = enemyLootGoldFor('far', 'strong', quality)
      const roi = loot / demand
      expect(demand).toBeGreaterThanOrEqual(prevDemand)
      expect(loot).toBeGreaterThan(prevLoot)
      expect(roi).toBeGreaterThan(prevRoi)
      prevDemand = demand
      prevLoot = loot
      prevRoi = roi
    }
  })

  it('pays more pawn gold per item on higher quality slips', () => {
    const green = testPawn({ quality: 'green', pawnWants: { weapon: 1, wood: 2 } })
    const orange = testPawn({ quality: 'orange', pawnWants: { weapon: 2, wood: 4 } })
    const greenGold = pawnGoldForEncounter(green)
    const orangeGold = pawnGoldForEncounter(orange)
    expect(greenGold).toBe(pawnGoldForMap(green.pawnWants))
    expect(orangeGold / needMapQtySum(orange.pawnWants)).toBeGreaterThan(
      greenGold / needMapQtySum(green.pawnWants),
    )
  })

  it('stamps settled trades and claimed loot', () => {
    const idle = testEnemy()
    const claimed = testEnemy({ lootClaimed: true, departed: true, marchEndsAt: 1 })
    const open = testPasserby()
    const done = testPasserby({ completed: true })
    expect(isEncounterSettled(idle)).toBe(false)
    expect(isEncounterSettled(claimed)).toBe(true)
    expect(encounterStampLabel(claimed)).toBe('已领')
    expect(isEncounterSettled(open)).toBe(false)
    expect(isEncounterSettled(done)).toBe(true)
    expect(encounterStampLabel(done)).toBe('成交')
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
    expect(save.encounters[0].marchEndsAt).toBeNull()
    expect(save.encounters[0].lootClaimed).toBe(false)
    expect(save.encounters[0].quality).toBe('green')
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
    expect(save.encounters).toHaveLength(6)
    expect(save.encounters[0].kind).toBe('passerby')
    if (save.encounters[0].kind !== 'passerby') return
    expect(save.encounters[0].id).toContain('merchantBarter')
    expect(save.encounters[0].wants).toEqual({ wood: 4 })
    expect(save.encounters[0].offers).toEqual({ meal: 1 })
    expect(save.encounters[0].quality).toBe('green')
  })

  it('pads a 5-slot board to 6 and fills missing quality as green', () => {
    const save = createSave()
    const marching = testEnemy({
      id: 'keep-old-march',
      departed: true,
      marchEndsAt: Date.now() + 60_000,
    })
    delete (marching as { quality?: EncounterQuality }).quality
    save.encounters = [
      marching,
      testEnemy({ id: 'e1' }),
      testPasserby({ id: 'p1' }),
      testShady({ id: 's1' }),
      testPawn({ id: 'w1' }),
    ]
    hydrateEncounterFields(save)
    expect(save.encounters).toHaveLength(6)
    expect(save.encounters[0].id).toBe('keep-old-march')
    expect(save.encounters.every((enc) => enc.quality != null)).toBe(true)
    expect(save.encounters[0].quality).toBe('green')
  })
})
