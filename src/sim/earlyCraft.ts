import { mainlineStepOf } from './mainlineQuest'
import type { Save, StationId } from './types'

/**
 * 教学 / 前期主线把采药、炼金的 ×4 周期打回原速（表上 20s / 40s → 5s / 10s）。
 * 打猎任务起、或该站已到 5 级，不再缩短。
 */
export const EARLY_HERB_ALCHEMY_CYCLE_MUL = 0.25
/** 站等级达到此值（含）视为高等级锅。 */
export const EARLY_CRAFT_STATION_LEVEL_CAP = 5

const EARLY_CRAFT_STATIONS: ReadonlySet<StationId> = new Set(['herbalism', 'alchemy'])

export function isEarlyHerbAlchemyPace(save: Pick<Save, 'guideQuestStep'>): boolean {
  const raw = save.guideQuestStep
  const step = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 1
  const huntStart = mainlineStepOf('huntStart')
  return huntStart > 0 && step > 0 && step < huntStart
}

export function earlyHerbAlchemyCycleMul(save: Save, stationId: StationId): number {
  if (!EARLY_CRAFT_STATIONS.has(stationId)) return 1
  if (!isEarlyHerbAlchemyPace(save)) return 1
  const level = save.stations[stationId]?.stationLevel ?? 1
  if (level >= EARLY_CRAFT_STATION_LEVEL_CAP) return 1
  return EARLY_HERB_ALCHEMY_CYCLE_MUL
}
