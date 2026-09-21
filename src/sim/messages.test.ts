import { describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { createSave } from './createSave'
import { hasUnread, listedMessages, markAllRead, MESSAGE_CAP, pushMessage, unreadCount } from './messages'
import { settleOffline } from './offline'
import { recruitWorker } from './recruit'

describe('messages', () => {
  it('creates an unread offline-earnings message after settle with output', () => {
    const save = createSave()
    save.diamonds = 15
    expect(recruitWorker(save).ok).toBe(true)
    assignWorker(save, save.workers[0].id, 'mining')
    save.lastTick = 0
    const result = settleOffline(save, 80_000)
    expect(hasUnread(result.save)).toBe(true)
    expect(unreadCount(result.save)).toBe(1)
    const first = listedMessages(result.save)[0]
    expect(first.title).toBe('离线收益')
    expect(first.read).toBe(false)
    expect(first.body).toContain('离线 1 分钟 20 秒')
    expect(first.body).toContain('铜矿 +4')
  })

  it('clears the unread flag after markAllRead', () => {
    const save = createSave()
    save.diamonds = 15
    expect(recruitWorker(save).ok).toBe(true)
    assignWorker(save, save.workers[0].id, 'mining')
    save.lastTick = 0
    const result = settleOffline(save, 20_000)
    expect(hasUnread(result.save)).toBe(true)
    expect(markAllRead(result.save).ok).toBe(true)
    expect(hasUnread(result.save)).toBe(false)
    expect(unreadCount(result.save)).toBe(0)
    expect(result.save.messages.every((m) => m.read)).toBe(true)
  })

  it('lists newest messages first', () => {
    const save = createSave()
    pushMessage(save, { title: '旧', body: 'a', createdAt: 100 })
    pushMessage(save, { title: '新', body: 'b', createdAt: 300 })
    pushMessage(save, { title: '中', body: 'c', createdAt: 200 })
    const listed = listedMessages(save)
    expect(listed.map((m) => m.title)).toEqual(['新', '中', '旧'])
  })

  it('drops the oldest when over the cap', () => {
    const save = createSave()
    for (let i = 0; i < MESSAGE_CAP + 3; i++) {
      pushMessage(save, { title: `n${i}`, body: 'x', createdAt: i + 1 })
    }
    expect(save.messages).toHaveLength(MESSAGE_CAP)
    expect(listedMessages(save)[0].title).toBe(`n${MESSAGE_CAP + 2}`)
    expect(save.messages.some((m) => m.title === 'n0')).toBe(false)
  })

  it('does not write a message when already caught up', () => {
    const save = createSave()
    const result = settleOffline(save, save.lastTick)
    expect(result.save.messages).toEqual([])
    expect(hasUnread(result.save)).toBe(false)
  })
})
