import { describe, expect, it } from 'vitest'
import {
  hasWorkshopLayoutQuery,
  workshopLayoutFromSearch,
  workshopLayoutSearch,
  workshopShotFromSearch,
} from './workshopLayoutDemo'

describe('workshop layout demo query', () => {
  it('keeps the current workshop unless the query is a, b, or c', () => {
    expect(workshopLayoutFromSearch('')).toBe('current')
    expect(workshopLayoutFromSearch('?workshopDemo=a')).toBe('a')
    expect(workshopLayoutFromSearch('?workshopDemo=b')).toBe('b')
    expect(workshopLayoutFromSearch('?workshopDemo=c')).toBe('c')
    expect(workshopLayoutFromSearch('?workshopDemo=current')).toBe('current')
    expect(workshopLayoutFromSearch('?workshopDemo=z')).toBe('current')
  })

  it('rewrites only the preview query', () => {
    expect(workshopLayoutSearch('a', '')).toBe('?workshopDemo=a')
    expect(workshopLayoutSearch('b', '?workshopShot=1')).toBe('?workshopShot=1&workshopDemo=b')
    expect(workshopLayoutSearch('current', '?workshopDemo=a&workshopShot=1')).toBe('?workshopShot=1')
    expect(hasWorkshopLayoutQuery('?workshopDemo=a')).toBe(true)
    expect(hasWorkshopLayoutQuery('')).toBe(false)
    expect(workshopShotFromSearch('?workshopShot=1')).toBe(true)
    expect(workshopShotFromSearch('?workshopDemo=c')).toBe(false)
  })
})
