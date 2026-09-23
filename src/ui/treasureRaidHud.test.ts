import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import { spawnWorker } from '../sim/recruit'
import { startTreasureRaid, stepTreasureMines } from '../sim/treasureMine'
import { actChargeFill } from './actCharge'
import { hpBarFill } from './hpBar'
import panel from './treasureMinePanel.vue?raw'
import { raidActChargeFill, slotStates, treasureRaidHud } from './treasureRaidHud'

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
    const mine = save.treasureMines.mines[0]
    mine.shadows = [
      { ...mine.shadows[0], name: '影矿卫' },
      { ...mine.shadows[0], id: `${mine.id}-wait`, name: '影掘手' },
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
    expect(hud?.attack.hp).toBe(12)
    expect(hud?.attack.hpMax).toBe(24)
    expect(hud?.attack.barFill).toBe(hpBarFill(12, 24))
    expect(hud?.attack.fill).toBe(raidActChargeFill(spd, next, elapsed))
    expect(hud?.defend.hp).toBe(8)
    expect(hud?.defend.barFill).toBe(hpBarFill(8, 16))
    expect(hud?.defend.fill).toBe(raidActChargeFill(4, elapsed + 4, elapsed))
    expect(hud?.attack.name).toBe('甲攻')
    expect(hud?.waitingAttack).toEqual(['乙等'])
    expect(hud?.waitingDefend).toEqual(['影掘手'])
    expect(hud?.attack.slots).toEqual(['filled', 'filled', 'empty'])
    expect(hud?.defend.slots).toEqual(['filled', 'filled', 'empty'])
  })

  it('keeps the opening slots and marks the dead without filling empty ones', () => {
    const save = createSave()
    const lead = spawnWorker(save)
    const bench = spawnWorker(save)
    const mine = save.treasureMines.mines[0]
    const first = { ...mine.shadows[0], id: `${mine.id}-s0`, name: '影矿卫', hp: 1, hpMax: 20, atk: 1, spd: 30 }
    const second = { ...mine.shadows[0], id: `${mine.id}-s1`, name: '影掘手', hp: 40, hpMax: 40, atk: 1, spd: 30 }
    mine.shadows = [first, second]
    expect(startTreasureRaid(save, mine.id, [lead.id, bench.id]).ok).toBe(true)
    const raid = mine.raid
    expect(raid).toBeTruthy()
    if (!raid) return
    expect(raid.attackSlots).toEqual([lead.id, bench.id, null])
    expect(raid.defendSlots).toEqual([first.id, second.id, null])
    expect(slotStates(raid.attackSlots, raid.queue)).toEqual(['filled', 'filled', 'empty'])
    expect(slotStates([null, null, null], [])).toEqual(['empty', 'empty', 'empty'])

    raid.atkHp = 1
    raid.atkNext = save.elapsedS + 100
    raid.defAtk = 999
    raid.defNext = save.elapsedS + 1
    save.elapsedS += 1
    stepTreasureMines(save)
    expect(mine.raid?.attackSlots).toEqual([lead.id, bench.id, null])
    expect(treasureRaidHud(mine, save.workers, save.elapsedS)?.attack.slots).toEqual(['dead', 'filled', 'empty'])

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
    expect(treasureRaidHud(mine, save.workers, save.elapsedS)?.defend.slots).toEqual(['dead', 'filled', 'empty'])
  })

  it('mounts the shared hp and act bars only on the raid readout', () => {
    expect(panel).toContain('<HpBar')
    expect(panel).toContain('<ActChargeBar')
    expect(panel).toContain('hud.attack.hp')
    expect(panel).toContain('hud.attack.fill')
    expect(panel).toContain('variant="enemy"')
    expect(panel).toContain('waitingAttack')
    expect(panel).toContain('waitingDefend')
    const attack = panel.slice(panel.indexOf('hud.attack.name'), panel.indexOf('hud.defend.name'))
    expect(attack.indexOf('<HpBar')).toBeLessThan(attack.indexOf('class="raid-slots"'))
    expect(attack.indexOf('class="raid-slots"')).toBeLessThan(attack.indexOf('<ActChargeBar'))
    expect(attack).toContain('hud.attack.slots')
    expect(panel).toContain('hud.defend.slots')
    expect(panel.indexOf('raidHuds(mine)')).toBeLessThan(panel.indexOf('class="raid-slots"'))
    expect(panel.indexOf('class="raid-slots"')).toBeLessThan(panel.indexOf("openPick('raid'"))
    const slot = panel.slice(panel.indexOf('.raid-slot {'), panel.indexOf('.raid-slot.filled'))
    expect(slot).toMatch(/width:\s*18px/)
    expect(slot).toMatch(/height:\s*18px/)
    expect(panel).toContain('.raid-slot.filled')
    expect(panel).toContain('.raid-slot.empty')
    expect(panel).toContain('.raid-slot.dead')
  })
})
