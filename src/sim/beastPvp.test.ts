import { afterEach, describe, expect, it } from 'vitest'
import { itemQty } from './bank'
import {
  beastAttackPower,
  beastBoundaryHp,
  beastDodge,
  beastHpMax,
  beastInterrupt,
  beastRankReward,
  finishBeastFightAuto,
  gmBeastJumpToLine,
  setBeastRollOverride,
  startBeastFight,
  stepBeastPvp,
  strikeBeast,
} from './beastPvp'
import { craftBeastFeast, craftBeastOil, craftBoneSoup, craftHunterSkewer, breakthroughStation } from './beastCraft'
import { fillWorkerHp } from './combat'
import { createSave } from './createSave'
import { settleOffline } from './offline'
import { spawnWorkerWith } from './recruit'
import { grantStationLevel } from './stationProgress'
import { xpToNextLevel } from './tables'
import { hydrateLoadedSave } from '../ui/saveGame'
import type { BeastKind, Save } from './types'

afterEach(() => setBeastRollOverride(null))

function quietRivals(save: Save) {
  const state = save.beastPvp
  state.targetUntilS = 1e12
  for (const rival of state.rivals) {
    rival.onlineUntilS = null
    rival.nextOnlineAtS = 1e12
    rival.nextFightAtS = 1e12
    rival.damage = 0
  }
}

function party(n = 3) {
  const save = createSave()
  quietRivals(save)
  const ids: string[] = []
  for (let i = 0; i < n; i += 1) {
    const worker = spawnWorkerWith(save, 1, 'laborer')
    fillWorkerHp(worker)
    ids.push(worker.id)
  }
  return { save, ids }
}

