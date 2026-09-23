import type { TreasureMine, Worker } from '../sim/types'
import { actChargeFill } from './actCharge'
import { hpBarFill } from './hpBar'
import { workerShortName } from './workerGroups'

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
    },
    defend: {
      name: shadow.name || '守军',
      hp: raid.defHp,
      hpMax: defMax,
      barFill: hpBarFill(raid.defHp, defMax),
      fill: raidActChargeFill(raid.defSpd, raid.defNext, elapsedS),
    },
    waitingAttack: raid.queue.slice(1).map((id) => fighterName(workers, id)),
    waitingDefend: mine.shadows.slice(1).map((row) => row.name),
  }
}
