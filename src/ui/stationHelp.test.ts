import { describe, expect, it } from 'vitest'
import { STATION_DEF, STATION_IDS } from '../sim/tables'
import type { StationId } from '../sim/types'
import {
  isStationHelpOpen,
  nextStationHelp,
  STATION_HELP,
  STATION_HP_HELP,
  stationHelpCopy,
  stationHelpIds,
} from './stationHelp'

function joined(id: StationId): string {
  const help = STATION_HELP[id]
  return [help.play, help.output, help.cost, help.note ?? ''].join('')
}

describe('station help copy', () => {
  it('covers every playable station with layered fields', () => {
    expect(stationHelpIds()).toEqual(STATION_IDS)
    for (const id of STATION_IDS) {
      const copy = stationHelpCopy(id)
      const help = STATION_HELP[id]
      const labels = copy.rows.map((row) => row.label)
      expect(copy.title).toBe(STATION_DEF[id].label)
      expect(labels[0]).toBe('名称')
      expect(labels.at(-1)).toBe('体力')
      expect(labels).toEqual(
        help.note
          ? ['名称', '怎么玩', '产出', '消耗', '注意', '体力']
          : ['名称', '怎么玩', '产出', '消耗', '体力'],
      )
      expect(copy.rows[0]?.text).toBe(STATION_DEF[id].label)
      expect(copy.rows.find((row) => row.label === '怎么玩')?.text).toBe(help.play)
      expect(copy.rows.find((row) => row.label === '产出')?.text).toBe(help.output)
      expect(copy.rows.find((row) => row.label === '消耗')?.text).toBe(help.cost)
      expect(copy.rows.find((row) => row.label === '注意')?.text).toBe(help.note)
      expect(copy.rows.find((row) => row.label === '体力')?.text).toBe(STATION_HP_HELP)
      expect(help.play.length).toBeGreaterThan(0)
      expect(help.output.length).toBeGreaterThan(0)
      expect(help.cost.length).toBeGreaterThan(0)
    }
  })

  it('keeps the shared on-duty hp wording', () => {
    expect(STATION_HP_HELP).toContain('在岗体力影响效率')
    expect(STATION_HP_HELP).toContain('正常 100%')
    expect(STATION_HP_HELP).toContain('残血 80%')
    expect(STATION_HP_HELP).toContain('空血 50%')
    expect(STATION_HP_HELP).toContain('伙食')
    expect(STATION_HP_HELP).toContain('药剂')
  })

  it('mentions special output and check rules without changing numbers', () => {
    expect(STATION_HELP.mining.note).toMatch(/节点生命/)
    expect(STATION_HELP.mining.note).toMatch(/扣 1 点/)
    expect(STATION_HELP.mining.output).toMatch(/荒晶/)
    expect(STATION_HELP.mining.cost).toBe('无额外原料')
    expect(STATION_HELP.inscription.note).toMatch(/软失败/)
    expect(STATION_HELP.inscription.play).toMatch(/符文/)
    expect(STATION_HELP.inscription.output).toMatch(/1 槽/)
    expect(STATION_HELP.hunting.note).toMatch(/遇险/)
    expect(STATION_HELP.hunting.note).toMatch(/1 份/)
    expect(STATION_HELP.hunting.output).toMatch(/杂物/)
    expect(STATION_HELP.hunting.cost).toBe('无额外原料')
    expect(STATION_HELP.alchemy.play).toMatch(/随机/)
    expect(STATION_HELP.alchemy.play).toMatch(/7 种/)
    expect(STATION_HELP.alchemy.output).toMatch(/4 槽/)
    expect(STATION_HELP.alchemy.note).toBeUndefined()
    expect(STATION_HELP.herbalism.play).toMatch(/必出/)
    expect(STATION_HELP.herbalism.cost).toBe('无额外原料')
    expect(STATION_HELP.herbalism.note).toMatch(/无挖空/)
    expect(joined('cooking')).toMatch(/菜谱/)
    expect(joined('cooking')).toMatch(/熟食/)
    expect(STATION_HELP.cooking.cost).toMatch(/Lv5/)
    expect(STATION_HELP.cooking.note).toBeUndefined()
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
