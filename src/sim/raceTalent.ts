import { QUALITY_MAX, QUALITY_MIN } from './tables'
import type { Worker, WorkerRaceId } from './types'

/** 采药 / 狩猎 / 夺宝。每个种族最多挂一组。 */
export type RaceTalentGroup = 'herb' | 'hunt' | 'treasure'

/** 稀有种族更强的分档。本步开局三族都是 base。 */
export type RaceTalentTier = 'base' | 'rare' | 'epic'

/**
 * 白档(1) 乘区 1，彩档(10) 乘区 1+SPAN。
 * SPAN=1 即彩色大约是白色的 2 倍。
 */
export const RACE_TALENT_QUALITY_SPAN = 1

/** 与品质乘区相乘。下一步给稀有种族填更大的数即可。 */
export const RACE_TALENT_TIER_MUL: Readonly<Record<RaceTalentTier, number>> = {
  base: 1,
  rare: 1.25,
  epic: 1.5,
}

/** 减耗时 / 减消耗最多减这么多，避免减到 0。 */
export const RACE_TALENT_REDUCTION_CAP = 0.8

/** 开采间隔下限（秒）。速度加成后再夹，避免除零。 */
export const RACE_TALENT_MINE_INTERVAL_FLOOR_S = 0.25

export type RaceTalentDef = {
  race: WorkerRaceId
  group: RaceTalentGroup
  icon: '🌿' | '🏹' | '💎'
  tier: RaceTalentTier
  /** 白品质基准。减益类是减少比例，增益类是增加比例。 */
  base: number
}

export type RaceTalentView = {
  icon: RaceTalentDef['icon']
  text: string
  group: RaceTalentGroup
}

/**
 * 本步只给开局三族。其余种族下一步再补。
 * 牛头采药、兽人狩猎、巨魔夺宝。
 */
export const RACE_TALENT_BY_RACE: Readonly<Partial<Record<WorkerRaceId, RaceTalentDef>>> = {
  tauren: { race: 'tauren', group: 'herb', icon: '🌿', tier: 'base', base: 0.2 },
  orc: { race: 'orc', group: 'hunt', icon: '🏹', tier: 'base', base: 0.15 },
  troll: { race: 'troll', group: 'treasure', icon: '💎', tier: 'base', base: 0.2 },
}

export function raceTalentOf(race: unknown): RaceTalentDef | null {
  if (typeof race !== 'string') return null
  return RACE_TALENT_BY_RACE[race as WorkerRaceId] ?? null
}

/** 白=1，彩=1+SPAN，中间线性。 */
export function raceTalentQualityMul(qualityTier: number): number {
  const span = QUALITY_MAX - QUALITY_MIN
  const raw = Number.isFinite(qualityTier) ? qualityTier : QUALITY_MIN
  const tier = Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, Math.floor(raw)))
  if (span <= 0) return 1
  return 1 + ((tier - QUALITY_MIN) / span) * RACE_TALENT_QUALITY_SPAN
}

export function raceTalentScaledValue(
  base: number,
  qualityTier: number,
  talentTier: RaceTalentTier,
): number {
  const tierMul = RACE_TALENT_TIER_MUL[talentTier] ?? 1
  return Math.max(0, base) * raceTalentQualityMul(qualityTier) * tierMul
}

export function raceTalentReduction(
  base: number,
  qualityTier: number,
  talentTier: RaceTalentTier,
): number {
  return Math.min(RACE_TALENT_REDUCTION_CAP, raceTalentScaledValue(base, qualityTier, talentTier))
}

/** 减完至少留 1，整数四舍五入。 */
export function applyRaceTalentReduction(qty: number, reduction: number): number {
  if (!Number.isFinite(qty) || qty <= 0) return qty
  const cut = Math.min(RACE_TALENT_REDUCTION_CAP, Math.max(0, reduction))
  return Math.max(1, Math.round(qty * (1 - cut)))
}

function scaledForGroup(
  worker: Pick<Worker, 'race' | 'qualityTier'> | undefined,
  group: RaceTalentGroup,
): number {
  if (!worker) return 0
  const def = raceTalentOf(worker.race)
  if (!def || def.group !== group) return 0
  return raceTalentScaledValue(def.base, worker.qualityTier, def.tier)
}

export function herbTalentReduction(worker?: Pick<Worker, 'race' | 'qualityTier'>): number {
  if (!worker) return 0
  const def = raceTalentOf(worker.race)
  if (!def || def.group !== 'herb') return 0
  return raceTalentReduction(def.base, worker.qualityTier, def.tier)
}

export function huntAtkBonus(worker?: Pick<Worker, 'race' | 'qualityTier'>): number {
  return scaledForGroup(worker, 'hunt')
}

export function applyHuntAtk(atk: number, worker?: Pick<Worker, 'race' | 'qualityTier'>): number {
  const bonus = huntAtkBonus(worker)
  if (!bonus || !Number.isFinite(atk) || atk <= 0) return atk
  return Math.max(1, Math.round(atk * (1 + bonus)))
}

export function treasureMineSpeedBonus(worker?: Pick<Worker, 'race' | 'qualityTier'>): number {
  return scaledForGroup(worker, 'treasure')
}

export function applyTreasureMineInterval(
  intervalS: number,
  worker?: Pick<Worker, 'race' | 'qualityTier'>): number {
  const bonus = treasureMineSpeedBonus(worker)
  if (!bonus || !Number.isFinite(intervalS) || intervalS <= 0) return intervalS
  return Math.max(RACE_TALENT_MINE_INTERVAL_FLOOR_S, intervalS / (1 + bonus))
}

export function raceTalentPctLabel(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** 玩家可见短说明，带当前品质的实际数字。 */
export function raceTalentCopy(def: RaceTalentDef, qualityTier: number = QUALITY_MIN): string {
  if (def.group === 'herb') {
    const pct = raceTalentPctLabel(raceTalentReduction(def.base, qualityTier, def.tier))
    return `割草体力消耗 −${pct}，除草耗时 −${pct}`
  }
  if (def.group === 'hunt') {
    const pct = raceTalentPctLabel(raceTalentScaledValue(def.base, qualityTier, def.tier))
    return `困兽和战场攻击 +${pct}`
  }
  const pct = raceTalentPctLabel(raceTalentScaledValue(def.base, qualityTier, def.tier))
  return `夺宝开采速度 +${pct}`
}

export function workerRaceTalentView(
  worker: Pick<Worker, 'race' | 'qualityTier'>,
): RaceTalentView | null {
  const def = raceTalentOf(worker.race)
  if (!def) return null
  return { icon: def.icon, text: raceTalentCopy(def, worker.qualityTier), group: def.group }
}

export function raceTalentMark(worker: Pick<Worker, 'race' | 'qualityTier'>): string | null {
  const view = workerRaceTalentView(worker)
  return view ? `${view.icon} ${view.text}` : null
}

export function workerMatchesTalentGroup(
  worker: { race?: unknown },
  group: RaceTalentGroup | null | undefined,
): boolean {
  if (!group) return false
  return raceTalentOf(worker.race)?.group === group
}

/** 对口天赋排前面，两组内部都保持原顺序。 */
export function orderPickByTalent<T extends { race?: unknown }>(
  workers: readonly T[],
  group: RaceTalentGroup | null | undefined,
): T[] {
  if (!group) return [...workers]
  return workers
    .map((worker, index) => ({
      worker,
      index,
      rank: workerMatchesTalentGroup(worker, group) ? 0 : 1,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.worker)
}
