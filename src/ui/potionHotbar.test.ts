import { describe, expect, it } from 'vitest'
import { BEAST_OIL_DURATION_S, RENEW_DURATION_S, STIM_DURATION_S } from '../sim/tables'
import campSource from './campSheet.vue?raw'
import dockSource from './potionDock.vue?raw'
import workersPanelSource from './workersPanelV2.vue?raw'
import {
  POTION_HALO_DT_CAP_S,
  potionEffectRemainRatio,
  potionEmptyAcquireTip,
  potionQtyRestocked,
  potionVisualElapsedS,
  type PotionHaloInput,
} from './potionHotbar'

function halo(
  partial: Omit<Partial<PotionHaloInput>, 'workers'> & {
    itemId: PotionHaloInput['itemId']
    potion?: PotionHaloInput['workers'][number]['potion']
  },
): number {
  return potionEffectRemainRatio({
    elapsedS: 0,
    lastTick: 0,
    now: 0,
    workers: partial.potion ? [{ potion: partial.potion }] : [],
    ...partial,
  })
}

describe('potion hotbar halo', () => {
  it('shrinks timed buffs and clamps the ring to 0–1', () => {
    expect(halo({ itemId: 'stim', potion: { stimUntil: STIM_DURATION_S } })).toBe(1)
    expect(halo({ itemId: 'stim', elapsedS: 90, potion: { stimUntil: STIM_DURATION_S } })).toBeCloseTo(0.5)
    expect(halo({ itemId: 'stim', elapsedS: STIM_DURATION_S, potion: { stimUntil: STIM_DURATION_S } })).toBe(0)
    expect(halo({ itemId: 'stim', elapsedS: 10, potion: { stimUntil: 9999 } })).toBe(1)
    expect(halo({ itemId: 'renewSoup', elapsedS: 30, potion: { renewUntil: RENEW_DURATION_S } })).toBeCloseTo(0.75)
    expect(halo({ itemId: 'beastOil', elapsedS: BEAST_OIL_DURATION_S + 1, potion: { beastOilUntil: BEAST_OIL_DURATION_S } })).toBe(0)
  })

  it('only fills the gap since the last tick, and caps that gap', () => {
    expect(potionVisualElapsedS(10, 1_000, 1_500)).toBeCloseTo(10.5)
    expect(potionVisualElapsedS(10, 0, 5_000)).toBeCloseTo(10 + POTION_HALO_DT_CAP_S)
    const ratio = halo({
      itemId: 'stim',
      elapsedS: 0,
      lastTick: 0,
      now: 90_000,
      potion: { stimUntil: STIM_DURATION_S },
    })
    expect(ratio).toBeCloseTo((STIM_DURATION_S - POTION_HALO_DT_CAP_S) / STIM_DURATION_S)
  })

  it('keeps a full ring for marks and none for instant potions', () => {
    expect(halo({ itemId: 'rushPowder', potion: { rush: true } })).toBe(1)
    expect(halo({ itemId: 'rushPowder' })).toBe(0)
    expect(halo({ itemId: 'doubleMist', potion: { doubleMist: 2 } })).toBe(1)
    expect(halo({ itemId: 'doubleMist' })).toBe(0)
    expect(halo({ itemId: 'salve', potion: { stimUntil: 999 } })).toBe(0)
    expect(halo({ itemId: 'brinkSalve' })).toBe(0)
    expect(halo({ itemId: 'clearMind' })).toBe(0)
    expect(halo({ itemId: null })).toBe(0)
  })
})

describe('potion hotbar stock cues', () => {
  it('tells where a dry potion comes from', () => {
    expect(potionEmptyAcquireTip('stim')).toBe('嗜血药剂见底，到炼金站做')
    expect(potionEmptyAcquireTip('beastOil')).toBe('狂兽油见底，到炼金站详情做一瓶')
    expect(potionEmptyAcquireTip('clearMind')).toBe('清醒图腾水见底，到炼金站做')
  })

  it('breathes only when the same potion goes from empty to stocked', () => {
    expect(potionQtyRestocked(0, 1, true)).toBe(true)
    expect(potionQtyRestocked(0, 3, true)).toBe(true)
    expect(potionQtyRestocked(1, 4, true)).toBe(false)
    expect(potionQtyRestocked(0, 0, true)).toBe(false)
    expect(potionQtyRestocked(0, 2, false)).toBe(false)
  })
})

describe('camp potion dock placement', () => {
  it('puts the hotbar on the camp sheet above the queue and off the workshop page', () => {
    const camp = campSource.slice(0, campSource.indexOf('<style'))
    const dock = dockSource.slice(0, dockSource.indexOf('<style'))
    const workshop = workersPanelSource.slice(0, workersPanelSource.indexOf('<style'))
    expect(camp.indexOf('<PotionDock')).toBeLessThan(camp.indexOf('class="board"'))
    expect(camp).toContain('class="potion-marks"')
    expect(dock).toContain('class="potion-dock"')
    expect(dock).toContain('class="potion-halo"')
    expect(dock.indexOf('<PotionIcon :name="itemId" />')).toBeLessThan(dock.indexOf('class="potion-name"'))
    expect(dock.indexOf('class="potion-name"')).toBeLessThan(dock.indexOf('class="potion-qty"'))
    expect(workshop).not.toContain('class="potion-dock"')
    expect(workshop).not.toContain('potion-slot')
  })
})
