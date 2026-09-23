import { TREASURE_RAID_CAP } from '../sim/treasureMine'
import type { TreasureMine, Worker } from '../sim/types'
import { actChargeFill } from './actCharge'
import { hpBarFill } from './hpBar'
import { workerShortName } from './workerGroups'

/** 开战槽：仍在队列里 / 开局就空 / 开局有人现已死。 */
export type RaidSlotMark = 'filled' | 'empty' | 'dead'

export function raidSlotLabel(mark: RaidSlotMark): string {
  if (mark === 'filled') return '有人'
  if (mark === 'dead') return '亡'
  return '空'
}

/**
 * 编制血条。上限是开战快照里实有人数的 hpMax 之和，空槽不加。
 * 当前值只加还活着的人；`currentHp` 返回 null 表示已死，计 0。
 */
export function squadBarHp(
  slots: readonly (string | null)[] | undefined,
  openMax: readonly number[] | undefined,
  currentHp: (id: string, index: number) => number | null,
): { hp: number; hpMax: number } {
  let hp = 0
  let hpMax = 0
  for (let i = 0; i < TREASURE_RAID_CAP; i += 1) {
    const id = slots?.[i]
    if (typeof id !== 'string' || !id) continue
    const max = openMax?.[i]
    if (typeof max === 'number' && Number.isFinite(max) && max > 0) hpMax += max
    const live = currentHp(id, i)
    if (live == null || !Number.isFinite(live) || live <= 0) continue
    hp += live
  }
  return { hp, hpMax }
}

/** 用开战快照对照当前存活 id。快照缺位或 null 都是空槽。 */
export function slotStates(
  snapshot: readonly (string | null)[] | undefined,
  livingIds: readonly string[],
): RaidSlotMark[] {
  const living = new Set(livingIds)
  const raw = Array.isArray(snapshot) ? snapshot : []
  const marks: RaidSlotMark[] = []
  for (let i = 0; i < TREASURE_RAID_CAP; i += 1) {
    const id = raw[i]
    if (typeof id !== 'string' || !id) marks.push('empty')
    else marks.push(living.has(id) ? 'filled' : 'dead')
  }
  return marks
}

/**
 * 夺宝出手条。战斗时钟是秒，战场 `actChargeFill` 用毫秒。
 * 只换单位，公式仍是同一套。
 */
export function raidActChargeFill(spd: number, nextAtS: number, elapsedS: number): number {
  if (!Number.isFinite(nextAtS) || !Number.isFinite(elapsedS)) return 0
  return actChargeFill(spd, nextAtS * 1000, elapsedS * 1000)
}

export type TreasureRaidFighterHud = {
  name: string
  hp: number
  hpMax: number
  /** 血条填充，与 `hpBarFill` 相同。 */
  barFill: number
  /** 出手蓄力，与战场 `actChargeFill` 相同。 */
  fill: number
  /** 开战 3 槽：有人 / 空 / 亡。 */
  slots: RaidSlotMark[]
}

export type TreasureRaidHud = {
  attack: TreasureRaidFighterHud
  defend: TreasureRaidFighterHud
  waitingAttack: string[]
  waitingDefend: string[]
}

function fighterName(workers: readonly Worker[], id: string): string {
  const worker = workers.find((row) => row.id === id)
  return worker ? workerShortName(worker) : id
}

/** 当前这一对攻守的血条/出手条数据。队列其余人只作为等待名单。没有交战双方时不画。 */
export function treasureRaidHud(
  mine: TreasureMine,
  workers: readonly Worker[],
  elapsedS: number,
): TreasureRaidHud | null {
  const raid = mine.raid
  const shadow = mine.shadows[0]
  const attackerId = raid?.queue[0]
  if (!raid || !attackerId || !shadow) return null
  const attackHp = squadBarHp(raid.attackSlots, raid.attackSlotMax, (id, index) => {
    if (!raid.queue.includes(id)) return null
    if (id === attackerId) return raid.atkHp
    const snapped = raid.attackSlotHp?.[index]
    return typeof snapped === 'number' && Number.isFinite(snapped) ? snapped : 0
  })
  const defendHp = squadBarHp(raid.defendSlots, raid.defendSlotMax, (id) => {
    const row = mine.shadows.find((shadowRow) => shadowRow.id === id)
    if (!row) return null
    if (id === shadow.id) return raid.defHp
    return row.hp
  })
  return {
    attack: {
      name: fighterName(workers, attackerId),
      hp: attackHp.hp,
      hpMax: attackHp.hpMax,
      barFill: hpBarFill(attackHp.hp, attackHp.hpMax),
      fill: raidActChargeFill(raid.atkSpd, raid.atkNext, elapsedS),
      slots: slotStates(raid.attackSlots, raid.queue),
    },
    defend: {
      name: shadow.name || '守军',
      hp: defendHp.hp,
      hpMax: defendHp.hpMax,
      barFill: hpBarFill(defendHp.hp, defendHp.hpMax),
      fill: raidActChargeFill(raid.defSpd, raid.defNext, elapsedS),
      slots: slotStates(raid.defendSlots, mine.shadows.map((row) => row.id)),
    },
    waitingAttack: raid.queue.slice(1).map((id) => fighterName(workers, id)),
    waitingDefend: mine.shadows.slice(1).map((row) => row.name),
  }
}
