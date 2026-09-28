import { describe, expect, it } from 'vitest'
import panel from './herbPvpPanel.vue?raw'
import { herbClashFeedText, HERB_FEED_LIMIT, pushHerbFeed, type HerbFeedLine } from './herbFeed'

function line(id: number, text: string, kind: HerbFeedLine['kind'] = 'self'): HerbFeedLine {
  return { id, kind, text }
}

describe('herb feed', () => {
  it('keeps the five newest and drops the oldest', () => {
    const incoming = Array.from({ length: 7 }, (_, index) => line(index + 1, `第${index + 1}条`))
    const feed = pushHerbFeed([], incoming)
    expect(HERB_FEED_LIMIT).toBe(5)
    expect(feed).toHaveLength(5)
    expect(feed.map((item) => item.text)).toEqual(['第7条', '第6条', '第5条', '第4条', '第3条'])

    const more = pushHerbFeed(feed, [line(8, '撞上甲，抢下这块地', 'clash')])
    expect(more).toHaveLength(5)
    expect(more[0]?.text).toBe('撞上甲，抢下这块地')
    expect(more.map((item) => item.text)).not.toContain('第3条')
  })

  it('does not grow the log from an empty batch, the same as offline catch-up', () => {
    const current = [line(1, '+草 ×2'), line(2, '甲 割走了', 'rival')]
    expect(pushHerbFeed(current, [])).toEqual(current)
    expect(herbClashFeedText({ rival: { name: '甲' }, result: 'took' })).toBe('撞上甲，抢下这块地')
    expect(herbClashFeedText({ rival: { name: '乙' }, result: 'lost' })).toBe('撞上乙，没打过')
    expect(herbClashFeedText({ rival: { name: '丙' }, result: 'held' })).toBe('撞上丙，还在除')
  })

  it('records live clears and clashes on the herb page, and discards the backlog on return', () => {
    expect(panel).toContain('pushHerbFeed')
    expect(panel).toContain('herbClearCaption')
    expect(panel).toContain('herbClashFeedText')
    expect(panel).toContain('class="herb-feed"')
    expect(panel).toContain('onMounted(() => {\n  discardHerbClearEvents()')
    expect(panel).toContain('discardHerbClashEvents()')
    const mountAt = panel.indexOf('onMounted(() => {')
    const watchAt = panel.indexOf('watch(() => game.save')
    expect(mountAt).toBeGreaterThan(-1)
    expect(watchAt).toBeGreaterThan(mountAt)
  })
})