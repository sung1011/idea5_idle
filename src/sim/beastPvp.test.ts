import { afterEach, describe, expect, it } from 'vitest'
import { itemQty } from './bank'
import {
  BEAST_COWER_DEALT_MUL,
  BEAST_COWER_MS,
  BEAST_COWER_TAKEN_MUL,
  BEAST_INTERRUPT_MUL,
  beastAttackPower,
  beastAutoFightDamage,
  beastBoundaryHp,
  beastCower,
  beastDodge,
  beastHpMax,
  beastHud,
  beastInterrupt,
  beastRivalReactChoice,
  beastRivalReactMul,
  beastSkilledFightDamage,
  hydrateBeastPvp,
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
import { COMBAT_ATTR_IDS, scaledAttackDamage } from './combatAttrs'
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

function missWeakness(save: Save) {
  const attrs = new Set(save.beastPvp.fight?.workers[0]?.attrs ?? [])
  save.beastPvp.weakness = COMBAT_ATTR_IDS.find((id) => !attrs.has(id)) ?? 'sword'
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

  it('打断取消当前读条，本场下一击伤害减少三成', () => {
    const { save, ids } = party(1)
    save.beastPvp.kind = 'boar'
    expect(startBeastFight(save, ids).ok).toBe(true)
    const fight = save.beastPvp.fight!
    const normals = fight.normals
    fight.telegraph = {
      remainMs: 1200,
      totalMs: 1500,
      spec: { kind: 'heavy', aoe: true, mul: 4, telegraphMs: 1500, gapAfterMs: 3200, hpFrac: 0 },
    }
    const recent = save.beastPvp.recent.length
    expect(beastInterrupt(save).ok).toBe(true)
    expect(beastInterrupt(save).ok).toBe(false)
    expect(beastDodge(save).ok).toBe(false)
    expect(save.beastPvp.reacts[0]).toBe('interrupt')
    expect(fight.telegraph).toBeNull()
    expect(fight.weakenNext).toBe(true)
    expect(fight.normals).toBe(normals)
    expect(save.beastPvp.recent.length).toBe(recent)
    expect(save.beastPvp.recent.some((row) => /打断|狂怒/.test(row.text))).toBe(false)

    fight.normals = 3
    fight.gapMs = 1
    const hpBefore = fight.workers[0]!.hp
    const now = Date.parse('2026-09-28T04:00:00.000Z')
    save.elapsedS += 1
    stepBeastPvp(save, now)
    save.elapsedS += 1
    stepBeastPvp(save, now)
    const lost = hpBefore - fight.workers[0]!.hp
    const full = scaledAttackDamage(beastAttackPower(save.knightLevel), 4)
    expect(lost).toBe(scaledAttackDamage(beastAttackPower(save.knightLevel), 4 * BEAST_INTERRUPT_MUL))
    expect(lost).toBeLessThan(full)
    expect(fight.weakenNext).toBe(false)

    for (const row of fight.workers) row.hp = 0
    finishBeastFightAuto(save, true)
    fillWorkerHp(save.workers[0]!)
    expect(startBeastFight(save, ids).ok).toBe(true)
    expect(save.beastPvp.fight?.telegraph).toBeNull()
    expect(save.beastPvp.fight?.weakenNext).toBe(false)
    expect(save.beastPvp.recent.some((row) => /打断|狂怒/.test(row.text))).toBe(false)
  })

  it('畏缩和打断、闪避每阶段三选一，十秒内减伤仍能跨线', () => {
    const { save, ids } = party(1)
    save.beastPvp.kind = 'boar'
    expect(startBeastFight(save, ids).ok).toBe(true)
    const fight = save.beastPvp.fight!
    missWeakness(save)
    expect(beastHud(save).canCower).toBe(true)
    expect(beastCower(save).ok).toBe(true)
    expect(beastDodge(save).ok).toBe(false)
    expect(beastInterrupt(save).ok).toBe(false)
    expect(beastCower(save).ok).toBe(false)
    expect(save.beastPvp.reacts[0]).toBe('cower')
    expect(fight.cowerMs).toBe(BEAST_COWER_MS)
    expect(beastHud(save).cowerMs).toBe(BEAST_COWER_MS)
    expect(beastHud(save).canDodge).toBe(false)
    expect(beastHud(save).canInterrupt).toBe(false)
    expect(beastHud(save).canCower).toBe(false)

    const row = fight.workers[0]!
    const line = beastBoundaryHp(save.beastPvp, 0)
    save.beastPvp.hp = line + 1
    row.accMs = Math.round(row.spd * 1000)
    const dealtBefore = save.beastPvp.playerDamage
    const now = Date.parse('2026-09-28T04:00:00.000Z')
    save.elapsedS += 1
    stepBeastPvp(save, now)
    expect(save.beastPvp.playerDamage - dealtBefore).toBe(scaledAttackDamage(row.atk, BEAST_COWER_DEALT_MUL))
    expect(save.beastPvp.phase).toBe(1)
    expect(itemQty(save, 'beastBone')).toBe(3)
    expect(fight.cowerMs).toBe(BEAST_COWER_MS - 1000)

    fight.telegraph = {
      remainMs: 40,
      totalMs: 1500,
      spec: { kind: 'heavy', aoe: true, mul: 4, telegraphMs: 1500, gapAfterMs: 3200, hpFrac: 0 },
    }
    const hpBefore = row.hp
    save.elapsedS += 1
    stepBeastPvp(save, now)
    expect(hpBefore - row.hp).toBe(scaledAttackDamage(beastAttackPower(save.knightLevel), 4 * BEAST_COWER_TAKEN_MUL))

    fight.telegraph = null
    fight.gapMs = 1e9
    fight.cowerMs = 1000
    save.elapsedS += 1
    stepBeastPvp(save, now)
    expect(fight.cowerMs).toBe(0)
    fight.telegraph = {
      remainMs: 40,
      totalMs: 1500,
      spec: { kind: 'heavy', aoe: true, mul: 4, telegraphMs: 1500, gapAfterMs: 3200, hpFrac: 0 },
    }
    const after = row.hp
    save.elapsedS += 1
    stepBeastPvp(save, now)
    expect(after - row.hp).toBe(scaledAttackDamage(beastAttackPower(save.knightLevel), 4))
  })

  it('自动只闪避，不畏缩', () => {
    const { save, ids } = party(1)
    save.beastPvp.auto = true
    expect(startBeastFight(save, ids).ok).toBe(true)
    const fight = save.beastPvp.fight!
    fight.workers[0]!.hp = 1
    fight.gapMs = 1e9
    save.elapsedS += 1
    stepBeastPvp(save, Date.parse('2026-09-28T04:00:00.000Z'))
    expect(save.beastPvp.reacts[0]).toBe('dodge')
    expect(fight.dodgeNext).toBe(true)
    expect(fight.cowerMs).toBe(0)
  })

  it('假玩家每阶段三选一，狼更常畏缩，不写最近', () => {
    const now = Date.parse('2026-09-28T04:00:00.000Z')
    setBeastRollOverride(() => 0.9)
    const save = createSave()
    quietRivals(save)
    const state = save.beastPvp
    state.kind = 'boar'
    const rival = state.rivals[0]!
    rival.onlineUntilS = save.elapsedS + 1000
    rival.nextFightAtS = save.elapsedS
    const recent = state.recent.length
    save.elapsedS += 1
    stepBeastPvp(save, now)
    expect(rival.reacts[0]).toBe('interrupt')
    expect(beastRivalReactChoice('boar', 0.9)).toBe('interrupt')
    expect(beastRivalReactChoice('boar', 0.4)).toBe('dodge')
    expect(beastRivalReactChoice('wolf', 0.4)).toBe('cower')
    expect(state.recent.length).toBe(recent)
    expect(state.recent.some((row) => /打断|畏缩|狂怒/.test(row.text))).toBe(false)
    expect('enrage' in state).toBe(false)

    setBeastRollOverride(() => 0.4)
    const dodgeRival = state.rivals[1]!
    dodgeRival.onlineUntilS = save.elapsedS + 1000
    dodgeRival.nextFightAtS = save.elapsedS
    save.elapsedS += 1
    stepBeastPvp(save, now)
    expect(dodgeRival.reacts[0]).toBe('dodge')

    state.kind = 'wolf'
    const wolfRival = state.rivals[2]!
    wolfRival.onlineUntilS = save.elapsedS + 1000
    wolfRival.nextFightAtS = save.elapsedS
    const wolfBefore = wolfRival.damage
    save.elapsedS += 1
    stepBeastPvp(save, now)
    expect(wolfRival.reacts[0]).toBe('cower')
    const auto = beastAutoFightDamage(save.knightLevel)
    const skilled = beastSkilledFightDamage(save.knightLevel)
    const base = Math.round(auto + (skilled - auto) * 0.4)
    expect(wolfRival.damage - wolfBefore).toBe(Math.round(base * beastRivalReactMul('cower')))
  })

  it('旧档上的狂怒读档后丢掉', () => {
    const save = createSave()
    ;(save.beastPvp as { enrage?: unknown }).enrage = {
      byId: 'beast-rival-0',
      byName: '甲',
      pending: { kind: 'heavy', aoe: true, mul: 4, telegraphMs: 1500, gapAfterMs: 3200, hpFrac: 0 },
    }
    hydrateBeastPvp(save)
    expect('enrage' in save.beastPvp).toBe(false)
    expect(save.beastPvp.fight).toBeNull()
    save.beastPvp.reacts[2] = 'cower'
    const worker = spawnWorkerWith(save, 1, 'laborer')
    fillWorkerHp(worker)
    expect(startBeastFight(save, [worker.id]).ok).toBe(true)
    save.beastPvp.fight!.cowerMs = 4000
    hydrateBeastPvp(save)
    expect(save.beastPvp.reacts[2]).toBe('cower')
    expect(save.beastPvp.fight?.cowerMs).toBe(4000)
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
