import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import detailSource from './stationDetailSheet.vue?raw'
import {
  stationCraftLabel,
  stationCraftPickOptions,
  stationCraftPickReadonly,
} from './stationCraftLabel'
import workersPanelSource from './workersPanelV2.vue?raw'

describe('station craft label', () => {
  it('joins the selected category outputs and falls back to the category name', () => {
    const save = createSave()
    expect(stationCraftLabel(save, 'herbalism')).toBe('草')
    expect(stationCraftLabel(save, 'alchemy')).toBe('药剂')
    expect(stationCraftLabel(save, 'cooking')).toBe('熟食')
    expect(stationCraftLabel(save, 'hunting')).toBe('肉、鱼')
    expect(stationCraftLabel(save, 'mining')).toBe('铜矿、荒晶')
    expect(stationCraftLabel(save, 'inscription')).toBe('符文')

    save.stations.cooking.selectedCategory = 'iron'
    save.stations.hunting.selectedCategory = 'mithril'
    save.stations.mining.stallReason = 'emptyInput'
    save.stations.herbalism.gatherPauseUntil = save.elapsedS + 30
    expect(stationCraftLabel(save, 'cooking')).toBe('烤肉')
    expect(stationCraftLabel(save, 'hunting')).toBe('肉、鱼、血、眼')
    expect(stationCraftLabel(save, 'mining')).toBe('铜矿、荒晶')
    expect(stationCraftLabel(save, 'herbalism')).toBe('草')
  })

  it('offers output names as category options and grays out locked rows', () => {
    const save = createSave()
    expect(stationCraftPickOptions(save, 'mining')).toEqual([
      { value: 'copper', label: '铜矿、荒晶', disabled: false },
      { value: 'iron', label: '铁矿、荒晶（Lv5）', disabled: true },
    ])
    expect(stationCraftPickReadonly(save, 'mining')).toBe(false)
    expect(stationCraftPickOptions(save, 'herbalism')).toEqual([
      { value: 'default', label: '草', disabled: false },
    ])
    expect(stationCraftPickReadonly(save, 'herbalism')).toBe(true)
    expect(stationCraftPickOptions(save, 'inscription')).toEqual([
      { value: 'default', label: '符文', disabled: false },
    ])
    expect(stationCraftPickReadonly(save, 'alchemy')).toBe(true)

    const cooking = stationCraftPickOptions(save, 'cooking')
    expect(cooking.map((row) => row.value)).toEqual(['copper', 'iron', 'mithril'])
    expect(cooking.map((row) => row.label)).toEqual(['熟食', '烤肉', '香料炖（Lv5）'])
    expect(cooking.map((row) => !!row.disabled)).toEqual([false, false, true])
    expect(stationCraftPickReadonly(save, 'cooking')).toBe(false)
  })

  it('puts the output dropdown on the left of the progress bar', () => {
    const work = workersPanelSource.slice(
      workersPanelSource.indexOf('<div class="station-work">'),
      workersPanelSource.indexOf('<div class="station-side">'),
    )
    expect(work).toContain('class="slots"')
    expect(work).not.toContain('class="station-craft"')
    expect(work).toContain('class="station-craft-row"')
    expect(work).toContain('stationCraftPickOptions(game.save, board.stationId)')
    expect(work).toContain('stationCraftPickReadonly(game.save, board.stationId)')
    expect(work).toContain('onCraftCategory(board.stationId, $event)')
    expect(work.indexOf('class="slots"')).toBeLessThan(work.indexOf('class="station-craft-row"'))
    expect(work.indexOf('<UiSelect')).toBeLessThan(work.indexOf('<StationMiniBar'))
    expect(workersPanelSource).toContain('game.selectCategory(stationId, value as CategoryId)')
    const craft = workersPanelSource.slice(
      workersPanelSource.indexOf('.station-craft-row {'),
      workersPanelSource.indexOf('.potion-row {'),
    )
    expect(craft).toContain('station-craft-pick')
    expect(craft).toContain('station-progress')
    expect(detailSource).toContain("bits.join('～')")
    expect(detailSource).not.toContain('stationCraftLabel')
    expect(detailSource).not.toContain('stationCraftPickOptions')
  })

  it('enlarges only the workshop station slot, not the rest column avatar', () => {
    const css = workersPanelSource.slice(workersPanelSource.indexOf('<style'))
    expect(css).toMatch(/\.avatar\s*\{[^}]*width:\s*24px/)
    expect(css).toMatch(/\.avatar :deep\(\.class-ico\)\s*\{[^}]*width:\s*13px/)
    expect(css).toMatch(/\.station \.slot \.avatar\s*\{[^}]*width:\s*48px[^}]*border-width:\s*4px/)
    expect(css).toMatch(/\.station \.slot \.avatar :deep\(\.class-ico\)\s*\{[^}]*width:\s*26px/)
    expect(css).toMatch(/\.station \.slot \.slot-main b\s*\{[^}]*font-size:\s*20px/)
    expect(css).toMatch(/\.station \.slot \.slot-main small\s*\{[^}]*font-size:\s*18px/)
    expect(css).toMatch(/\.station \.slot \.qdot\s*\{[^}]*width:\s*12px[^}]*border-width:\s*2px/)
    expect(css).toMatch(/\.slot-main b\s*\{[^}]*font-size:\s*10px/)
    expect(css).toMatch(/\.slot-main small\s*\{[^}]*font-size:\s*9px/)
    const banter = css.slice(css.indexOf('.banter {'), css.indexOf('@keyframes worker-banter'))
    expect(banter).toMatch(/bottom:\s*calc\(100% \+ 1px\)/)
    expect(workersPanelSource).toMatch(
      /<span v-if="banterLine\(w\.id\)" class="banter"[\s\S]*?<span class="avatar"/,
    )
  })
})