import { describe, expect, it } from 'vitest'
import { STATION_DEF, STATION_IDS } from '../sim/tables'
import {
  isStationHelpOpen,
  nextStationHelp,
  STATION_HELP,
  stationHelpCopy,
  stationHelpIds,
} from './stationHelp'

describe('station help copy', () => {
  it('covers every playable station with a title and body', () => {
    expect(stationHelpIds()).toEqual(STATION_IDS)
    for (const id of STATION_IDS) {
      const copy = stationHelpCopy(id)
      expect(copy.title).toBe(STATION_DEF[id].label)
      expect(copy.body).toBe(STATION_HELP[id])
      expect(copy.body.length).toBeGreaterThan(12)
    }
  })

  it('mentions special output and check rules', () => {
    expect(STATION_HELP.mining).toMatch(/节点生命/)
    expect(STATION_HELP.mining).toMatch(/荒晶/)
    expect(STATION_HELP.inscription).toMatch(/软失败/)
    expect(STATION_HELP.inscription).toMatch(/符文/)
    expect(STATION_HELP.hunting).toMatch(/遇险/)
    expect(STATION_HELP.hunting).toMatch(/杂物/)
    expect(STATION_HELP.alchemy).toMatch(/随机/)
    expect(STATION_HELP.herbalism).toMatch(/必出/)
    expect(STATION_HELP.cooking).toMatch(/菜谱|熟食/)
  })

  it('toggles the same station closed and switches to another', () => {
    const first = nextStationHelp(null, 'mining')
    expect(first).toBe('mining')
    expect(nextStationHelp(first, 'mining')).toBeNull()
    expect(nextStationHelp(first, 'alchemy')).toBe('alchemy')
    expect(isStationHelpOpen(first, 'mining')).toBe(true)
    expect(isStationHelpOpen(first, 'hunting')).toBe(false)
  })
})
