import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { beginEnemyCombat } from './combat'
import { createAssistWorker } from './combatAssist'
import { createSave } from './createSave'
import {
  BRINK_HEAL_RATIO,
  BRINK_LOW_TARGET_RATIO,
  CLEAR_MIND_PRIMARY_RATIO,
  CLEAR_MIND_SECONDARY_RATIO,
  POTION_BATCH_RANGE,
  POTION_ITEM_IDS,
  RENEW_DURATION_S,
  RENEW_HEAL_RATIO,
  RENEW_TICK_S,
  RUSH_CYCLE_CUT,
  SALVE_HEAL_RATIO,
  STIM_DURATION_S,
  STIM_SPEED_MUL,
} from './tables'
import {
  applyPotionTicks,
  hydratePotionState,
  installPotionSlot,
  rollAlchemyPotionBatch,
  stimSpeedMul,
  unequipPotionSlot,
  POTION_FULL_HP_TIP,
  POTION_NO_DUTY_TIP,
  usePotionSlot,
} from './potions'
import { currentSpeed } from './query'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { completeCycle } from './stations'
import { ticks } from './tick'
import type { EnemyEncounter, Save } from './types'
import { hydrateLoadedSave } from '../ui/saveGame'

function roster(n = 1): Save {
  const save = createSave()
  save.diamonds = 15 * n
  for (let i = 0; i < n; i++) expect(recruitWorker(save).ok).toBe(true)
  return save
}

function testEnemy(): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'potion-enemy',
    label: '试敌',
    quality: 'green',
    needs: { meal: 1 },
    lootGold: 8,
    departed: false,
    combat: null,
    lootClaimed: false,
    enemyRank: 'minion',
    weaknesses: ['fire'],
    revealedWeaknesses: [],
  }
}

afterEach(() => {
  setRollOverride(null)
})

describe('alchemy batch roll', () => {
  it('covers the seven potion ids and their batch ranges', () => {
    expect(POTION_ITEM_IDS).toEqual([
      'stim',
      'salve',
      'renewSoup',
      'brinkSalve',
      'rushPowder',
      'doubleMist',
      'clearMind',
    ])
    for (const id of POTION_ITEM_IDS) {
      const range = POTION_BATCH_RANGE[id]
      expect(range.max).toBeGreaterThanOrEqual(range.min)
      expect(range.min).toBeGreaterThan(0)
    }
    setRollOverride(() => 0)
    const save = createSave()
    expect(rollAlchemyPotionBatch(save)).toEqual({
      itemId: 'stim',
      qty: POTION_BATCH_RANGE.stim.min,
    })
  })
})

describe('potion slots', () => {
  it('only applies after install and keeps the assignment at 0 stock', () => {
    const save = roster(1)
    save.bank.salve = 1
    expect(usePotionSlot(save, 0)).toEqual({ ok: false, reason: '空槽' })
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(save.potionSlots[0]).toBe('salve')
    assignWorker(save, save.workers[0].id, 'herbalism')
    save.workers[0].hp = 1
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(bankQty(save, 'salve')).toBe(0)
    expect(save.potionSlots[0]).toBe('salve')
    expect(usePotionSlot(save, 0)).toEqual({ ok: false, reason: '回春散见底' })
    expect(unequipPotionSlot(save, 0).ok).toBe(true)
    expect(save.potionSlots[0]).toBeNull()
  })

  it('rejects a second slot of the same potion', () => {
    const save = roster()
    save.bank.stim = 2
    expect(installPotionSlot(save, 0, 'stim').ok).toBe(true)
    expect(installPotionSlot(save, 1, 'stim')).toEqual({ ok: false, reason: '这种药剂已经装上了' })
  })
})

