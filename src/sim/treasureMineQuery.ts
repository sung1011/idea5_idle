import type { Save } from './types'

export function treasureMineCrewIds(save: Save): Set<string> {
  const ids = new Set<string>()
  for (const mine of save.treasureMines?.mines ?? []) {
    for (const id of mine.crewIds) ids.add(id)
  }
  return ids
}

export function treasureMineRaidIds(save: Save): Set<string> {
  const ids = new Set<string>()
  for (const mine of save.treasureMines?.mines ?? []) {
    for (const id of mine.raid?.queue ?? []) ids.add(id)
    for (const row of mine.raid?.returning ?? []) ids.add(row.id)
  }
  return ids
}

/** 开采中或抢夺队列中。开采不是主线战斗。 */
export function treasureMineBlockReason(save: Save, workerId: string): string | null {
  if (treasureMineRaidIds(save).has(workerId)) return '正在夺宝'
  if (treasureMineCrewIds(save).has(workerId)) return '正在矿洞'
  return null
}

export function isWorkerInTreasureMine(save: Save, workerId: string): boolean {
  return treasureMineBlockReason(save, workerId) != null
}
