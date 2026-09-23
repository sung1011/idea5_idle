import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import detailSource from './stationDetailSheet.vue?raw'
import { stationCraftLabel } from './stationCraftLabel'
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

  it('shows the label on the station row between the slot and the progress bar', () => {
    const work = workersPanelSource.slice(
      workersPanelSource.indexOf('<div class="station-work">'),
      workersPanelSource.indexOf('<StationMiniBar'),
    )
    expect(work).toContain('class="slots"')
    expect(work).toContain('class="station-craft"')
    expect(work).toContain('stationCraftLabel(game.save, board.stationId)')
    expect(work.indexOf('class="slots"')).toBeLessThan(work.indexOf('class="station-craft"'))
    const craft = workersPanelSource.slice(
      workersPanelSource.indexOf('.station-craft {'),
      workersPanelSource.indexOf('.potion-row {'),
    )
    expect(craft).toMatch(/text-overflow:\s*ellipsis/)
    expect(craft).toMatch(/white-space:\s*nowrap/)
    expect(detailSource).toContain("bits.join('～')")
    expect(detailSource).not.toContain('stationCraftLabel')
  })
})