describe('seven potion effects', () => {
  it('stim speeds on-duty stations for 3 minutes of sim time', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'herbalism')
    const bare = currentSpeed(save, 'herbalism')
    save.bank.stim = 1
    expect(installPotionSlot(save, 0, 'stim').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(stimSpeedMul(save)).toBe(STIM_SPEED_MUL)
    expect(currentSpeed(save, 'herbalism')).toBeCloseTo(bare * STIM_SPEED_MUL)
    const later = ticks(save, STIM_DURATION_S)
    expect(stimSpeedMul(later)).toBe(1)
    expect(currentSpeed(later, 'herbalism')).toBeCloseTo(bare)
  })

  it('salve heals every on-duty worker by 10% hpMax', () => {
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'herbalism')
    assignWorker(save, save.workers[1].id, 'mining')
    save.workers[0].hp = 1
    save.workers[1].hp = 1
    save.bank.salve = 1
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    const expectHp = 1 + Math.ceil(save.workers[0].hpMax * SALVE_HEAL_RATIO)
    expect(save.workers[0].hp).toBe(expectHp)
    expect(save.workers[1].hp).toBe(1 + Math.ceil(save.workers[1].hpMax * SALVE_HEAL_RATIO))
  })

  it('renewSoup ticks HoT every 10s for 2 minutes on living workers', () => {
    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'mining')
    worker.hp = 1
    save.bank.renewSoup = 1
    expect(installPotionSlot(save, 0, 'renewSoup').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    const pip = Math.ceil(worker.hpMax * RENEW_HEAL_RATIO)
    const afterOne = ticks(save, RENEW_TICK_S)
    expect(afterOne.workers[0].hp).toBe(1 + pip)
    const done = ticks(afterOne, RENEW_DURATION_S)
    expect(done.workers[0].hp).toBeGreaterThan(1 + pip)
    expect(done.potionBuffs.renewUntil).toBeNull()
  })

  it('brinkSalve lifts workers at or under 30% to 40% and heals the rest by 5%', () => {
    const save = roster(3)
    const low = save.workers[0]
    const mid = save.workers[1]
    const full = save.workers[2]
    assignWorker(save, low.id, 'herbalism')
    assignWorker(save, mid.id, 'mining')
    assignWorker(save, full.id, 'hunting')
    low.hp = Math.floor(low.hpMax * 0.3)
    const midStart = Math.max(Math.floor(mid.hpMax * 0.3) + 1, Math.ceil(mid.hpMax * 0.5))
    mid.hp = midStart
    full.hp = full.hpMax
    save.bank.brinkSalve = 1
    expect(installPotionSlot(save, 0, 'brinkSalve').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(low.hp).toBe(Math.ceil(low.hpMax * BRINK_LOW_TARGET_RATIO))
    expect(mid.hp).toBe(Math.min(mid.hpMax, midStart + Math.ceil(mid.hpMax * BRINK_HEAL_RATIO)))
    expect(full.hp).toBe(full.hpMax)
    expect(low.hp / low.hpMax).toBeGreaterThan(0.3)
  })

  it('doubleMist multiplies the next successful output then clears', () => {
    setRollOverride(() => 0)
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'herbalism')
    save.bank.doubleMist = 1
    expect(installPotionSlot(save, 0, 'doubleMist').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(save.potionBuffs.doubleMist).toEqual({ stationId: 'herbalism', mul: 2 })
    expect(bankQty(save, 'doubleMist')).toBe(0)
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(bankQty(save, 'herb') + bankQty(save, 'spice')).toBe(2)
    expect(save.potionBuffs.doubleMist).toBeNull()
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(bankQty(save, 'herb') + bankQty(save, 'spice')).toBe(3)

    setRollOverride(() => 0.85)
    const triple = roster(1)
    assignWorker(triple, triple.workers[0].id, 'herbalism')
    triple.bank.doubleMist = 1
    expect(installPotionSlot(triple, 0, 'doubleMist').ok).toBe(true)
    expect(usePotionSlot(triple, 0).ok).toBe(true)
    expect(triple.potionBuffs.doubleMist).toEqual({ stationId: 'herbalism', mul: 3 })
    expect(completeCycle(triple, 'herbalism')).toBe(true)
    expect(bankQty(triple, 'herb') + bankQty(triple, 'spice')).toBe(3)
    expect(triple.potionBuffs.doubleMist).toBeNull()
  })

  it('rushPowder shortens the next cycle of one on-duty station by 40%', () => {
    setRollOverride(() => 0)
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'herbalism')
    assignWorker(save, save.workers[1].id, 'mining')
    const herbBare = currentSpeed(save, 'herbalism')
    const mineBare = currentSpeed(save, 'mining')
    save.bank.rushPowder = 1
    expect(installPotionSlot(save, 0, 'rushPowder').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(save.potionBuffs.rushStation).toBe('herbalism')
    expect(bankQty(save, 'rushPowder')).toBe(0)
    expect(currentSpeed(save, 'herbalism')).toBeCloseTo(herbBare / (1 - RUSH_CYCLE_CUT))
    expect(currentSpeed(save, 'mining')).toBeCloseTo(mineBare)
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(save.potionBuffs.rushStation).toBeNull()
    expect(currentSpeed(save, 'herbalism')).toBeCloseTo(herbBare)

    setRollOverride(() => 0.6)
    const picked = roster(2)
    assignWorker(picked, picked.workers[0].id, 'herbalism')
    assignWorker(picked, picked.workers[1].id, 'mining')
    picked.bank.rushPowder = 1
    expect(installPotionSlot(picked, 0, 'rushPowder').ok).toBe(true)
    expect(usePotionSlot(picked, 0).ok).toBe(true)
    expect(picked.potionBuffs.rushStation).toBe('mining')
  })

  it('clearMind heals the most wounded on-duty workers and skips full HP', () => {
    const save = roster(4)
    const worst = save.workers[0]
    const second = save.workers[1]
    const lighter = save.workers[2]
    const full = save.workers[3]
    assignWorker(save, worst.id, 'herbalism')
    assignWorker(save, second.id, 'alchemy')
    assignWorker(save, lighter.id, 'hunting')
    assignWorker(save, full.id, 'cooking')
    worst.fatigueDebt = 2.4
    worst.hp = 1
    second.hp = Math.floor(second.hpMax * 0.45)
    lighter.hp = Math.min(lighter.hpMax, Math.floor(lighter.hpMax * 0.5) + 1)
    if (lighter.hp / lighter.hpMax <= 0.5) lighter.hp = Math.min(lighter.hpMax, lighter.hp + 1)
    const lighterBefore = lighter.hp
    const secondBefore = second.hp
    full.hp = full.hpMax
    save.bank.clearMind = 2
    expect(installPotionSlot(save, 0, 'clearMind').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(worst.fatigueDebt).toBe(2.4)
    expect(worst.hp).toBe(1 + Math.ceil(worst.hpMax * CLEAR_MIND_PRIMARY_RATIO))
    expect(second.hp).toBe(Math.min(second.hpMax, secondBefore + Math.ceil(second.hpMax * CLEAR_MIND_SECONDARY_RATIO)))
    expect(lighter.hp).toBe(lighterBefore)
    expect(full.hp).toBe(full.hpMax)
    expect(bankQty(save, 'clearMind')).toBe(1)

    full.hp = full.hpMax
    worst.hp = worst.hpMax
    second.hp = second.hpMax
    lighter.hp = lighter.hpMax
    expect(usePotionSlot(save, 0)).toEqual({ ok: false, reason: POTION_FULL_HP_TIP })
    expect(bankQty(save, 'clearMind')).toBe(1)
  })
})

