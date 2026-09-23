import { describe, expect, it } from 'vitest'
import { pickSlotNumber } from './pickSlot'

describe('pickSlotNumber', () => {
  it('numbers a fresh party by click order and renumbers after a cancel', () => {
    const picked = ['a', 'b', 'c']
    expect(pickSlotNumber(picked, 'a')).toBe(1)
    expect(pickSlotNumber(picked, 'b')).toBe(2)
    expect(pickSlotNumber(picked, 'c')).toBe(3)
    expect(pickSlotNumber(picked, 'missing')).toBeNull()

    const left = picked.filter((id) => id !== 'a')
    expect(pickSlotNumber(left, 'b')).toBe(1)
    expect(pickSlotNumber(left, 'c')).toBe(2)
  })

  it('starts reinforcements at the next open slot', () => {
    expect(pickSlotNumber(['c'], 'c', 2)).toBe(3)
    expect(pickSlotNumber(['c', 'd'], 'd', 2)).toBe(4)
    expect(pickSlotNumber(['c'], 'c', 0)).toBe(1)
  })
})
