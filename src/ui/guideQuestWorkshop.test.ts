import { describe, expect, it } from 'vitest'
import appSource from './app.vue?raw'
import detailSource from './stationDetailSheet.vue?raw'
import floatSource from './guideQuestFloat.vue?raw'
import panelSource from './workersPanelV2.vue?raw'

describe('workshop guide wiring', () => {
  it('flashes recruit, the bottom camp button, then the camp list on step 3', () => {
    expect(panelSource).toContain("fuseCue === 'recruit'")
    expect(panelSource).toContain("fuseCue === 'drag'")
    expect(panelSource).not.toContain('guideFlashFuse')
    expect(panelSource).not.toContain("fuseCue === 'openCamp'")
    const camp = appSource.slice(appSource.indexOf('class="camp-fab"'), appSource.indexOf('class="camp-fab"') + 280)
    expect(camp).toContain("campCue === 'openCamp'")
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
