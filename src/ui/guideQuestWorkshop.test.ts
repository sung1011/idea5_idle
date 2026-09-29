import { describe, expect, it } from 'vitest'
import detailSource from './stationDetailSheet.vue?raw'
import floatSource from './guideQuestFloat.vue?raw'
import panelSource from './workersPanelV2.vue?raw'

describe('workshop guide wiring', () => {
  it('flashes recruit, the camp tile, then the camp list on step 3', () => {
    expect(panelSource).toContain("fuseCue === 'recruit'")
    expect(panelSource).toContain("fuseCue === 'openCamp'")
    expect(panelSource).toContain("fuseCue === 'drag'")
    expect(panelSource).not.toContain('guideFlashFuse')
    const camp = panelSource.slice(panelSource.indexOf('aria-label="展开营地"') - 180, panelSource.indexOf('aria-label="展开营地"'))
    expect(camp).toContain("fuseCue === 'openCamp'")
  })

  it('flashes the alchemy station card, and the detail progress after it opens', () => {
    expect(panelSource).toContain("alchemyCardFlash && board.stationId === 'alchemy'")
    expect(detailSource).toContain('guideAlchemyProgressFlash')
    expect(detailSource).toContain("'guide-flash': alchemyProgressFlash")
  })

  it('reads whether the camp list is open when drawing the guide line', () => {
    expect(floatSource).toContain('guideQuestView(game.save, guideCampSheetOpen.value)')
  })
})
