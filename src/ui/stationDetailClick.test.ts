import { describe, expect, it } from 'vitest'
import sheetSource from './campSheet.vue?raw'
import detailSource from './stationDetailSheet.vue?raw'
import miniSource from './stationMiniBar.vue?raw'
import workersPanelSource from './workersPanelV2.vue?raw'

describe('station detail button', () => {
  it('opens the sheet only from the dedicated button', () => {
    expect(workersPanelSource).toContain(':aria-label="`查看${board.label}详情`"')
    expect(workersPanelSource).toContain('@click.stop="openStationDetail(board.stationId)"')
    expect(workersPanelSource).toMatch(/>\s*详\s*<\/button>/)
    expect(workersPanelSource).toContain('onStationPointerDown')
    expect(workersPanelSource).toContain('data-round-badge')
    expect(workersPanelSource).toContain('stationRoundBadge(')
    expect(workersPanelSource).toContain('stationRoundBadgeAria(')
    expect(workersPanelSource).not.toContain('v-if="game.save.stations[board.stationId].manualRounds > 0"')
    expect(workersPanelSource).not.toContain('×{{ game.save.stations[board.stationId].manualRounds }}')
    expect(workersPanelSource).toContain('ROUND_BADGE_TIP')
    expect(workersPanelSource).toContain('data-round-clear')
    expect(workersPanelSource).toContain('CLEAR_MANUAL_QUEUE_LABEL')
    expect(workersPanelSource).toContain('CLEAR_MANUAL_QUEUE_NOTE')
    expect(workersPanelSource).toContain(':disabled="!roundClearable"')
    expect(workersPanelSource).toContain('canClearStationWork(')
    expect(workersPanelSource).toContain('data-round-bubble')
    const name = workersPanelSource.match(/<div class="station-name"[\s\S]*?<\/div>/)
    expect(name?.[0]).toBeTruthy()
    expect(name?.[0]).not.toContain('openStationDetail')
    const clickFn = workersPanelSource.slice(
      workersPanelSource.indexOf('function onStationCardClick'),
      workersPanelSource.indexOf('function closeStationDetail'),
    )
    const clearFn = workersPanelSource.slice(
      workersPanelSource.indexOf('function onClearManualQueue'),
      workersPanelSource.indexOf('function onRoundBadge'),
    )
    expect(clearFn).toContain('if (result.ok) closeRoundHelp()')
    expect(clickFn).not.toContain('.auto-toggle')
    expect(clickFn).toContain('.round-badge')
    expect(clickFn).toContain('.station-detail')
    expect(clickFn).not.toContain('.station-name')
    expect(clickFn).not.toContain("classList.contains('empty')")
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
    expect(railCss).toContain('position: relative')
    const railBtns = railCss.match(/\.station-detail\s*\{[^}]*\}/)
    expect(railBtns?.[0]).toContain('border-radius: 50%')
    expect(railBtns?.[0]).toContain('width: 22px')
    expect(railBtns?.[0]).toContain('min-height: 22px')
    expect(railBtns?.[0]).not.toContain('min-height: 0')
    expect(railBtns?.[0]).not.toContain('writing-mode')
    expect(railCss).toMatch(/\.station-name b\s*\{[^}]*font-size:\s*13px/)
    expect(railCss).toMatch(/\.station-detail\s*\{[^}]*font-size:\s*11px/)
    const sheetTail = detailSource.slice(detailSource.lastIndexOf('class="actions"'))
    expect(sheetTail).toContain('苦工详情')
    expect(sheetTail).not.toContain('撤出')
    expect(sheetTail).not.toContain('换人')
    expect(sheetTail).not.toContain('封闭')
    expect(detailSource).not.toContain('toggleStationClosed')
    expect(detailSource).not.toContain('onWithdraw')
    expect(detailSource).not.toContain('onSwap')
    expect(detailSource).toContain('<HelpMark')
    expect(detailSource).toContain('<ModeHelpSheet')
    expect(sheetTail).not.toContain('class="help-box"')
    expect(workersPanelSource).not.toContain('game.withdraw(stationId)')
    expect(workersPanelSource).not.toContain('从${board.label}撤出')
    expect(workersPanelSource).not.toContain('assignHerb')
    expect(workersPanelSource).toContain("guideFlashHerbStation && board.stationId === 'herbalism'")
    expect(workersPanelSource).toContain('点击派工')
    expect(workersPanelSource).toContain('data-round-auto')
    expect(workersPanelSource.indexOf('data-round-auto')).toBeLessThan(workersPanelSource.indexOf('data-round-clear'))
    expect(workersPanelSource).not.toContain('class="auto-toggle"')
    const badgeCss = workersPanelSource.slice(
      workersPanelSource.indexOf('.round-badge {'),
      workersPanelSource.indexOf('.round-badge.auto'),
    )
    expect(badgeCss).toContain('top: 2px')
    expect(badgeCss).toContain('right: 2px')
    expect(badgeCss).toContain('font-size: 16px')
    expect(badgeCss).not.toContain('top: 24px')
    expect(sheetSource).not.toContain('guideFlashAutoHerb')
    expect(sheetSource).toContain('guideFlashRestFood')
    expect(workersPanelSource).not.toContain('guideFlashRestFood')
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
