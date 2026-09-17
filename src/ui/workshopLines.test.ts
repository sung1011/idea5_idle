import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSHOP_LINE,
  WORKSHOP_LINE_KEY,
  WORKSHOP_LINES,
  isWorkshopLineId,
  loadWorkshopLine,
  saveWorkshopLine,
  workshopLineOf,
  workshopLineTitle,
} from './workshopLines'

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

describe('workshopLines', () => {
  it('lists four production lines with the confirmed station groups', () => {
    expect(WORKSHOP_LINES.map((line) => [line.id, line.label, [...line.stationIds]])).toEqual([
      ['smelt', '矿冶', ['mining', 'forging']],
      ['hunt', '狩猎', ['hunting', 'cooking']],
      ['brew', '药炼', ['herbalism', 'alchemy']],
      ['fish', '钓鱼', ['fishing']],
    ])
    expect(workshopLineTitle(WORKSHOP_LINES[0])).toBe('采矿 → 锻造')
    expect(workshopLineTitle(WORKSHOP_LINES[3])).toBe('钓鱼')
  })

  it('resolves unknown ids to the first line', () => {
    expect(isWorkshopLineId('smelt')).toBe(true)
    expect(isWorkshopLineId('woodcutting')).toBe(false)
    expect(workshopLineOf('nope').id).toBe(DEFAULT_WORKSHOP_LINE)
  })

  it('persists the active line in UI storage only', () => {
    const store = memory()
    expect(loadWorkshopLine(store)).toBe('smelt')
    expect(saveWorkshopLine('brew', store)).toBe('brew')
    expect(store.getItem(WORKSHOP_LINE_KEY)).toBe('brew')
    expect(loadWorkshopLine(store)).toBe('brew')
    expect(saveWorkshopLine('bad', store)).toBe('smelt')
    expect(loadWorkshopLine(store)).toBe('smelt')
  })
})