describe('potion slot on-duty targeting', () => {
  it('does not consume when nobody is on duty', () => {
    const save = roster(1)
    save.bank.salve = 1
    save.bank.stim = 1
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(usePotionSlot(save, 0)).toEqual({ ok: false, reason: POTION_NO_DUTY_TIP })
    expect(bankQty(save, 'salve')).toBe(1)
    expect(save.guideQuestPotionUsed).toBeFalsy()
    expect(installPotionSlot(save, 1, 'stim').ok).toBe(true)
    expect(usePotionSlot(save, 1)).toEqual({ ok: false, reason: POTION_NO_DUTY_TIP })
    expect(bankQty(save, 'stim')).toBe(1)
    expect(save.potionBuffs.stimUntil).toBeNull()
  })

  it('heals only on-duty workers and skips rest, combat, and assist', () => {
    const save = roster(3)
    const duty = save.workers[0]
    const rest = save.workers[1]
    const fighter = save.workers[2]
    assignWorker(save, duty.id, 'herbalism')
    duty.hp = 1
    rest.hp = 1
    fighter.hp = fighter.hpMax
    const enc = testEnemy()
    save.encounters[0] = enc
    beginEnemyCombat(enc, [fighter], 2_000_000, 1, undefined, save)
    expect(enc.combat?.workers[0]?.id).toBe(fighter.id)
    enc.combat!.enemy.nextActAt = 9_000_000
    enc.combat!.workers[0].nextActAt = 9_000_000
    enc.combat!.workers[0].hp = 5
    fighter.hp = 5
    const assist = createAssistWorker(save)
    assist.assignment = 'mining'
    assist.hp = 1
    save.workers.push(assist)
    save.bank.salve = 1
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(bankQty(save, 'salve')).toBe(0)
    expect(duty.hp).toBe(1 + Math.ceil(duty.hpMax * SALVE_HEAL_RATIO))
    expect(rest.hp).toBe(1)
    expect(fighter.hp).toBe(5)
    expect(enc.combat?.workers[0]?.hp).toBe(5)
    expect(assist.hp).toBe(1)
  })
})

