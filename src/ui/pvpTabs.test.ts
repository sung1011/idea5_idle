import { describe, expect, it } from 'vitest'
import app from './app.vue?raw'
import panel from './pvpPanel.vue?raw'
import mine from './treasureMinePanel.vue?raw'
import banner from './treasureBannerPanel.vue?raw'
import avatar from './playerAvatar.vue?raw'
import tabs from './pvpTabs.ts?raw'
import { PVP_TAB_KEY, pvpViewOf, selectPvpView, settlePvpTab } from './pvpTabs'

function memory(): Storage {
  const bag = new Map<string, string>()
  return {
    get length() {
      return bag.size
    },
    clear() {
      bag.clear()
    },
    getItem(key: string) {
      return bag.has(key) ? bag.get(key)! : null
    },
    key(index: number) {
      return [...bag.keys()][index] ?? null
    },
    removeItem(key: string) {
      bag.delete(key)
    },
    setItem(key: string, value: string) {
      bag.set(key, value)
    },
  }
}

describe('pvp treasure tab', () => {
  it('switches 夺宝 and 割草, and keeps the old pages on 夺宝', () => {
    expect(panel).toContain('role="tablist"')
    expect(panel).toContain('aria-label="PVP玩法"')
    expect(panel).toContain('PVP_VIEW_LABELS[id]')
    expect(tabs).toContain("treasure: '夺宝'")
    expect(tabs).toContain("herb: '割草'")
    expect(tabs).toContain("beast: '困兽'")
    expect(panel).toContain('<BeastPvpPanel')
    expect(panel).toContain('<HerbPvpPanel')
    expect(panel).not.toContain('aria-label="PVP分页"')
    expect(panel).not.toContain('军械铺')
    expect(panel).not.toContain('TreasureArmoryPanel')
    expect(panel).not.toContain('<TreasureBannerPanel')
    expect(panel).not.toContain("modeHelpOf('banner')")
    expect(panel).toContain('modeHelpOf(helpId())')
    expect(panel).toContain('bootPvpView')
    expect(panel).toContain('<TreasureMinePanel')
    expect(pvpViewOf('banner')).toBe('treasure')
    expect(pvpViewOf('armory')).toBe('treasure')
    expect(pvpViewOf('treasure')).toBe('treasure')
    expect(pvpViewOf('herb')).toBe('herb')
    expect(pvpViewOf('beast')).toBe('beast')
    expect(pvpViewOf(null)).toBe('treasure')
    const store = memory()
    store.setItem(PVP_TAB_KEY, 'banner')
    expect(settlePvpTab(store)).toBe('treasure')
    expect(store.getItem(PVP_TAB_KEY)).toBe('treasure')
    store.setItem(PVP_TAB_KEY, 'armory')
    expect(settlePvpTab(store)).toBe('treasure')
    expect(store.getItem(PVP_TAB_KEY)).toBe('treasure')
    const empty = memory()
    expect(settlePvpTab(empty)).toBe('treasure')
    expect(empty.getItem(PVP_TAB_KEY)).toBeNull()
    expect(selectPvpView('herb', store)).toBe('herb')
    expect(store.getItem(PVP_TAB_KEY)).toBe('herb')
    expect(selectPvpView('banner', store)).toBe('treasure')
    expect(store.getItem(PVP_TAB_KEY)).toBe('treasure')
  })

  it('shows banner level and jade on a bar, and upgrades in a sheet', () => {
    expect(mine).toContain('class="banner-bar"')
    expect(mine).toContain('aria-label="战旗"')
    expect(mine).toContain('战旗 Lv{{ bannerLevel() }}')
    expect(mine).toContain('荣誉徽记 <b>{{ jadeOnHand() }}</b>')
    expect(mine).toContain('bannerUpgradeReady')
    expect(mine).toContain('class="banner-dot"')
    expect(mine).toContain('<TreasureBannerPanel')
    expect(mine).toContain('class="tags"')
    expect(mine).toContain('class="board"')
    expect(mine).toContain('aria-label="宝库"')
    expect(mine).toContain('`${TREASURE_REFRESH_SAND_COST} 砂金`')
    expect(mine).toContain('`${TREASURE_REFRESH_COST} 钻`')
    expect(mine).toContain("onRefresh('sandGold')")
    expect(mine).toContain("onRefresh('diamonds')")
    expect(mine).toContain('>侦察</ActButton>')
    expect(mine).toContain('`${TREASURE_SCOUT_COST} 砂金`')
    expect(banner).toContain('class="mask"')
    expect(banner).toContain('@click.self="emit(\'close\')"')
    expect(banner).toContain('关闭')
    expect(banner).toContain('aria-label="战旗"')
    expect(banner).toContain('战旗 Lv{{ level() }}')
    expect(banner).toContain('已满')
    expect(banner).toContain('is-short')
    expect(banner).toContain('升级 {{ cost() }} 荣誉徽记')
    expect(banner).toContain('upgradeTreasureBanner')
    expect(avatar).toContain('frame-copper')
    expect(avatar).toContain('frame-silver')
    expect(avatar).toContain('frame-gold')
    expect(mine).toContain('`${TREASURE_REINFORCE_COST} 珠宝`')
    expect(mine).toContain('>增援</ActButton>')
    expect(mine).not.toContain('补位')
    expect(mine).toContain('即将来袭')
    expect(mine).not.toContain('已加固')
    expect(mine).toContain('加固中 剩')
    expect(mine).toContain('陷阱中 剩')
    expect(mine).toContain('`${TREASURE_FORTIFY_COST} 珠宝`')
    expect(mine).toContain('`${TREASURE_TRAP_COST} 珠宝`')
    expect(mine).toContain("icon=\"shield\"")
    expect(mine).toContain("icon=\"trap\"")
    expect(mine).toContain('class="row ward-row"')
    expect(mine).toContain('flex-wrap: nowrap')
    expect(app).toContain('treasureAssaultWarning')
    expect(app).not.toContain('bannerUpgradeReady')
    expect(app).not.toContain('banner-dot')
    expect(panel).not.toContain('treasureAssaultWarning')
    expect(panel).not.toContain('banner-dot')
    expect(mine).toContain('>抢夺</ActButton>')
    expect(mine).toContain('`${stakeOf(mine)} 砂金`')
    expect(mine).toContain('is-short')
    const tags = mine.slice(mine.indexOf('class="tags"'), mine.indexOf('</span>', mine.indexOf('class="tags"')))
    expect(tags).not.toContain('affix-chip')
    expect(tags).not.toContain('COMBAT_ATTR_LABEL')
    expect(tags).not.toContain('mine.weaknesses')
    expect(mine).toContain('class="weak"')
    expect(mine).toContain('<CombatAttrIcon')
    expect(mine).toContain('mineWeaknessSlots(mine)')
    expect(mine).toContain(':attr="slot"')
    expect(mine).not.toContain('affix-chip')
    expect(mine).toContain('消失倒计时 {{ clock(mine) }}')
    expect(mine).not.toContain('剩余 {{ clock(mine) }}')
  })
})
