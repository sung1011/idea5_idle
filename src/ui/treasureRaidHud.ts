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
  const atkMax = Math.max(1, raid.atkMax)
  const defMax = Math.max(1, shadow.hpMax)
  return {
    attack: {
      name: fighterName(workers, attackerId),
      hp: raid.atkHp,
      hpMax: atkMax,
      barFill: hpBarFill(raid.atkHp, atkMax),
      fill: raidActChargeFill(raid.atkSpd, raid.atkNext, elapsedS),
      slots: slotStates(raid.attackSlots, raid.queue),
    },
    defend: {
      name: shadow.name || '守军',
      hp: raid.defHp,
      hpMax: defMax,
      barFill: hpBarFill(raid.defHp, defMax),
      fill: raidActChargeFill(raid.defSpd, raid.defNext, elapsedS),
      slots: slotStates(raid.defendSlots, mine.shadows.map((row) => row.id)),
    },
    waitingAttack: raid.queue.slice(1).map((id) => fighterName(workers, id)),
    waitingDefend: mine.shadows.slice(1).map((row) => row.name),
  }
}
