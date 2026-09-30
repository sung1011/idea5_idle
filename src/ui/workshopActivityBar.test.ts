import { describe, expect, it } from 'vitest'
import appSource from './app.vue?raw'
import settingsSource from './settingsPanel.vue?raw'
import barSource from './workshopActivityBar.vue?raw'
import sheetSource from './travelingMerchantSheet.vue?raw'

describe('workshop activity bar', () => {
  it('keeps a fixed-height bar under the resource hud on the workshop page', () => {
    const page = appSource.slice(appSource.indexOf('<main'), appSource.indexOf('</main>'))
    expect(page.indexOf('<WorkshopActivityBar v-if="tab === \'workshop\'"')).toBeLessThan(
      page.indexOf('<WorkersPanelV2'),
    )
    expect(appSource).toContain('.page.workshop > .activity-bar')
    expect(appSource).toContain('flex: 0 0 52px')
    expect(barSource).toContain('height: 52px')
    expect(barSource).toContain('min-height: 52px')
    expect(barSource).toContain('aria-label="工坊活动"')
    expect(barSource).toContain('class="dot"')
    expect(barSource).toContain('class="clock"')
  })

  it('opens a merchant sheet that can close without sending him away', () => {
    expect(sheetSource).toContain('aria-label="限时商人"')
    expect(sheetSource).toContain('aria-label="关闭"')
    expect(sheetSource).toContain('class="speech"')
    expect(sheetSource).toContain('钻石 ×{{ order.diamonds }}')
    expect(sheetSource).toContain("canDeliver.value ? '交付'")
    expect(sheetSource).toContain('还差')
    expect(sheetSource).not.toContain('leaveTravelingMerchant')
    expect(settingsSource).toContain('立刻召唤商人')
  })
})
