import { hashString } from './combatAttrs'
import { roll01 } from './rng'
import { WORKER_RACE_IDS, type WorkerRaceId } from './types'
import type { Save } from './types'

/** 界面小标签。id 不进文案。 */
export const WORKER_RACE_LABEL: Record<WorkerRaceId, string> = {
  orc: '兽人',
  troll: '巨魔',
  tauren: '牛头人',
  bloodElf: '血精灵',
}

/**
 * 各种族名字池。招募 / 合成 / 助战按种族取名。
 * 不用魔兽官方角色名。
 */
export const WORKER_RACE_NAMES: Record<WorkerRaceId, readonly string[]> = {
  orc: ['格鲁克', '卡兹莫', '裂颚', '乌洛克', '玛戈', '杜沙', '戈尔坎', '纳祖克', '血喉', '萨戈'],
  troll: ['赞达', '金索', '祖巴', '玛金', '托卡', '希拉', '鲁祖', '卡金', '沃扎', '金巴'],
  tauren: ['蓝蹄', '塔胡', '石角', '穆拉', '灰鬃', '托尔卡', '温图', '霍恩', '鲁哈', '岩蹄'],
  bloodElf: ['瑟兰', '艾洛娜', '瓦里斯', '珊德拉', '洛瑟玛', '伊琳', '泰洛斯', '米拉', '萨洛', '维恩'],
}

export function isWorkerRaceId(value: unknown): value is WorkerRaceId {
  return typeof value === 'string' && (WORKER_RACE_IDS as readonly string[]).includes(value)
}

/** 旧档缺种族时按 id 落到固定一种，重复读档不换。 */
export function raceFromWorkerId(id: string): WorkerRaceId {
  return WORKER_RACE_IDS[hashString(id) % WORKER_RACE_IDS.length] ?? 'orc'
}

export function nameFromWorkerId(id: string, race: WorkerRaceId = raceFromWorkerId(id)): string {
  const pool = WORKER_RACE_NAMES[race]
  return pool[hashString(`${id}:name`) % pool.length] ?? pool[0]
}

export function identityFromWorkerId(id: string): { race: WorkerRaceId; name: string } {
  const race = raceFromWorkerId(id)
  return { race, name: nameFromWorkerId(id, race) }
}

export function rollWorkerRace(save: Save): WorkerRaceId {
  const index = Math.min(
    WORKER_RACE_IDS.length - 1,
    Math.max(0, Math.floor(roll01(save) * WORKER_RACE_IDS.length)),
  )
  return WORKER_RACE_IDS[index] ?? 'orc'
}

export function rollWorkerName(save: Save, race: WorkerRaceId): string {
  const pool = WORKER_RACE_NAMES[race]
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(roll01(save) * pool.length)))
  return pool[index] ?? pool[0]
}

export function workerRaceLabel(race: unknown): string {
  return isWorkerRaceId(race) ? WORKER_RACE_LABEL[race] : ''
}
