import { describe, expect, it } from 'vitest'
import appSource from './app.vue?raw'
import sheetSource from './campSheet.vue?raw'
import detailSource from './stationDetailSheet.vue?raw'
import floatSource from './guideQuestFloat.vue?raw'
import panelSource from './workersPanelV2.vue?raw'

describe('workshop guide wiring', () => {
  it('flashes the camp button, then recruit and the list inside the shared sheet', () => {
    expect(sheetSource).toContain("fuseCue === 'recruit'")
    expect(sheetSource).toContain("fuseCue === 'drag'")
    expect(sheetSource).toContain('guideFlashRecruit')
    expect(sheetSource).not.toContain('guideFlashAutoHerb')
    expect(panelSource).toContain("guideFlashHerbStation && board.stationId === 'herbalism'")
    expect(panelSource).toContain('herbQueue')
    expect(panelSource).not.toContain('guideFlashFuse')
    expect(panelSource).not.toContain("fuseCue === 'openCamp'")
    expect(sheetSource).not.toContain("fuseCue === 'openCamp'")
    const camp = appSource.slice(appSource.indexOf('class="camp-fab"'), appSource.indexOf('class="camp-fab"') + 320)
    expect(camp).toContain('campButtonFlash')
    expect(appSource).toContain("isGuideQuestFlash(game.save, 'recruit')")
    expect(appSource).not.toContain("isGuideQuestFlash(game.save, 'autoHerb')")
    expect(appSource).toContain('v-if="campSheetOpen"')
  })

  it('flashes the alchemy station card, and the detail progress after it opens', () => {
    expect(panelSource).toContain("alchemyCardFlash && board.stationId === 'alchemy'")
    expect(panelSource).toContain('data-round-auto')
    expect(panelSource).toContain('data-round-badge')
    expect(panelSource).not.toContain('class="auto-toggle"')
    expect(panelSource).toContain('guideFlashAuto && !roundHelpStation')
    expect(panelSource).toContain("'guide-flash': guideFlashAuto")
    expect(detailSource).toContain('guideAlchemyProgressFlash')
    expect(detailSource).toContain("'guide-flash': alchemyProgressFlash")
  })

  it('reads whether the camp list is open when drawing the guide line', () => {
    expect(floatSource).toContain('guideQuestView(game.save, guideCampSheetOpen.value)')
    expect(floatSource).toContain('guideQuestOpenTaskId')
  })

  it('lifts the quest bar on the workshop page and keeps the dock offset elsewhere', () => {
    expect(appSource).toContain(':workshop="tab === \'workshop\'"')
    expect(floatSource).toContain("questFloatBottomCss(props.workshop ? 'workshop' : 'dock')")
    expect(floatSource).not.toContain('bottom: calc(var(--dock-height) + 64px)')
  })
})
