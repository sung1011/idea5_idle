import { describe, expect, it } from 'vitest'
import detailSource from './stationDetailSheet.vue?raw'
import miniSource from './stationMiniBar.vue?raw'
import workersPanelSource from './workersPanelV2.vue?raw'

describe('station detail button', () => {
  it('opens the sheet only from the dedicated button', () => {
    expect(workersPanelSource).toContain(':aria-label="`查看${board.label}详情`"')
    expect(workersPanelSource).toContain('@click.stop="openStationDetail(board.stationId)"')
    expect(workersPanelSource).toMatch(/详情\s*<\/button>/)
    const name = workersPanelSource.match(/<div class="station-name">[\s\S]*?<\/div>/)
    expect(name?.[0]).toBeTruthy()
    expect(name?.[0]).not.toContain('@click')
    expect(workersPanelSource).toContain('game.assignIdle(stationId)')
    expect(workersPanelSource).not.toContain('tapLockedStation')
    const dragEnd = workersPanelSource.slice(
      workersPanelSource.indexOf('function onDragEnd'),
      workersPanelSource.indexOf('function slotDropClass'),
    )
    expect(dragEnd).toContain("if (source?.kind === 'slot') return")
    expect(dragEnd).not.toContain('openStationDetail')
  })

  it('keeps a visual progress bar on the station row and in the detail sheet', () => {
    const work = workersPanelSource.match(/<div class="station-work">[\s\S]*?<\/article>/)
    expect(work?.[0]).toContain('<StationMiniBar')
    const slotMain = workersPanelSource.match(/<span class="slot-main">[\s\S]*?<\/span>/)
    expect(slotMain?.[0]).not.toContain('StationMiniBar')
    expect(detailSource).toContain('<StationMiniBar :station-id="stationId" layout="sheet" />')
    expect(detailSource).toContain('制造进度')
    expect(miniSource).toContain('useVisualProgress')
  })
})
