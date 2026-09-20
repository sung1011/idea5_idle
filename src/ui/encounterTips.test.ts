import { afterEach, describe, expect, it, vi } from 'vitest'
import { pushFloatTip, useFloatTips } from './floatTips'
import {
  clearEncounterTips,
  combatTipKind,
  encounterTipList,
  formatCombatTip,
  pushCombatLogTip,
  pushEncounterTip,
} from './encounterTips'

describe('encounterTips', () => {
  afterEach(() => {
    vi.useRealTimers()
    clearEncounterTips()
    useFloatTips().tips.value = []
  })

  it('keeps combat tips on that encounter card and does not use global floatTips', () => {
    pushCombatLogTip('enc-a', '甲 对 试敌 造成 8（2400/2400）', 'ok')
    expect(encounterTipList('enc-a').map((tip) => tip.text)).toEqual(['甲 造成 8'])
    expect(encounterTipList('enc-b')).toEqual([])
    expect(useFloatTips().tips.value).toEqual([])
  })

  it('shortens hits and keeps weakness / outcome lines', () => {
    expect(formatCombatTip('甲 对 试敌 造成 8（2400/2400）')).toBe('甲 造成 8')
    expect(formatCombatTip('甲 对 试敌 造成 10（枪 暴击 ×1.2）（2390/2400）')).toBe('甲 造成 10（枪 暴击）')
    expect(formatCombatTip('甲 对 试敌 造成 15（枪 火 暴击 ×1.5）（2385/2400）')).toBe('甲 造成 15（枪 火 暴击）')
    expect(formatCombatTip('甲 对 试敌 造成 12（匕首 暴击 ×1.2）（2388/2400）')).toBe('甲 造成 12（匕首 暴击）')
    expect(formatCombatTip('甲 对 试敌 造成 10（弱点剑 ×1.2）（2390/2400）')).toBe('甲 造成 10（剑 暴击）')
    expect(formatCombatTip('甲 对 试敌 造成 15（弱点剑火 ×1.5）（2385/2400）')).toBe('甲 造成 15（剑 火 暴击）')
    expect(formatCombatTip('揭示弱点：剑、火')).toBe('揭示弱点：剑、火')
    expect(formatCombatTip('战斗胜利')).toBe('战斗胜利')
    expect(formatCombatTip('全员倒下，战败')).toBe('全员倒下，战败')
    expect(formatCombatTip('超时判败')).toBe('超时判败')
    expect(formatCombatTip('甲、乙 出战')).toBe('甲、乙 出战')
    expect(formatCombatTip('试敌 对 在岗乙 造成 2（工坊）（22/24）')).toBe('试敌 造成 2（工坊）')
  })

  it('pushes the crit float copy onto the encounter card', () => {
    pushCombatLogTip('enc-a', '甲 对 试敌 造成 15（枪 火 暴击 ×1.5）（2385/2400）', 'ok')
    expect(encounterTipList('enc-a').map((tip) => tip.text)).toEqual(['甲 造成 15（枪 火 暴击）'])
  })

  it('marks lose lines as err and the rest as ok', () => {
    expect(combatTipKind('全员倒下，战败')).toBe('err')
    expect(combatTipKind('超时判败')).toBe('err')
    expect(combatTipKind('战斗胜利')).toBe('ok')
    expect(combatTipKind('揭示弱点：剑')).toBe('ok')
    expect(combatTipKind('甲 对 试敌 造成 8（2400/2400）')).toBe('ok')
  })

  it('drops encounter tips after the fade and still leaves global intercepts alone', () => {
    vi.useFakeTimers()
    pushEncounterTip('enc-a', '甲 造成 8', 'ok')
    pushFloatTip('货不够：熟食', 'err')
    expect(encounterTipList('enc-a')).toHaveLength(1)
    expect(useFloatTips().tips.value.map((tip) => tip.text)).toEqual(['货不够：熟食'])
    vi.advanceTimersByTime(1400)
    expect(encounterTipList('enc-a')).toEqual([])
    expect(useFloatTips().tips.value).toEqual([])
  })

  it('ignores blank encounter text', () => {
    pushEncounterTip('enc-a', '   ')
    pushCombatLogTip('enc-b', '   ')
    expect(encounterTipList('enc-a')).toEqual([])
    expect(encounterTipList('enc-b')).toEqual([])
  })
})
