import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { beginEnemyCombat, stepEnemyCombat } from './combat'
import { createSave } from './createSave'
import {
  BRINK_HEAL_BASE,
  BRINK_HEAL_MISSING,
  CLEAR_MIND_HEAL_RATIO,
  CLEAR_MIND_LEAVE_RATIO,
  FOCUS_DURATION_S,
  POTION_BATCH_RANGE,
  POTION_ITEM_IDS,
  RENEW_DURATION_S,
  RENEW_HEAL_RATIO,
  RENEW_TICK_S,
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
  usePotionSlot,
} from './potions'
import { currentSpeed } from './query'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { completeCycle } from './stations'
import { ticks } from './tick'
import type { EnemyEncounter, Save } from './types'
import { hydrateLoadedSave } from '../ui/saveGame'
import { applyWorkshopFatigue } from './workshopHp'

function roster(n = 1): Save {
  const save = createSave()
  save.gold = 15 * n
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
      'wardElixir',
      'focusDraft',
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
    save.workers[0].hp = 1
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(bankQty(save, 'salve')).toBe(0)
    expect(save.potionSlots[0]).toBe('salve')
    expect(usePotionSlot(save, 0)).toEqual({ ok: false, reason: '初级药膏见底' })
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
    assignWorker(save, save.workers[0].id, 'mining')
    const bare = currentSpeed(save, 'mining')
    save.bank.stim = 1
    expect(installPotionSlot(save, 0, 'stim').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(stimSpeedMul(save)).toBe(STIM_SPEED_MUL)
    expect(currentSpeed(save, 'mining')).toBeCloseTo(bare * STIM_SPEED_MUL)
    const later = ticks(save, STIM_DURATION_S)
    expect(stimSpeedMul(later)).toBe(1)
    expect(currentSpeed(later, 'mining')).toBeCloseTo(bare)
  })

  it('salve heals every worker by 20% hpMax', () => {
    const save = roster(2)
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

  it('brinkSalve heals more when missing more HP', () => {
    const save = roster(2)
    save.workers[0].hp = save.workers[0].hpMax
    save.workers[1].hp = 1
    save.bank.brinkSalve = 1
    const fullHeal = Math.ceil(save.workers[0].hpMax * (BRINK_HEAL_BASE + BRINK_HEAL_MISSING * 0))
    const emptyRatio = 1 / save.workers[1].hpMax
    const emptyHeal = Math.ceil(save.workers[1].hpMax * (BRINK_HEAL_BASE + BRINK_HEAL_MISSING * (1 - emptyRatio)))
    expect(installPotionSlot(save, 0, 'brinkSalve').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(save.workers[0].hp).toBe(Math.min(save.workers[0].hpMax, save.workers[0].hpMax))
    expect(fullHeal).toBeGreaterThan(0)
    expect(save.workers[1].hp).toBe(1 + emptyHeal)
    expect(emptyHeal).toBeGreaterThan(fullHeal)
  })

  it('wardElixir blocks workshop fatigue and combat HP damage', () => {
    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'herbalism')
    save.bank.wardElixir = 1
    expect(installPotionSlot(save, 0, 'wardElixir').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    applyWorkshopFatigue(save, 'herbalism', Date.now(), 'success')
    expect(worker.fatigueDebt).toBe(0)
    expect(worker.hp).toBe(worker.hpMax)

    const enc = testEnemy()
    save.encounters[0] = enc
    worker.assignment = null
    beginEnemyCombat(enc, [worker], 1_000_000, 1, undefined, save)
    const hp = enc.combat!.workers[0].hp
    stepEnemyCombat(save, enc, 1_000_000, undefined)
    expect(enc.combat!.workers[0].hp).toBe(hp)
  })

  it('focusDraft gives each station +1 on the next successful cycle for 5 minutes', () => {
    setRollOverride(() => 0.2)
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'herbalism')
    save.bank.focusDraft = 1
    expect(installPotionSlot(save, 0, 'focusDraft').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(bankQty(save, 'herb') + bankQty(save, 'spice')).toBe(2)
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(bankQty(save, 'herb') + bankQty(save, 'spice')).toBe(3)
    const later = ticks(save, FOCUS_DURATION_S)
    later.bank.herb = 0
    later.bank.spice = 0
    completeCycle(later, 'herbalism')
    expect(bankQty(later, 'herb') + bankQty(later, 'spice')).toBe(1)
  })

  it('clearMind lifts residual HP to 40% and heals others by 10% without clearing fatigue', () => {
    const save = roster(2)
    const residual = save.workers[0]
    const healthy = save.workers[1]
    residual.fatigueDebt = 2.4
    residual.hp = 1
    healthy.fatigueDebt = 1.1
    healthy.hp = Math.ceil(healthy.hpMax * 0.6)
    save.bank.clearMind = 1
    expect(installPotionSlot(save, 0, 'clearMind').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(residual.fatigueDebt).toBe(2.4)
    expect(residual.hp).toBe(Math.ceil(CLEAR_MIND_LEAVE_RATIO * residual.hpMax))
    expect(residual.hp / residual.hpMax).toBeGreaterThan(0.3)
    expect(healthy.fatigueDebt).toBe(1.1)
    expect(healthy.hp).toBe(
      Math.min(healthy.hpMax, Math.ceil(healthy.hpMax * 0.6) + Math.ceil(healthy.hpMax * CLEAR_MIND_HEAL_RATIO)),
    )
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
    save.potionBuffs.wardUntil = 10
    hydratePotionState(save, save)
    expect(save.potionBuffs.stimUntil).toBe(80)
    expect(save.potionBuffs.wardUntil).toBeNull()
    applyPotionTicks(save)
    expect(save.potionBuffs.stimUntil).toBe(80)
  })
})
