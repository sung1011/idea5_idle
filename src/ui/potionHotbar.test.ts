import { describe, expect, it } from 'vitest'
import { BEAST_OIL_DURATION_S, RENEW_DURATION_S, STIM_DURATION_S } from '../sim/tables'
import workersPanelSource from './workersPanelV2.vue?raw'
import {
  POTION_HALO_DT_CAP_S,
  potionEffectRemainRatio,
  potionEmptyAcquireTip,
  potionQtyRestocked,
  potionVisualElapsedS,
  type PotionHaloBuffs,
  type PotionHaloInput,
} from './potionHotbar'

function halo(
  partial: Omit<Partial<PotionHaloInput>, 'buffs'> & {
    itemId: PotionHaloInput['itemId']
    buffs?: Partial<PotionHaloBuffs>
  },
): number {
  return potionEffectRemainRatio({
    elapsedS: 0,
    lastTick: 0,
    now: 0,
    ...partial,
    buffs: {
      stimUntil: null,
      renewUntil: null,
      beastOilUntil: null,
      rushStation: null,
      doubleMist: null,
      ...partial.buffs,
    },
  })
}

describe('potion hotbar halo', () => {
  it('shrinks timed buffs and clamps the ring to 0–1', () => {
    expect(halo({ itemId: 'stim', buffs: { stimUntil: STIM_DURATION_S } })).toBe(1)
    expect(halo({ itemId: 'stim', elapsedS: 90, buffs: { stimUntil: STIM_DURATION_S } })).toBeCloseTo(0.5)
    expect(halo({ itemId: 'stim', elapsedS: STIM_DURATION_S, buffs: { stimUntil: STIM_DURATION_S } })).toBe(0)
    expect(halo({ itemId: 'stim', elapsedS: 10, buffs: { stimUntil: 9999 } })).toBe(1)
    expect(halo({ itemId: 'renewSoup', elapsedS: 30, buffs: { renewUntil: RENEW_DURATION_S } })).toBeCloseTo(0.75)
    expect(halo({ itemId: 'beastOil', elapsedS: BEAST_OIL_DURATION_S + 1, buffs: { beastOilUntil: BEAST_OIL_DURATION_S } })).toBe(0)
  })

  it('only fills the gap since the last tick, and caps that gap', () => {
    expect(potionVisualElapsedS(10, 1_000, 1_500)).toBeCloseTo(10.5)
    expect(potionVisualElapsedS(10, 0, 5_000)).toBeCloseTo(10 + POTION_HALO_DT_CAP_S)
    const ratio = halo({
      itemId: 'stim',
      elapsedS: 0,
      lastTick: 0,
      now: 90_000,
      buffs: { stimUntil: STIM_DURATION_S },
    })
    expect(ratio).toBeCloseTo((STIM_DURATION_S - POTION_HALO_DT_CAP_S) / STIM_DURATION_S)
  })

  it('keeps a full ring for marks and none for instant potions', () => {
    expect(halo({ itemId: 'rushPowder', buffs: { rushStation: 'herbalism' } })).toBe(1)
    expect(halo({ itemId: 'rushPowder' })).toBe(0)
    expect(halo({ itemId: 'doubleMist', buffs: { doubleMist: { stationId: 'alchemy', mul: 2 } } })).toBe(1)
    expect(halo({ itemId: 'doubleMist' })).toBe(0)
    expect(halo({ itemId: 'salve', buffs: { stimUntil: 999 } })).toBe(0)
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

describe('workshop potion dock placement', () => {
  it('keeps the hotbar under the status band, above the page bottom', () => {
    const template = workersPanelSource.slice(0, workersPanelSource.indexOf('<style'))
    const band = template.indexOf('class="status-band"')
    const dock = template.lastIndexOf('class="potion-dock"')
    expect(band).toBeGreaterThan(-1)
    expect(dock).toBeGreaterThan(band)
    expect(template).toContain('class="potion-halo"')
    expect(template.indexOf('<PotionIcon :name="itemId" />')).toBeLessThan(template.indexOf('class="potion-name"'))
    expect(template.indexOf('class="potion-name"')).toBeLessThan(template.indexOf('class="potion-qty"'))
    expect(workersPanelSource).toContain('padding: 4px 6px 16px')
  })
})
