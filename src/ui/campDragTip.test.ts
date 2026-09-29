import { describe, expect, it } from 'vitest'
import { CAMP_STATION_DRAG_TIP, campDragStationTip } from './campDragTip'

describe('camp drag station tip', () => {
  it('lets camp fusion through on every page and only tips station drags off the workshop', () => {
    expect(CAMP_STATION_DRAG_TIP).toBe('回工坊拖动')
    const mate = { kind: 'restWorker' as const, workerId: 'b' }
    const slot = { kind: 'slot' as const, stationId: 'herbalism' as const, slotIndex: 0 }
    const rest = { kind: 'rest' as const }
    expect(campDragStationTip(true, null)).toBe(false)
    expect(campDragStationTip(true, slot)).toBe(false)
    expect(campDragStationTip(true, mate)).toBe(false)
    expect(campDragStationTip(false, mate)).toBe(false)
    expect(campDragStationTip(false, rest)).toBe(false)
    expect(campDragStationTip(false, null)).toBe(true)
    expect(campDragStationTip(false, slot)).toBe(true)
  })
})
