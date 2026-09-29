import { describe, expect, it } from 'vitest'
import appSource from './app.vue?raw'
import tipSource from './campDragTip.ts?raw'
import sheetSource from './campSheet.vue?raw'

describe('camp dock ui', () => {
  it('puts the raised camp button in the center and keeps the station strip above the tabs', () => {
    const dock = appSource.slice(appSource.indexOf('<nav class="dock"'), appSource.indexOf('</nav>'))
    expect(dock.indexOf('class="dock-hp"')).toBeLessThan(dock.indexOf('dockLead'))
    expect(dock.indexOf('dockLead')).toBeLessThan(dock.indexOf('class="camp-fab"'))
    expect(dock.indexOf('class="camp-fab"')).toBeLessThan(dock.indexOf('dockTail'))
    expect(dock).toContain('营地')
    expect(dock).toContain("campTone === 'blocked'")
    expect(dock).toContain('堵')
    expect(appSource).toContain('v-if="campSheetOpen"')
    expect(appSource).not.toContain("tab !== 'workshop' && campSheetOpen")
    const motion = appSource.slice(appSource.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(motion).toContain('.dock button.camp-fab.ready')
    expect(motion).toContain('animation: none')
  })

  it('reuses the camp list and only offers dispatch jumps that the save has unlocked', () => {
    expect(sheetSource).toContain('restQueueRows')
    expect(sheetSource).toContain('campDispatchEntries')
    expect(sheetSource).toContain('CAMP_DISPATCH_LABEL')
    expect(sheetSource).not.toContain('派去悬赏')
    expect(sheetSource).toContain('CAMP_STATION_DRAG_TIP')
    expect(sheetSource).toContain('抽苦工')
    expect(sheetSource).toContain('>详情</button>')
    expect(sheetSource).toContain('data-drop="rest-worker"')
    expect(sheetSource).toContain('game.dragAssign')
    expect(tipSource).toContain('回工坊拖动')
    expect(sheetSource).not.toContain('localStorage')
  })
})