describe('困兽', () => {
  it('自然掉血停在阶段线上，最后 1 点也必须有人打掉', () => {
    const save = createSave()
    quietRivals(save)
    const state = save.beastPvp
    state.segments = [0.2, 0.2, 0.2, 0.2, 0.2]
    state.hpMax = 1000
    state.phase = 0
    const line = beastBoundaryHp(state, 0)
    state.hp = line + 0.2
    for (let i = 0; i < 30; i += 1) {
      save.elapsedS += 1
      stepBeastPvp(save, Date.parse('2026-09-28T04:00:00.000Z'))
    }
    expect(state.hp).toBeCloseTo(line, 5)
    expect(state.phase).toBe(0)
    expect(itemQty(save, 'beastBone')).toBe(0)

    state.phase = 4
    state.hp = 8
    for (let i = 0; i < 40; i += 1) {
      save.elapsedS += 1
      stepBeastPvp(save, Date.parse('2026-09-28T04:00:00.000Z'))
    }
    expect(state.hp).toBeGreaterThanOrEqual(1)
    expect(state.killed).toBe(false)
    strikeBeast(save, state.hp, { id: 'player', name: '酋长', player: true })
    expect(state.killed).toBe(true)
    expect(itemQty(save, 'beastCore')).toBe(1)
  })

  it('跨线奖归打过那一下的人', () => {
    const save = createSave()
    quietRivals(save)
    const state = save.beastPvp
    state.segments = [0.2, 0.2, 0.2, 0.2, 0.2]
    state.hpMax = 1000
    state.phase = 0
    state.hp = beastBoundaryHp(state, 0)
    strikeBeast(save, 1, { id: 'w', name: '阿木', player: true })
    expect(state.phase).toBe(1)
    expect(itemQty(save, 'beastBone')).toBe(3)
    expect(state.recent.some((row) => row.text.includes('打过了第 1 段线'))).toBe(true)

    state.hp = beastBoundaryHp(state, 1)
    strikeBeast(save, 30, { id: 'r', name: '假人', player: false })
    expect(itemQty(save, 'beastSinew')).toBe(0)
    expect(state.recent.some((row) => row.text.includes('假人') && row.text.includes('第 2 段线'))).toBe(true)
  })

  it('打断和闪避每阶段二选一，狂怒一击落到下一场', () => {
    const { save, ids } = party(1)
    expect(startBeastFight(save, ids).ok).toBe(true)
    const fight = save.beastPvp.fight!
    fight.telegraph = {
      remainMs: 1200,
      totalMs: 1500,
      spec: { kind: 'heavy', aoe: true, mul: 4, telegraphMs: 1500, gapAfterMs: 3200, hpFrac: 0 },
    }
    expect(beastInterrupt(save).ok).toBe(true)
    expect(beastDodge(save).ok).toBe(false)
    expect(save.beastPvp.reacts[0]).toBe('interrupt')
    expect(save.beastPvp.recent.some((row) => row.text.includes('打断了困兽'))).toBe(true)
    for (let i = 0; i < 8 && save.beastPvp.fight; i += 1) {
      save.elapsedS += 1
      stepBeastPvp(save, Date.parse('2026-09-28T04:00:00.000Z'))
    }
    expect(save.beastPvp.recent.some((row) => row.text.includes('挨了狂怒'))).toBe(false)
    expect(save.beastPvp.enrage?.pending?.enrage).toBe(true)
    if (save.beastPvp.fight) {
      for (const row of save.beastPvp.fight.workers) row.hp = 0
      finishBeastFightAuto(save, true)
    }
    fillWorkerHp(save.workers[0]!)
    expect(startBeastFight(save, ids).ok).toBe(true)
    expect(save.beastPvp.fight?.telegraph?.spec.enrage).toBe(true)
    for (let i = 0; i < 6 && save.beastPvp.enrage; i += 1) {
      save.elapsedS += 1
      stepBeastPvp(save, Date.parse('2026-09-28T04:00:00.000Z'))
    }
    expect(save.beastPvp.enrage).toBeNull()
    expect(save.beastPvp.recent.some((row) => row.text.includes('挨了狂怒'))).toBe(true)
  })

  it('日结按名次发兽材，时钟回拨不发', () => {
    const save = createSave()
    quietRivals(save)
    save.beastPvp.dayKey = '2026-09-27'
    save.beastPvp.playerDamage = 5000
    stepBeastPvp(save, Date.parse('2026-09-27T16:00:00.000Z'))
    expect(save.messages.some((row) => row.title === '困兽结算')).toBe(true)
    expect(itemQty(save, 'beastCore')).toBeGreaterThanOrEqual(1)
    expect(itemQty(save, 'beastBone')).toBeGreaterThanOrEqual(1)
    const bones = itemQty(save, 'beastBone')
    save.beastPvp.dayKey = '2026-09-30'
    save.beastPvp.playerDamage = 9
    stepBeastPvp(save, Date.parse('2026-09-28T04:00:00.000Z'))
    expect(itemQty(save, 'beastBone')).toBe(bones)
    expect(beastRankReward(1, true).some((row) => row.itemId === 'beastBone')).toBe(true)
    expect(beastRankReward(11, true)).toEqual([{ itemId: 'beastBone', qty: 2 }])
    expect(beastRankReward(1, false)).toEqual([])
  })

  it('离线跨过 0 点写进离线消息', () => {
    const save = createSave()
    quietRivals(save)
    save.beastPvp.playerDamage = 80
    save.beastPvp.dayKey = '2026-09-27'
    save.lastTick = Date.parse('2026-09-27T15:59:58.000Z')
    const next = settleOffline(save, Date.parse('2026-09-27T16:00:02.000Z')).save
    expect(next.messages.some((row) => row.title === '困兽' && row.body.includes('昨日奖励'))).toBe(true)
    expect(next.messages.some((row) => row.title === '困兽结算')).toBe(false)
  })

  it('旧档没有困兽字段时补今天的兽，不补昨天的奖', () => {
    const raw = createSave()
    delete (raw as { beastPvp?: unknown }).beastPvp
    const loaded = hydrateLoadedSave(raw)
    expect(loaded?.beastPvp.rivals).toHaveLength(19)
    expect(loaded?.beastPvp.stamina).toBe(100)
    expect(loaded?.beastPvp.playerDamage).toBe(0)
    expect(itemQty(loaded!, 'beastBone')).toBe(0)
    expect(loaded?.potionBuffs.beastOilUntil).toBeNull()
  })

  it('兽材料理：骨汤、肉串、狂兽油、酋长宴、站点升 1 级', () => {
    const save = createSave()
    expect(craftBoneSoup(save).ok).toBe(false)
    save.bank.beastBone = 1
    save.bank.meat = 10
    expect(craftBoneSoup(save).ok).toBe(true)
    expect(itemQty(save, 'boneSoup')).toBe(5)
    save.bank.beastSinew = 1
    save.bank.spice = 10
    expect(craftHunterSkewer(save).ok).toBe(true)
    expect(itemQty(save, 'hunterSkewer')).toBe(5)
    save.bank.beastFat = 1
    save.bank.herb = 10
    expect(craftBeastOil(save).ok).toBe(true)
    expect(itemQty(save, 'beastOil')).toBe(3)
    save.bank.beastHeart = 1
    save.bank.meat = 20
    save.bank.spice = 10
    expect(craftBeastFeast(save).ok).toBe(true)
    expect(save.workshopBuff?.kind).toBe('feast')
    expect(save.workshopBuff?.mul).toBe(1.2)
    const before = save.stations.herbalism.stationLevel
    const xp = save.stations.herbalism.stationXp
    save.bank.beastCore = 1
    expect(breakthroughStation(save, 'herbalism').ok).toBe(true)
    expect(save.stations.herbalism.stationLevel).toBe(before + 1)
    expect(save.stations.herbalism.stationXp).toBe(0)
    expect(xp).toBeLessThan(xpToNextLevel(before))
    expect(grantStationLevel(save, 'mining')).toBe(save.stations.mining.stationLevel)
  })

  it('跳到阶段线正好停在当前线上', () => {
    const save = createSave()
    save.beastPvp.segments = [0.2, 0.2, 0.2, 0.2, 0.2]
    save.beastPvp.hp = save.beastPvp.hpMax
    expect(gmBeastJumpToLine(save).ok).toBe(true)
    expect(save.beastPvp.hp).toBeCloseTo(beastBoundaryHp(save.beastPvp, 0), 4)
  })

  it('不操作时三名同级苦工大约 30 到 45 秒倒下', () => {
    const kinds: BeastKind[] = ['boar', 'wolf', 'stag']
    for (const kind of kinds) {
      for (const level of [1, 10]) {
        const save = createSave()
        quietRivals(save)
        save.knightLevel = level
        save.beastPvp.kind = kind
        save.beastPvp.hpMax = 1e12
        save.beastPvp.hp = 1e12
        save.beastPvp.killed = false
        const ids: string[] = []
        for (let i = 0; i < 3; i += 1) {
          const worker = spawnWorkerWith(save, 1, 'laborer')
          worker.level = level
          fillWorkerHp(worker)
          ids.push(worker.id)
        }
        expect(startBeastFight(save, ids).ok).toBe(true)
        let ticks = 0
        while (save.beastPvp.fight && ticks < 90) {
          save.elapsedS += 1
          stepBeastPvp(save, Date.parse('2026-09-28T04:00:00.000Z'))
          ticks += 1
        }
        expect(ticks, `${kind} Lv${level}`).toBeGreaterThanOrEqual(30)
        expect(ticks, `${kind} Lv${level}`).toBeLessThanOrEqual(45)
      }
    }
  })

  it('只靠假玩家大约在 20 点到 23 点打死', () => {
    setBeastRollOverride(() => 0.5)
    const save = createSave()
    const state = save.beastPvp
    state.dayKey = '2026-09-28'
    state.hp = state.hpMax
    state.phase = 0
    state.killed = false
    state.playerDamage = 0
    const start = Date.parse('2026-09-27T16:00:00.000Z')
    let second = 0
    while (!state.killed && second < 24 * 3600) {
      second += 1
      save.elapsedS += 1
      stepBeastPvp(save, start + second * 1000, { offline: true })
    }
    const hour = second / 3600
    expect(state.killed).toBe(true)
    expect(hour).toBeGreaterThanOrEqual(20)
    expect(hour).toBeLessThanOrEqual(23)
    expect(beastHpMax(1)).toBeGreaterThan(1_000_000)
    expect(beastAttackPower(1)).toBeGreaterThan(1)
  }, 20000)
})
