import { describe, expect, it } from 'vitest'
import settings from './settingsPanel.vue?raw'

describe('settings layout', () => {
  it('uses a round close mark and keeps the stats list', () => {
    expect(settings).toContain('aria-label="关闭"')
    expect(settings).toContain('border-radius: 50%')
    expect(settings).not.toContain('>关闭</button>')
    expect(settings).toContain('游戏日 {{ day }}')
    expect(settings).toContain('离线 {{ game.save.offlineCount }} 次')
  })

  it('puts the install card and the three switches on the general page', () => {
    const general = settings.indexOf("page === 'general'")
    const install = settings.indexOf('class="install-card"')
    const music = settings.indexOf('>音乐<')
    const sfx = settings.indexOf('>音效<')
    const banter = settings.indexOf('>工坊闲话<')
    const version = settings.indexOf("page === 'version'")
    expect(general).toBeGreaterThan(0)
    expect(install).toBeGreaterThan(general)
    expect(music).toBeGreaterThan(install)
    expect(sfx).toBeGreaterThan(music)
    expect(banter).toBeGreaterThan(sfx)
    expect(version).toBeGreaterThan(banter)
    expect(settings).toContain('像 App 一样全屏打开')
    expect(settings).toContain('>添加</button>')
    expect(settings).toContain("addToHomeChoiceNow !== 'hidden'")
  })

  it('keeps a single version action and groups the GM buttons', () => {
    expect(settings).toContain('class="ver-card"')
    expect(settings).toContain('class="refresh wide"')
    expect(settings).toContain('<button v-else type="button" class="wide"')
    const labels = [
      '初始化',
      '跳过引导',
      '加金币 1w',
      '加钻石 1w',
      '加基础物资',
      '加灵感 1万',
      '加苦工×5',
      '满品质苦工',
      '站点全满级',
      '重置科技',
      '困兽满体力',
      '困兽跳到阶段线',
      '切换今日困兽',
      '割草满体力',
    ]
    const at = labels.map((label) => settings.indexOf(label))
    expect(at.every((index) => index > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(settings).toContain('class="gm-grid"')
    expect(settings).toContain('苦工 / 站点')
    expect(settings).toContain('resetAsk')
    expect(settings).toContain('confirmReset')
    expect(settings).toContain('初始化会重开存档。')
  })
})