describe('hydrate potions', () => {
  it('moves old generic potion stock and encounter needs to salve, and drops enrage fields', () => {
    const raw = {
      ...createSave(),
      bank: { potion: 5, herb: 2 },
      encounters: [
        {
          kind: 'enemy',
          id: 'old-potion',
          label: '旧单',
          quality: 'green',
          needs: { potion: 3 },
          lootGold: 8,
          departed: false,
          combat: null,
          lootClaimed: false,
          enemyRank: 'minion',
          weaknesses: ['fire'],
          revealedWeaknesses: [],
        },
      ],
      stations: {
        ...createSave().stations,
        mining: {
          ...createSave().stations.mining,
          enrageUntil: 99,
          enrageReadyAt: 199,
        },
      },
    }
    const save = hydrateLoadedSave(raw)
    expect(save?.bank.potion).toBeUndefined()
    expect(save?.bank.salve).toBe(5)
    expect(save?.potionSlots).toEqual([null, null, null, null])
    const enc = save?.encounters.find((row) => row.id === 'old-potion')
    expect(enc?.kind === 'enemy' && enc.needs).toEqual({ salve: 3 })
    expect((save?.stations.mining as { enrageUntil?: unknown }).enrageUntil).toBeUndefined()
  })

  it('maps leftover potion consume on the market board to salve', () => {
    const save = hydrateLoadedSave({
      ...createSave(),
      marketEncounters: [
        {
          kind: 'passerby',
          id: 'old-market-potion',
          label: '旧换货',
          quality: 'green',
          wants: { potion: 2 },
          offers: { meal: 1 },
          completed: false,
        },
      ],
    })
    const enc = save?.marketEncounters.find((row) => row.id === 'old-market-potion')
    expect(enc?.kind === 'passerby' && enc.wants).toEqual({ salve: 2 })
  })

  it('clears leftover warDrum slots and drops leftover warDrum stock', () => {
    const save = hydrateLoadedSave({
      ...createSave(),
      bank: { salve: 2, warDrum: 3 },
      potionSlots: ['warDrum', 'salve', null, null],
      potionBuffs: { warDrumUntil: 999 },
    } as never)
    expect(save?.potionSlots).toEqual([null, 'salve', null, null])
    expect((save?.bank as { warDrum?: number }).warDrum).toBeUndefined()
    expect((save?.potionBuffs as { warDrumUntil?: unknown }).warDrumUntil).toBeUndefined()
  })

  it('keeps timed buffs that still have sim time left', () => {
    const save = createSave()
    save.elapsedS = 40
    save.potionBuffs.stimUntil = 80
    hydratePotionState(save, {
      potionBuffs: { stimUntil: 80, wardUntil: 200, focusUntil: 200, focusConsumed: ['herbalism'] },
    })
    expect(save.potionBuffs.stimUntil).toBe(80)
    expect(save.potionBuffs.doubleMist).toBeNull()
    expect(save.potionBuffs.rushStation).toBeNull()
    applyPotionTicks(save)
    expect(save.potionBuffs.stimUntil).toBe(80)
  })

  it('maps focusDraft and wardElixir stock, slots, and orders onto the new potions', () => {
    const save = hydrateLoadedSave({
      ...createSave(),
      bank: { focusDraft: 4, wardElixir: 2, doubleMist: 1, salve: 3 },
      potionSlots: ['focusDraft', 'wardElixir', null, null],
      potionBuffs: { stimUntil: 80, wardUntil: 200, focusUntil: 90, focusConsumed: ['herbalism'] },
      encounters: [
        {
          kind: 'enemy',
          id: 'old-focus',
          label: '旧凝神单',
          quality: 'green',
          needs: { focusDraft: 2, wardElixir: 1 },
          lootGold: 8,
          departed: false,
          combat: null,
          lootClaimed: false,
          enemyRank: 'minion',
          weaknesses: ['fire'],
          revealedWeaknesses: [],
        },
      ],
      marketEncounters: [
        {
          kind: 'passerby',
          id: 'old-ward',
          label: '旧护命换货',
          quality: 'green',
          wants: { wardElixir: 1 },
          offers: { focusDraft: 2 },
          completed: false,
        },
      ],
    } as never)
    expect(save?.bank.doubleMist).toBe(5)
    expect(save?.bank.rushPowder).toBe(2)
    expect(save?.bank.salve).toBe(3)
    expect((save?.bank as { focusDraft?: number }).focusDraft).toBeUndefined()
    expect((save?.bank as { wardElixir?: number }).wardElixir).toBeUndefined()
    expect(save?.potionSlots).toEqual(['doubleMist', 'rushPowder', null, null])
    const enemy = save?.encounters.find((row) => row.id === 'old-focus')
    expect(enemy?.kind === 'enemy' && enemy.needs).toEqual({ doubleMist: 2, rushPowder: 1 })
    const market = save?.marketEncounters.find((row) => row.id === 'old-ward')
    expect(market?.kind === 'passerby' && market.wants).toEqual({ rushPowder: 1 })
    expect(market?.kind === 'passerby' && market.offers).toEqual({ doubleMist: 2 })
    expect(save?.potionBuffs.stimUntil).toBe(80)
    expect(save?.potionBuffs.doubleMist).toBeNull()
    expect(save?.potionBuffs.rushStation).toBeNull()
  })
})
