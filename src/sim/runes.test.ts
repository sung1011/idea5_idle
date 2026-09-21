import { describe, expect, it } from 'vitest'
import { addToBank, bankQty } from './bank'
import { beginEnemyCombat, grantWorkerCombatXp, stepEnemyCombat } from './combat'
import { createSave } from './createSave'
import { spawnWorkerWith } from './recruit'
import {
  availableRuneQty,
  consumeRunePicks,
  convertLegacyToolsToFeedstock,
  hasInsightRune,
  listRunePickOptions,
  normalizeRunePicks,
  runeBloodXp,
  runeBreakBonus,
  runeDealMul,
  runePickBlockReason,
  runeSpdMul,
  runeTakenMul,
} from './runes'
import { RUNE_BLOOD_XP, RUNE_BREAK_SHIELD_BONUS, RUNE_DEAL_MUL, RUNE_ITEM_IDS, RUNE_SWIFT_SPD_MUL, RUNE_TAKEN_MUL } from './tables'
import type { EnemyEncounter, Save } from './types'

function saveWithTools(): Save {
  const save = createSave()
  save.bank = {
    tool: 2,
    ironTool: 1,
    miningTool01: 3,
    cookingTool02: 2,
  }
  save.forgedTools = [{ itemId: 'mithrilTool', matchStationId: 'mining' }]
  const station = save.stations.mining as { selectedToolId?: unknown }
  station.selectedToolId = 'miningTool01'
  return save
}

describe('legacy tool hydrate', () => {
  it('converts bank and forged tools into wildCrystal plus starter runes, then clears selections', () => {
    const save = saveWithTools()
    expect(convertLegacyToolsToFeedstock(save)).toBe(9)
    expect(bankQty(save, 'tool')).toBe(0)
    expect(bankQty(save, 'ironTool')).toBe(0)
    expect(bankQty(save, 'miningTool01')).toBe(0)
    expect(bankQty(save, 'cookingTool02')).toBe(0)
    expect(save.forgedTools).toEqual([])
    expect((save.stations.mining as { selectedToolId?: unknown }).selectedToolId).toBeNull()
    expect(bankQty(save, 'wildCrystal')).toBe(21)
    expect(bankQty(save, 'runeSharp')).toBe(2)
    expect(bankQty(save, 'runeArmor')).toBe(1)
  })
})

describe('rune pick and consume', () => {
  it('lists every rune kind with bank counts and blocks over-reserve', () => {
    const save = createSave()
    addToBank(save, 'runeSharp', 1)
    addToBank(save, 'runeArmor', 2)
    const opts = listRunePickOptions(save)
    expect(opts.map((row) => row.id)).toEqual([...RUNE_ITEM_IDS])
    expect(opts[0]).toMatchObject({ id: 'runeSharp', label: '锋锐', qty: 1 })
    expect(opts[1].qty).toBe(2)
    const picks = { a: 'runeSharp' as const, b: 'runeSharp' as const }
    expect(availableRuneQty(save, picks, 'runeSharp', 'a')).toBe(0)
    expect(runePickBlockReason(save, picks)).toBe('锋锐见底')
    expect(consumeRunePicks(save, picks).ok).toBe(false)
    expect(bankQty(save, 'runeSharp')).toBe(1)
    expect(consumeRunePicks(save, { a: 'runeSharp' })).toEqual({ ok: true })
    expect(bankQty(save, 'runeSharp')).toBe(0)
    expect(normalizeRunePicks({ a: 'runeSharp', b: 'ore' as never, c: null })).toEqual({ a: 'runeSharp' })
  })
})

describe('rune combat effects', () => {
  it('applies per-carrier multipliers and extra shield on weakness', () => {
    expect(runeDealMul('runeSharp')).toBe(RUNE_DEAL_MUL)
    expect(runeDealMul('runeArmor')).toBe(1)
    expect(runeTakenMul('runeArmor')).toBe(RUNE_TAKEN_MUL)
    expect(runeSpdMul('runeSwift')).toBe(RUNE_SWIFT_SPD_MUL)
    expect(runeBreakBonus('runeBreak')).toBe(RUNE_BREAK_SHIELD_BONUS)
    expect(runeBloodXp('runeBlood')).toBe(RUNE_BLOOD_XP)
    expect(hasInsightRune([{ runeId: 'runeInsight' }])).toBe(true)
  })

  it('consumes the equipped rune on begin and pays blood XP after a loss', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 1, 'laborer')
    worker.assignment = null
    addToBank(save, 'runeBlood', 1)
    const enc: EnemyEncounter = {
      kind: 'enemy',
      id: 'rune-fight',
      label: '试敌',
      quality: 'green',
      needs: {},
      lootGold: 1,
      departed: false,
      combat: null,
      lootClaimed: false,
      enemyRank: 'minion',
      weaknesses: ['fire'],
      revealedWeaknesses: ['fire'],
    }
    save.encounters = [enc]
    expect(consumeRunePicks(save, { [worker.id]: 'runeBlood' }).ok).toBe(true)
    beginEnemyCombat(enc, [worker], 1_000, 1, undefined, save, { runes: { [worker.id]: 'runeBlood' } })
    expect(enc.combat?.workers[0].runeId).toBe('runeBlood')
    expect(enc.combat?.runeLoadout?.[worker.id]).toBe('runeBlood')
    if (enc.combat) {
      enc.combat.workers[0].hp = 0
      enc.combat.timeoutAt = 1_000
    }
    stepEnemyCombat(save, enc, 1_000)
    expect(enc.combat?.outcome).toBe('lose')
    expect(worker.xp).toBeGreaterThanOrEqual(RUNE_BLOOD_XP)
    grantWorkerCombatXp(worker, 0)
  })
})
