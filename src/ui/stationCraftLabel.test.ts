import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import detailSource from './stationDetailSheet.vue?raw'
import miniSource from './stationMiniBar.vue?raw'
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

  it('keeps the output dropdown above a full-width progress bar', () => {
    const work = workersPanelSource.slice(
      workersPanelSource.indexOf('<div class="station-work">'),
      workersPanelSource.indexOf('</article>'),
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
    expect(craft).toContain('display: grid')
    const pickRule = craft.match(/\.ui-select\.station-craft-pick\)\s*\{[^}]*\}/)
    const effRule = craft.match(/\.station-progress \.eff\)\s*\{[^}]*\}/)
    const barRule = craft.match(/\.station-progress \.bar\)\s*\{[^}]*\}/)
    expect(pickRule?.[0]).toContain('grid-row: 1')
    expect(effRule?.[0]).toContain('grid-row: 1')
    expect(barRule?.[0]).toContain('grid-column: 1 / -1')
    expect(barRule?.[0]).toContain('grid-row: 2')
    expect(barRule?.[0]).toContain('width: 100%')
    expect(barRule?.[0]).toContain('height: 12px')
    expect(barRule?.[0]).toContain('border-width: 1px')
    expect(craft).not.toContain('flex: 1 1 0')
    expect(miniSource).toMatch(/\.mini\.rail\s*\{[^}]*display:\s*contents/)
    const sharedBar = miniSource.match(/\.bar\s*\{[^}]*\}/)
    expect(sharedBar?.[0]).toContain('height: 7px')
    expect(sharedBar?.[0]).not.toContain('border-width: 1px')
    expect(detailSource).toMatch(/\.craft-bar\s*\{[^}]*height:\s*22px/)
    expect(detailSource).toContain("bits.join('～')")
    expect(detailSource).not.toContain('stationCraftLabel')
    expect(detailSource).not.toContain('stationCraftPickOptions')
  })

  it('puts the workshop progress bar and efficiency on one row with a fixed efficiency width', () => {
    const row = workersPanelSource.slice(
      workersPanelSource.indexOf('.roster-v2:not(.sheet-ops) .station-craft-row :deep(.station-progress .bar)'),
      workersPanelSource.indexOf('.station.closed .station-name b::after'),
    )
    const barRule = row.match(/\.station-progress \.bar\)\s*\{[^}]*\}/)
    const effRule = row.match(/\.station-progress \.eff\)\s*\{[^}]*\}/)
    expect(barRule?.[0]).toContain('grid-column: 1;')
    expect(barRule?.[0]).not.toContain('1 / -1')
    expect(barRule?.[0]).toContain('grid-row: 1')
    expect(barRule?.[0]).toContain('box-sizing: border-box')
    expect(barRule?.[0]).toContain('min-width: 0')
    expect(barRule?.[0]).toContain('width: 100%')
    expect(effRule?.[0]).toContain('grid-column: 2')
    expect(effRule?.[0]).toContain('grid-row: 1')
    expect(effRule?.[0]).toContain('justify-self: end')
    expect(effRule?.[0]).toContain('text-align: right')
    expect(effRule?.[0]).toContain('tabular-nums')
    expect(effRule?.[0]).toContain('white-space: nowrap')
    expect(miniSource).toContain('STATION_HP_EFFICIENCY_RESERVE')
    expect(miniSource).toContain('class="eff-reserve"')
    expect(miniSource).toContain('class="eff-value"')
    expect(miniSource).toContain('tabular-nums')
    expect(miniSource).toMatch(/\.eff-reserve,[\s\S]*?\.eff-value\s*\{[^}]*grid-area:\s*1 \/ 1/)
    expect(workersPanelSource).toContain("content: '封'")
    expect(workersPanelSource).toMatch(/\.station\s*\{[^}]*min-width:\s*0/)
    expect(workersPanelSource).toMatch(/\.station-craft-row\s*\{[^}]*min-width:\s*0/)
  })

  it('enlarges only the workshop station slot, not the rest column avatar', () => {
    const css = workersPanelSource.slice(workersPanelSource.indexOf('<style'))
    expect(workersPanelSource).toContain('size="lg"')
    expect(workersPanelSource).toContain(':size="rosterFaceSize"')
    expect(workersPanelSource).toContain("shownRest.value || shownCombat.value ? 'md' : 'sm'")
    expect(workersPanelSource).not.toContain('ClassIcon')
    expect(css).toMatch(/\.station \.slot \.slot-main b\s*\{[^}]*font-size:\s*20px/)
    expect(css).toMatch(/\.station \.slot \.slot-main small\s*\{[^}]*font-size:\s*18px/)
    expect(css).toMatch(/\.station \.slot \.qdot\s*\{[^}]*width:\s*12px[^}]*border-width:\s*2px/)
    expect(css).toMatch(/\.slot-main b\s*\{[^}]*font-size:\s*10px/)
    expect(css).toMatch(/\.slot-main small\s*\{[^}]*font-size:\s*9px/)
    const banter = css.slice(css.indexOf('.banter {'), css.indexOf('@keyframes worker-banter'))
    expect(banter).toMatch(/bottom:\s*calc\(100% \+ 1px\)/)
    expect(workersPanelSource).toMatch(
      /<span v-if="banterLine\(w\.id\)" class="banter"[\s\S]*?<WorkerAvatar/,
    )
  })
})