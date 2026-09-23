import { playerDisplayName } from '../sim/createSave'
import { TREASURE_RAID_CAP, raidSlotSnapshot } from '../sim/treasureMine'
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
  /** 未开战为 null，不画空的攻方条。 */
  attack: TreasureRaidFighterHud | null
  defend: TreasureRaidFighterHud
  waitingAttack: string[]
  waitingDefend: string[]
  fighting: boolean
}

function fighterName(workers: readonly Worker[], id: string): string {
  const worker = workers.find((row) => row.id === id)
  return worker ? workerShortName(worker) : id
}

/** 攻方名字行：玩家显示名，后面带上当前出战者。缺名兜底见习勇者。 */
function attackLine(playerName: unknown, fighter: string): string {
  const player = playerDisplayName(playerName)
  if (!fighter || fighter === player) return player
  return `${player} · ${fighter}`
}

/** 未开战的快照驻守洞：只给守方一条静止 HUD。我方开采洞不画。 */
function standbyDefendHud(mine: TreasureMine): TreasureRaidHud | null {
  const front = mine.shadows[0]
  if (mine.owner !== 'shadow' || mine.raid || !front) return null
  const living = mine.shadows.map((row) => row.id)
  const slots = raidSlotSnapshot(living)
  const openMax = slots.map((id) => {
    const row = id ? mine.shadows.find((shadow) => shadow.id === id) : undefined
    return row ? Math.max(0, row.hpMax) : 0
  })
  const bar = squadBarHp(slots, openMax, (id) => mine.shadows.find((shadow) => shadow.id === id)?.hp ?? null)
  return {
    attack: null,
    defend: {
      name: front.name || '守军',
      hp: bar.hp,
      hpMax: bar.hpMax,
      barFill: hpBarFill(bar.hp, bar.hpMax),
      fill: 0,
      slots: slotStates(slots, living),
    },
    waitingAttack: [],
    waitingDefend: mine.shadows.slice(1).map((row) => row.name),
    fighting: false,
  }
}

/** 开战画攻守两边。未开战的快照驻守洞只画守方。没有守军、或已是我方开采洞时不画。 */
export function treasureRaidHud(
  mine: TreasureMine,
  workers: readonly Worker[],
  elapsedS: number,
  playerName?: unknown,
): TreasureRaidHud | null {
  const raid = mine.raid
  const shadow = mine.shadows[0]
  const attackerId = raid?.queue[0]
  if (!raid || !attackerId || !shadow) return standbyDefendHud(mine)
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
      name: attackLine(playerName, fighterName(workers, attackerId)),
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
    fighting: true,
  }
}
