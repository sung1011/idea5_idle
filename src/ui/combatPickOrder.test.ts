import { describe, expect, it } from 'vitest'
import { isPickRecommendMark, orderPickByRecommend } from './combatPickOrder'

const workers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

describe('orderPickByRecommend', () => {
  it('puts 推荐 and 强烈推荐 first while keeping each group in the original order', () => {
    const labels: Record<string, string | null> = {
      a: null,
      b: '推荐',
      c: '强烈推荐',
      d: null,
    }
    expect(orderPickByRecommend(workers, (worker) => labels[worker.id] ?? null).map((worker) => worker.id)).toEqual([
      'b',
      'c',
      'a',
      'd',
    ])
  })

  it('leaves the list unchanged when nobody is recommended', () => {
    expect(orderPickByRecommend(workers, () => null).map((worker) => worker.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(orderPickByRecommend([], () => '推荐')).toEqual([])
  })

  it('does not treat 克制 as a recommend mark', () => {
    const labels: Record<string, string | null> = {
      a: '克制',
      b: null,
      c: '推荐',
      d: '克制',
    }
    expect(isPickRecommendMark('推荐')).toBe(true)
    expect(isPickRecommendMark('强烈推荐')).toBe(true)
    expect(isPickRecommendMark('克制')).toBe(false)
    expect(isPickRecommendMark(null)).toBe(false)
    expect(orderPickByRecommend(workers, (worker) => labels[worker.id] ?? null).map((worker) => worker.id)).toEqual([
      'c',
      'a',
      'b',
      'd',
    ])
  })
})
