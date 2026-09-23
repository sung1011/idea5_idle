import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import { spawnWorker } from '../sim/recruit'
import { startTreasureRaid, stepTreasureMines } from '../sim/treasureMine'
import type { TreasureMine } from '../sim/types'

function ensureGarrison(mine: TreasureMine): TreasureMine {
  if (mine.shadows.length > 0) {
    if (mine.owner !== 'player') mine.owner = 'shadow'
    return mine
  }
  mine.owner = 'shadow'
  mine.shadows = [
    {
      id: `${mine.id}-shadow-0`,
      name: '青石',
      level: 1,
      hp: 30,
      hpMax: 30,
      atk: 4,
      spd: 5,
      runeId: 'runeSharp',
    },
  ]
  return mine
}
import { actChargeFill } from './actCharge'
import { hpBarFill } from './hpBar'
import panel from './treasureMinePanel.vue?raw'
import { raidActChargeFill, raidSlotPress, slotStates, squadBarHp, treasureRaidHud } from './treasureRaidHud'

describe('treasure raid hud', () => {
  it('feeds the battlefield hp bar and act charge from the current 1v1', () => {
    const spd = 5
    const elapsed = 20
    const next = elapsed + spd
    expect(raidActChargeFill(spd, next, elapsed)).toBe(actChargeFill(spd, next * 1000, elapsed * 1000))
    expect(raidActChargeFill(spd, next, elapsed + 2.5)).toBeCloseTo(0.5)
    expect(raidActChargeFill(spd, next, next)).toBe(1)

    const save = createSave()
    const lead = spawnWorker(save)
    const bench = spawnWorker(save)
    lead.name = '甲攻'
    bench.name = '乙等'
    const mine = ensureGarrison(save.treasureMines.mines[0])
    mine.shadows = [
      { ...mine.shadows[0], name: '青石' },
      { ...mine.shadows[0], id: `${mine.id}-wait`, name: '晚风' },
    ]
    expect(startTreasureRaid(save, mine.id, [lead.id, bench.id]).ok).toBe(true)
    const raid = mine.raid
    expect(raid).toBeTruthy()
    if (!raid) return
    raid.atkHp = 12
    raid.atkMax = 24
    raid.atkSpd = spd
    raid.atkNext = next
    raid.defHp = 8
    raid.defSpd = 4
    raid.defNext = elapsed + 4
    mine.shadows[0].hp = 8
    mine.shadows[0].hpMax = 16

    const hud = treasureRaidHud(mine, save.workers, elapsed)
    const atkHp = 12 + raid.attackSlotHp[1]
    const atkMax = raid.attackSlotMax[0] + raid.attackSlotMax[1]
    const defHp = 8 + mine.shadows[1].hp
    const defMax = raid.defendSlotMax[0] + raid.defendSlotMax[1]
    expect(hud?.attack?.hp).toBe(atkHp)
    expect(hud?.attack?.hpMax).toBe(atkMax)
    expect(hud?.attack?.barFill).toBe(hpBarFill(atkHp, atkMax))
    expect(hud?.attack?.fill).toBe(raidActChargeFill(spd, next, elapsed))
    expect(hud?.defend.hp).toBe(defHp)
    expect(hud?.defend.hpMax).toBe(defMax)
    expect(hud?.defend.barFill).toBe(hpBarFill(defHp, defMax))
    expect(hud?.defend.fill).toBe(raidActChargeFill(4, elapsed + 4, elapsed))
    expect(hud?.attack?.name).toBe('见习勇者 · 甲攻')
    expect(hud?.waitingAttack).toEqual(['乙等'])
    expect(hud?.waitingDefend).toEqual(['晚风'])
    expect(hud?.attack?.slots).toEqual(['filled', 'filled', 'empty'])
    expect(hud?.defend.slots).toEqual(['filled', 'filled', 'empty'])
  })

  it('keeps the opening slots and marks the dead without filling empty ones', () => {
    const save = createSave()
    const lead = spawnWorker(save)
    const bench = spawnWorker(save)
    const mine = ensureGarrison(save.treasureMines.mines[0])
    const first = { ...mine.shadows[0], id: `${mine.id}-s0`, name: '青石', hp: 1, hpMax: 20, atk: 1, spd: 30 }
    const second = { ...mine.shadows[0], id: `${mine.id}-s1`, name: '晚风', hp: 40, hpMax: 40, atk: 1, spd: 30 }
    mine.shadows = [first, second]
    expect(startTreasureRaid(save, mine.id, [lead.id, bench.id]).ok).toBe(true)
    const raid = mine.raid
    expect(raid).toBeTruthy()
    if (!raid) return
    expect(raid.attackSlots).toEqual([lead.id, bench.id, null])
    expect(raid.defendSlots).toEqual([first.id, second.id, null])
    const atkMax = raid.attackSlotMax.reduce((sum, n) => sum + n, 0)
    const defMax = raid.defendSlotMax.reduce((sum, n) => sum + n, 0)
    const atkBefore = treasureRaidHud(mine, save.workers, save.elapsedS)?.attack?.hp ?? 0
    expect(slotStates(raid.attackSlots, raid.queue)).toEqual(['filled', 'filled', 'empty'])
    expect(slotStates([null, null, null], [])).toEqual(['empty', 'empty', 'empty'])

    raid.atkHp = 1
    raid.atkNext = save.elapsedS + 100
    raid.defAtk = 999
    raid.defNext = save.elapsedS + 1
    save.elapsedS += 1
    stepTreasureMines(save)
    expect(mine.raid?.attackSlots).toEqual([lead.id, bench.id, null])
    const afterLead = treasureRaidHud(mine, save.workers, save.elapsedS)
    expect(afterLead?.attack?.slots).toEqual(['dead', 'filled', 'empty'])
    expect(afterLead?.attack?.hpMax).toBe(atkMax)
    expect(afterLead?.attack?.hp).toBeLessThan(atkBefore)
    expect(afterLead?.attack?.hp).toBe(mine.raid?.atkHp)

    const live = mine.raid
    expect(live).toBeTruthy()
    if (!live) return
    live.atkAtk = 999
    live.atkNext = save.elapsedS + 1
    live.defNext = save.elapsedS + 100
    if (mine.shadows[0]) mine.shadows[0].hp = 1
    save.elapsedS += 1
    stepTreasureMines(save)
    expect(mine.raid?.defendSlots).toEqual([first.id, second.id, null])
    const afterShadow = treasureRaidHud(mine, save.workers, save.elapsedS)
    expect(afterShadow?.defend.slots).toEqual(['dead', 'filled', 'empty'])
    expect(afterShadow?.defend.hpMax).toBe(defMax)
    expect(afterShadow?.defend.hp).toBe(mine.shadows[0]?.hp)
  })

  it('sums the opening squad and ignores empty slots', () => {
    expect(squadBarHp(['a', 'b', 'c'], [10, 20, 30], (id) => (id === 'a' ? 4 : id === 'b' ? 20 : 30))).toEqual({
      hp: 54,
      hpMax: 60,
    })
    expect(squadBarHp(['a', 'b', 'c'], [10, 20, 30], (id) => (id === 'a' ? null : id === 'b' ? 20 : 30))).toEqual({
      hp: 50,
      hpMax: 60,
    })
    expect(squadBarHp(['a', null, null], [15, 0, 0], () => 9)).toEqual({ hp: 9, hpMax: 15 })

    const save = createSave()
    const first = spawnWorker(save)
    const second = spawnWorker(save)
    const third = spawnWorker(save)
    const mine = ensureGarrison(save.treasureMines.mines[0])
    mine.shadows = [0, 1, 2].map((i) => ({
      ...mine.shadows[0],
      id: `${mine.id}-s${i}`,
      name: `客${i}`,
      hp: (i + 1) * 10,
      hpMax: (i + 1) * 10,
    }))
    expect(startTreasureRaid(save, mine.id, [first.id, second.id, third.id]).ok).toBe(true)
    const raid = mine.raid
    expect(raid).toBeTruthy()
    if (!raid) return
    raid.attackSlotHp = [10, 20, 30]
    raid.attackSlotMax = [10, 20, 30]
    raid.atkHp = 4
    raid.defendSlotHp = [10, 20, 30]
    raid.defendSlotMax = [10, 20, 30]
    raid.defHp = 6
    const full = treasureRaidHud(mine, save.workers, save.elapsedS)
    expect(full?.attack?.hp).toBe(54)
    expect(full?.attack?.hpMax).toBe(60)
    expect(full?.defend.hp).toBe(6 + 20 + 30)
    expect(full?.defend.hpMax).toBe(60)
    expect(full?.attack?.name).toBe(`见习勇者 · ${first.name}`)
    expect(treasureRaidHud(mine, save.workers, save.elapsedS, '旅人甲')?.attack?.name).toBe(`旅人甲 · ${first.name}`)
    expect(treasureRaidHud(mine, save.workers, save.elapsedS, '  ')?.attack?.name).toBe(`见习勇者 · ${first.name}`)
    expect(full?.attack?.fill).toBe(raidActChargeFill(raid.atkSpd, raid.atkNext, save.elapsedS))

    raid.queue = [second.id, third.id]
    raid.atkHp = 20
    const hurt = treasureRaidHud(mine, save.workers, save.elapsedS)
    expect(hurt?.attack?.hp).toBe(50)
    expect(hurt?.attack?.hpMax).toBe(60)
    expect(hurt?.attack?.slots).toEqual(['dead', 'filled', 'filled'])

    const solo = createSave()
    const only = spawnWorker(solo)
    const hole = ensureGarrison(solo.treasureMines.mines[0])
    hole.shadows = hole.shadows.slice(0, 1)
    expect(startTreasureRaid(solo, hole.id, [only.id]).ok).toBe(true)
    const one = treasureRaidHud(hole, solo.workers, solo.elapsedS)
    expect(hole.raid?.attackSlotMax.slice(1)).toEqual([0, 0])
    expect(hole.raid?.defendSlotMax.slice(1)).toEqual([0, 0])
    expect(one?.attack?.hp).toBe(hole.raid?.atkHp)
    expect(one?.attack?.hpMax).toBe(hole.raid?.attackSlotMax[0])
    expect(one?.defend.hpMax).toBe(hole.raid?.defendSlotMax[0])
    expect(one?.attack?.slots).toEqual(['filled', 'empty', 'empty'])
  })

  it('shows only the defender hud before a raid and both sides after it starts', () => {
    const save = createSave()
    const mine = ensureGarrison(save.treasureMines.mines[0])
    mine.shadows = [
      { ...mine.shadows[0], id: `${mine.id}-a`, name: '甲守', hp: 10, hpMax: 10 },
      { ...mine.shadows[0], id: `${mine.id}-b`, name: '乙守', hp: 20, hpMax: 20 },
    ]
    const idle = treasureRaidHud(mine, save.workers, save.elapsedS)
    expect(idle?.fighting).toBe(false)
    expect(idle?.attack).toBeNull()
    expect(idle?.defend.name).toBe('甲守')
    expect(idle?.defend.hp).toBe(30)
    expect(idle?.defend.hpMax).toBe(30)
    expect(idle?.defend.fill).toBe(0)
    expect(idle?.defend.slots).toEqual(['filled', 'filled', 'empty'])
    expect(idle?.waitingDefend).toEqual(['乙守'])

    mine.owner = 'player'
    expect(treasureRaidHud(mine, save.workers, save.elapsedS)).toBeNull()
    mine.owner = 'empty'
    expect(treasureRaidHud(mine, save.workers, save.elapsedS)).toBeNull()
    mine.owner = 'shadow'

    const lead = spawnWorker(save)
    expect(startTreasureRaid(save, mine.id, [lead.id]).ok).toBe(true)
    const live = treasureRaidHud(mine, save.workers, save.elapsedS)
    expect(live?.fighting).toBe(true)
    expect(live?.attack).toBeTruthy()
    expect(live?.defend.slots[0]).toBe('filled')
  })

  it('mounts the shared hp and act bars only on the raid readout', () => {
    expect(panel).toContain('<HpBar')
    expect(panel).toContain('<ActChargeBar')
    expect(panel).toContain('v-if="hud.attack"')
    expect(panel).toContain('game.save.playerName')
    expect(panel).toContain('快照驻守')
    expect(panel).toContain('无人矿')
    expect(panel).toContain('claimTreasureMine')
    expect(panel).toContain('abandonTreasureMine')
    expect(panel).not.toContain('补采')
    expect(panel).not.toContain('也不是 NPC')
    expect(panel).not.toContain('开采不装符文')
    expect(panel).not.toContain('联机实时')
    expect(panel).toContain('TREASURE_KIND_LABEL[mine.kind]')
    expect(panel).not.toContain('class="kind">矿洞')
    expect(panel).toContain('aria-label="开采进度"')
    expect(panel).toContain('visualStationProgress')
    expect(panel).toContain('mineDigSpeedLabel')
    expect(panel).not.toContain('影子驻守')
    expect(panel).not.toContain('本洞不能再开，也不能增援')
    expect(panel).not.toContain('守军等待')
    expect(panel).not.toContain('守军 {{ mine.shadows')
    expect(panel).toContain('hud.defend.name')
    expect(panel).toContain('开采 {{ names(mine.crewIds) }}')
    expect(panel).not.toContain('等待 {{')
    expect(panel).toContain('hud.attack.hp')
    expect(panel).toContain('hud.attack.fill')
    expect(panel).toContain('variant="enemy"')
    expect(panel).toContain('onRaidSlot(mine, \'defend\', index)')
    expect(panel).toContain('onRaidSlot(mine, \'attack\', index)')
    expect(panel).toContain('<ModeHelpSheet')
    const bars = panel.slice(panel.indexOf('<div class="bars">'), panel.indexOf('class="row"'))
    expect(bars.indexOf('hud.defend.name')).toBeLessThan(bars.indexOf('v-if="hud.attack"'))
    expect(bars.indexOf('aria-label="守方槽位"')).toBeLessThan(bars.indexOf('aria-label="攻方槽位"'))
    const defend = bars.slice(bars.indexOf('hud.defend.name'), bars.indexOf('v-if="hud.attack"'))
    expect(defend.indexOf('variant="enemy"')).toBeLessThan(defend.indexOf('aria-label="守方槽位"'))
    expect(defend.indexOf('aria-label="守方槽位"')).toBeLessThan(defend.indexOf('<ActChargeBar enemy'))
    expect(bars).toContain('hud.attack.slots')
    expect(panel).toContain('hud.defend.slots')
    expect(panel.indexOf('raidHuds(mine)')).toBeLessThan(panel.indexOf('class="raid-slots"'))
    expect(panel.indexOf('class="raid-slots"')).toBeLessThan(panel.indexOf("openPick('raid'"))
    const slot = panel.slice(panel.indexOf('.raid-slot {'), panel.indexOf('.raid-slot.filled'))
    expect(slot).toMatch(/width:\s*18px/)
    expect(slot).toMatch(/height:\s*18px/)
    expect(panel).toContain('.raid-slot.filled')
    expect(panel).toContain('.raid-slot.empty')
    expect(panel).toContain('.raid-slot.dead')
    expect(panel).toContain('<button')
    expect(panel).not.toContain('<span\n                v-for="(mark, index) in hud.defend.slots"')
  })

  it('opens a sheet for a filled slot and tips empty or dead ones', () => {
    const save = createSave()
    const lead = spawnWorker(save)
    const bench = spawnWorker(save)
    lead.name = '甲攻'
    const mine = ensureGarrison(save.treasureMines.mines[0])
    mine.shadows = [
      { ...mine.shadows[0], id: `${mine.id}-a`, name: '青石', hp: 9, hpMax: 18, atk: 4, spd: 6, level: 2 },
      { ...mine.shadows[0], id: `${mine.id}-b`, name: '晚风', hp: 7, hpMax: 11, atk: 3, spd: 5, level: 1 },
    ]
    const idle = raidSlotPress(mine, save.workers, 'defend', 0, save)
    expect(idle.kind).toBe('sheet')
    if (idle.kind === 'sheet') {
      expect(idle.sheet.title).toBe('青石')
      expect(idle.sheet.rows.find((row) => row.label === '生命')?.text).toBe('9/18')
      expect(idle.sheet.rows.find((row) => row.label === '攻击')?.text).toBe('4')
    }
    expect(raidSlotPress(mine, save.workers, 'defend', 2, save)).toEqual({ kind: 'tip', text: '空槽' })
    expect(raidSlotPress(mine, save.workers, 'attack', 0, save)).toEqual({ kind: 'tip', text: '空槽' })

    expect(startTreasureRaid(save, mine.id, [lead.id, bench.id]).ok).toBe(true)
    const raid = mine.raid
    expect(raid).toBeTruthy()
    if (!raid) return
    const filled = raidSlotPress(mine, save.workers, 'attack', 0, save)
    expect(filled.kind).toBe('sheet')
    if (filled.kind === 'sheet') {
      expect(filled.sheet.title).toBe('甲攻')
      expect(filled.sheet.rows.find((row) => row.label === '职业')?.text).not.toBe('')
      expect(filled.sheet.rows.find((row) => row.label === '品质')?.text).toBe('白')
      expect(filled.sheet.rows.find((row) => row.label === '生命')?.text).toContain(`${raid.atkHp}/`)
    }
    expect(raidSlotPress(mine, save.workers, 'attack', 2, save)).toEqual({ kind: 'tip', text: '空槽' })
    raid.queue = [bench.id]
    expect(raidSlotPress(mine, save.workers, 'attack', 0, save)).toEqual({ kind: 'tip', text: '已阵亡' })
    const waiting = raidSlotPress(mine, save.workers, 'defend', 1, save)
    expect(waiting.kind).toBe('sheet')
    if (waiting.kind === 'sheet') expect(waiting.sheet.title).toBe('晚风')
  })
})
