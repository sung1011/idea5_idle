import { describe, expect, it } from 'vitest'
import { bankQty } from './bank'
import { createSave } from './createSave'
import {
  ENCOUNTER_SLOT_COUNT,
  EXPLORE_COST_TABLE,
  MERCHANT_DEFS,
  boardSignature,
  barterMerchant,
  buyMerchant,
  canDepartEncounter,
  canExplore,
  departBlockReason,
  departEncounter,
  enemyNeedsFor,
  exploreBlockReason,
  exploreBoard,
  exploreCost,
  generateEncounterBoard,
  hydrateEncounterFields,
  submitSupply,
  submitSupplyBlockReason,
} from './encounters'
import type { EncounterNeedMap, ItemId, Save } from './types'

function stock(save: Save, needs: EncounterNeedMap) {
  for (const [itemId, qty] of Object.entries(needs) as Array<[ItemId, number]>) {
    save.bank[itemId] = qty
  }
}

function firstEnemyIndex(save: Save): number {
  return save.encounters.findIndex((enc) => enc.kind === 'enemy')
}

function firstMerchantIndex(save: Save): number {
  return save.encounters.findIndex((enc) => enc.kind === 'merchant')
}

describe('encounter board', () => {
  it('always has 5 slots mixing enemies and merchants', () => {
    const save = createSave()
    expect(save.encounters).toHaveLength(ENCOUNTER_SLOT_COUNT)
    expect(save.encounters.filter((enc) => enc.kind === 'enemy').length).toBeGreaterThan(0)
    expect(save.encounters.filter((enc) => enc.kind === 'merchant').length).toBeGreaterThan(0)

    for (let seed = 0; seed < 8; seed++) {
      const board = generateEncounterBoard(seed)
      expect(board).toHaveLength(5)
      expect(board.some((enc) => enc.kind === 'enemy')).toBe(true)
      expect(board.some((enc) => enc.kind === 'merchant')).toBe(true)
    }
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
  it('deducts gold and replaces the whole 5-slot board', () => {
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
    expect(save.encounters).toHaveLength(5)
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
})

describe('enemy depart latch', () => {
  it('blocks depart when the bank is short and does not take goods', () => {
    const save = createSave()
    const index = firstEnemyIndex(save)
    const enemy = save.encounters[index]
    expect(enemy.kind).toBe('enemy')
    if (enemy.kind !== 'enemy') return

    save.bank.weapon = 0
    save.bank.meal = 0
    expect(submitSupplyBlockReason(save, index)).toContain('货不够')
    expect(submitSupply(save, index).ok).toBe(false)
    expect(canDepartEncounter(save, index)).toBe(false)
    expect(departBlockReason(save, index)).toBe('先提交补给')
    expect(departEncounter(save, index).ok).toBe(false)
    expect(bankQty(save, 'weapon')).toBe(0)
    expect(save.departCount).toBe(0)
    expect(enemy.departed).toBe(false)
  })

  it('submits supplies then departs with table gold and departed copy', () => {
    const save = createSave()
    save.gold = 10
    const index = firstEnemyIndex(save)
    const enemy = save.encounters[index]
    expect(enemy.kind).toBe('enemy')
    if (enemy.kind !== 'enemy') return

    stock(save, { weapon: 4, meal: 4, fish: 4, ore: 4, wood: 4 })
    expect(submitSupply(save, index).ok).toBe(true)
    expect(enemy.submitted).toBe(true)
    for (const [itemId, qty] of Object.entries(enemy.needs) as Array<[ItemId, number]>) {
      expect(bankQty(save, itemId)).toBe(4 - qty)
    }

    const now = 1_700_000_000_000
    const result = departEncounter(save, index, now)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('已出发（战斗稍后）')
    expect(save.gold).toBe(10 + enemy.departGold)
    expect(save.departCount).toBe(1)
    expect(save.lastDepartAt).toBe(now)
    expect(enemy.departed).toBe(true)
    expect(save.encounters).toHaveLength(5)
  })
})

describe('merchant trade', () => {
  it('barters wants for offers and marks the slot done', () => {
    const save = createSave()
    const index = firstMerchantIndex(save)
    const merchant = save.encounters[index]
    expect(merchant.kind).toBe('merchant')
    if (merchant.kind !== 'merchant') return

    stock(save, { wood: 8, fish: 8, ore: 8, meal: 8 })
    const beforeWants = needSnapshot(save, merchant.wants)
    const beforeOffers = needSnapshot(save, merchant.offers)
    expect(barterMerchant(save, index).ok).toBe(true)
    expect(merchant.completed).toBe(true)
    for (const [itemId, qty] of Object.entries(merchant.wants) as Array<[ItemId, number]>) {
      expect(bankQty(save, itemId)).toBe(beforeWants[itemId] - qty)
    }
    for (const [itemId, qty] of Object.entries(merchant.offers) as Array<[ItemId, number]>) {
      expect(bankQty(save, itemId)).toBe(beforeOffers[itemId] + qty)
    }
  })

  it('buys with gold and does not take barter items', () => {
    const save = createSave()
    const index = firstMerchantIndex(save)
    const merchant = save.encounters[index]
    expect(merchant.kind).toBe('merchant')
    if (merchant.kind !== 'merchant') return

    save.gold = 20
    stock(save, merchant.wants)
    const beforeWants = needSnapshot(save, merchant.wants)
    expect(buyMerchant(save, index).ok).toBe(true)
    expect(save.gold).toBe(20 - merchant.buyGold)
    expect(merchant.completed).toBe(true)
    for (const [itemId, qty] of Object.entries(merchant.wants) as Array<[ItemId, number]>) {
      expect(bankQty(save, itemId)).toBe(beforeWants[itemId])
      expect(qty).toBeGreaterThan(0)
    }
    for (const [itemId, qty] of Object.entries(merchant.buyOffers) as Array<[ItemId, number]>) {
      expect(bankQty(save, itemId)).toBe(qty)
    }
  })

  it('does not take goods when the merchant wants are short', () => {
    const save = createSave()
    const index = firstMerchantIndex(save)
    const merchant = save.encounters[index]
    if (merchant.kind !== 'merchant') return
    const result = barterMerchant(save, index)
    expect(result.ok).toBe(false)
    expect(merchant.completed).toBe(false)
    expect(MERCHANT_DEFS.length).toBeGreaterThan(0)
  })
})

describe('hydrateEncounterFields', () => {
  it('builds a 5-slot board and migrates a legacy order into the first enemy', () => {
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
    expect(save.encounters).toHaveLength(5)
    expect(save.encounters[0].kind).toBe('enemy')
    if (save.encounters[0].kind !== 'enemy') return
    expect(save.encounters[0].id).toBe('campKitchen')
    expect(save.encounters[0].label).toBe('营地开伙')
    expect(save.encounters[0].submitted).toBe(true)
    expect(save.currentOrderId).toBeUndefined()
    expect(save.orderIndex).toBeUndefined()
    expect(save.orderSubmitted).toBeUndefined()
  })
})

function needSnapshot(save: Save, map: EncounterNeedMap): Record<ItemId, number> {
  const out = {} as Record<ItemId, number>
  for (const itemId of Object.keys(map) as ItemId[]) {
    out[itemId] = bankQty(save, itemId)
  }
  return out
}
