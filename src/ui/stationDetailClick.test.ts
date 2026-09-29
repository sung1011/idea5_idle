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
    expect(workersPanelSource).not.toContain('game.assignIdle')
    expect(workersPanelSource).not.toContain('点此派入')
    expect(workersPanelSource).toContain('空岗`"')
    expect(workersPanelSource).not.toContain('toggleStationClosed')
    expect(workersPanelSource).not.toContain('封闭')
    const rail = workersPanelSource.slice(
      workersPanelSource.indexOf('<div class="station-rail">'),
      workersPanelSource.indexOf('<div class="station-work">'),
    )
    expect(rail.indexOf('class="station-name"')).toBeGreaterThanOrEqual(0)
    expect(rail).not.toContain('station-closed')
    expect(rail.indexOf('class="station-name"')).toBeLessThan(rail.indexOf('class="station-detail"'))
    expect(workersPanelSource.indexOf('<div class="station-rail">')).toBeLessThan(
      workersPanelSource.indexOf('<div class="station-work">'),
    )
    expect(workersPanelSource).not.toContain('station-side')
    const railCss = workersPanelSource.slice(
      workersPanelSource.indexOf('.station-rail {'),
      workersPanelSource.indexOf('.station-work {'),
    )
    expect(railCss).toContain('flex: 1 1 0')
    expect(railCss).toContain('width: 100%')
    const railBtns = railCss.match(/\.station-detail\s*\{[^}]*\}/)
    expect(railBtns?.[0]).toContain('writing-mode: vertical-rl')
    expect(railBtns?.[0]).toContain('white-space: nowrap')
    expect(railBtns?.[0]).toContain('min-height: 32px')
    expect(railBtns?.[0]).not.toContain('min-height: 0')
    expect(railCss).toMatch(/\.station-name b\s*\{[^}]*font-size:\s*13px/)
    expect(railCss).toMatch(/\.station-detail\s*\{[^}]*font-size:\s*10px/)
    const sheetTail = detailSource.slice(detailSource.lastIndexOf('class="actions"'))
    expect(sheetTail).toContain('kind="danger"')
    expect(sheetTail).toContain('>封闭</ActButton>')
    expect(sheetTail).toContain('>开启</ActButton>')
    expect(sheetTail).toContain('确定封闭')
    expect(detailSource).toContain('game.toggleStationClosed(props.stationId)')
    expect(sheetTail.indexOf('class="actions"')).toBeLessThan(sheetTail.indexOf('>封闭</ActButton>'))
    expect(sheetTail.indexOf('class="help-box"')).toBeLessThan(sheetTail.indexOf('class="seal"'))
    expect(workersPanelSource).not.toContain('game.withdraw(stationId)')
    expect(workersPanelSource).not.toContain('从${board.label}撤出')
    expect(workersPanelSource).not.toContain('assignHerb')
    expect(workersPanelSource).toContain("guideFlashAutoHerb && board.stationId === 'herbalism'")
    expect(workersPanelSource).toContain('guideFlashAutoHerb && row.order === 1')
    expect(workersPanelSource).toContain('guideFlashRestFood')
    expect(workersPanelSource).not.toContain('rest-actions')
    expect(workersPanelSource).not.toContain('aria-label="派入"')
    expect(workersPanelSource).not.toContain('canDispatch')
    expect(workersPanelSource).not.toContain('canWithdraw')
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
    expect(detailSource).toContain('制造进度')
    expect(detailSource).toContain('craftProgressView')
    expect(detailSource).toContain('class="craft-bar"')
    expect(detailSource).toContain('{{ craft.percent }}%')
    expect(detailSource).toContain('class="craft-side"')
    expect(detailSource).toContain('.fields > div.progress dd')
    expect(detailSource).toContain('<WorkerAvatar')
    expect(detailSource).toContain('size="md"')
    expect(detailSource).toContain(':quality="worker.qualityTier"')
    expect(detailSource).toContain('craftHaltText')
    expect(miniSource).toContain('useVisualProgress')
    expect(miniSource).toContain('wrap: true')
    const plate = workersPanelSource.slice(
      workersPanelSource.indexOf('.roster-v2:not(.sheet-ops) .station-rail {'),
      workersPanelSource.indexOf('.roster-v2:not(.sheet-ops) .station-craft-row :deep(.station-progress .bar)'),
    )
    expect(plate).toContain('align-items: stretch')
    expect(plate).toContain('flex: 0 0 64px')
    expect(plate).toContain('flex-direction: column')
    expect(plate).toContain('height: 100%')
    expect(plate).toContain('width: 28px')
    expect(plate).toContain('height: 28px')
  })
})
