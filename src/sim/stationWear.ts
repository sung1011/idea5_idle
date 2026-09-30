import { applyWorkerFatigue } from './workshopHp'
import type { Save, StationId, StationWearKind, Worker } from './types'

/** 游戏时间每 8 小时，整站重抽掉血词条。 */
export const STATION_WEAR_REROLL_S = 8 * 3600
/** 条数曲线在 10 级封顶，更高等级按 10 级。 */
export const STATION_WEAR_LEVEL_CAP = 10
export const STATION_WEAR_MAX = 3
/** 随机惊吓：一整轮里期望大约触发这么多次，实际一轮最多 1 次。 */
export const STATION_WEAR_SCARE_P = 0.35

/** 1 级单条、满一轮、占生命上限的比例。 */
export const STATION_WEAR_RATIO_AT_1 = 0.0012
export const STATION_WEAR_RATIO_AT_10 = 0.005
/** 1 级单条、满一轮的固定债。 */
export const STATION_WEAR_FLAT_AT_1 = 0.04
export const STATION_WEAR_FLAT_AT_10 = 0.22
/** 近满血（hp >= hpMax-1）再加的一口。 */
export const STATION_WEAR_PIP_AT_1 = 0.04
export const STATION_WEAR_PIP_AT_10 = 0.12

export const STATION_WEAR_KINDS = ['dot', 'scare', 'finish'] as const satisfies readonly StationWearKind[]

export const STATION_WEAR_LABEL: Readonly<Record<StationWearKind, string>> = {
  dot: '持续损耗',
  scare: '随机惊吓',
  finish: '完成后掉',
}

export const STATION_WEAR_DETAIL: Readonly<Record<StationWearKind, string>> = {
  dot: '做的过程中按进度慢慢掉',
  scare: '做的过程中可能突然掉一截',
  finish: '先出货再掉血，倒地也算做成',
}

let scareOverride: (() => number) | null = null

/** 测试用。生产路径不走覆盖。测完必须清掉。 */
export function setStationWearScareOverride(fn: (() => number) | null): void {
  scareOverride = fn
}

export function isStationWearKind(value: unknown): value is StationWearKind {
  return value === 'dot' || value === 'scare' || value === 'finish'
}

/** 0 在 1 级，1 在 10 级及以上。 */
export function stationWearLevelT(level: number): number {
  const lv = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1))
  return Math.min(1, (lv - 1) / (STATION_WEAR_LEVEL_CAP - 1))
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

/**
 * 条数权重 [0条, 1条, 2条, 3条]。
 * 1 级只有 0～1，10 级 0 条权重为 0，3 条最重。
 */
export function stationWearCountWeights(level: number): readonly [number, number, number, number] {
  const t = stationWearLevelT(level)
  return [70 * (1 - t), 30 * (1 - t) + 12 * t, 28 * t, 60 * t]
}

export function pickStationWearCount(level: number, roll: number): number {
  const weights = stationWearCountWeights(level)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (!(total > 0)) return 0
  const raw = Number.isFinite(roll) ? roll : 0
  let cursor = Math.min(0.999999, Math.max(0, raw)) * total
  for (let i = 0; i < weights.length; i++) {
    cursor -= weights[i]
    if (cursor < 0) return i
  }
  return weights.length - 1
}

export function pickStationWearKinds(count: number, roll: () => number): StationWearKind[] {
  const bag: StationWearKind[] = [...STATION_WEAR_KINDS]
  const n = Math.max(0, Math.min(STATION_WEAR_MAX, Math.floor(count)))
  const out: StationWearKind[] = []
  for (let i = 0; i < n && bag.length; i++) {
    const raw = roll()
    const t = Number.isFinite(raw) ? Math.min(0.999999, Math.max(0, raw)) : 0
    const idx = Math.min(bag.length - 1, Math.floor(t * bag.length))
    out.push(bag.splice(idx, 1)[0])
  }
  return out
}

/** 单条词条走满一轮的劳损债。近满血再加一口。等级越高越大。 */
export function stationWearUnit(hpMax: number, level: number, nearFull: boolean): number {
  const t = stationWearLevelT(level)
  const max = Math.max(1, Math.floor(hpMax))
  const ratio = lerp(STATION_WEAR_RATIO_AT_1, STATION_WEAR_RATIO_AT_10, t)
  const flat = lerp(STATION_WEAR_FLAT_AT_1, STATION_WEAR_FLAT_AT_10, t)
  const pip = nearFull ? lerp(STATION_WEAR_PIP_AT_1, STATION_WEAR_PIP_AT_10, t) : 0
  return max * ratio + flat + pip
}

export function stationWearStrengthWord(level: number): string {
  const t = stationWearLevelT(level)
  if (t < 0.34) return '轻微'
  if (t < 0.67) return '加重'
  return '狠'
}

export function stationWearWindow(elapsedS: number): number {
  const t = Number.isFinite(elapsedS) ? Math.max(0, elapsedS) : 0
  return Math.floor(t / STATION_WEAR_REROLL_S)
}

export function stationWearRemainText(elapsedS: number): string {
  const t = Number.isFinite(elapsedS) ? Math.max(0, elapsedS) : 0
  const into = t % STATION_WEAR_REROLL_S
  const remain = into === 0 ? STATION_WEAR_REROLL_S : STATION_WEAR_REROLL_S - into
  const hours = Math.floor(remain / 3600)
  const mins = Math.floor((remain % 3600) / 60)
  if (hours > 0) return `${hours}小时${mins}分后更换`
  return `${mins}分后更换`
}

function hash01(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

function wearHash(save: Save, stationId: StationId, salt: string): number {
  const seed = Number.isFinite(save.rngState) ? save.rngState : 1
  return hash01(`${seed}|${stationId}|${stationWearWindow(save.elapsedS)}|${salt}`)
}

export function rollStationWear(save: Save, stationId: StationId, level: number): StationWearKind[] {
  const count = pickStationWearCount(level, wearHash(save, stationId, 'count'))
  let n = 0
  return pickStationWearKinds(count, () => wearHash(save, stationId, `kind${n++}`))
}

function nearFull(worker: Worker): boolean {
  return worker.hp >= worker.hpMax - 1
}

function crewOf(save: Save, stationId: StationId): Worker[] {
  return save.workers.filter((worker) => worker.assignment === stationId)
}

function scareChance(delta: number): number {
  if (!(delta > 0)) return 0
  return 1 - Math.pow(1 - STATION_WEAR_SCARE_P, delta)
}

function scareRoll(save: Save, stationId: StationId, credited: number): number {
  if (scareOverride) {
    const raw = scareOverride()
    return Number.isFinite(raw) ? Math.min(0.999999, Math.max(0, raw)) : 0
  }
  return wearHash(save, stationId, `scare|${save.elapsedS}|${credited.toFixed(3)}`)
}

export function resetStationWearCycle(save: Save, stationId: StationId): void {
  const station = save.stations[stationId]
  station.wearCredited = 0
  station.wearScareHit = false
}

/** 窗口没变就沿用；过了 8 小时或还没抽过就整站重抽。 */
export function ensureStationWear(save: Save, stationId: StationId): StationWearKind[] {
  const station = save.stations[stationId]
  const window = stationWearWindow(save.elapsedS)
  const current = Array.isArray(station.wearAffixes) ? station.wearAffixes.filter(isStationWearKind) : []
  if (station.wearWindow === window && current.length === (station.wearAffixes?.length ?? 0)) {
    return current
  }
  station.wearAffixes = rollStationWear(save, stationId, station.stationLevel)
  station.wearWindow = window
  resetStationWearCycle(save, stationId)
  return station.wearAffixes
}

/** 测试或读档修正：钉住本窗口的词条，避免和别的随机抢结果。 */
export function pinStationWear(save: Save, stationId: StationId, kinds: readonly StationWearKind[]): void {
  const station = save.stations[stationId]
  const unique: StationWearKind[] = []
  for (const kind of kinds) {
    if (!isStationWearKind(kind) || unique.includes(kind)) continue
    unique.push(kind)
    if (unique.length >= STATION_WEAR_MAX) break
  }
  station.wearAffixes = unique
  station.wearWindow = stationWearWindow(save.elapsedS)
  resetStationWearCycle(save, stationId)
}

function payCrew(save: Save, stationId: StationId, fraction: number, now: number): void {
  if (!(fraction > 0)) return
  const level = save.stations[stationId].stationLevel
  for (const worker of crewOf(save, stationId)) {
    const amount = stationWearUnit(worker.hpMax, level, nearFull(worker)) * fraction
    applyWorkerFatigue(save, stationId, worker, amount, now)
  }
}

/** 制造途中：持续损耗按进度扣，随机惊吓一轮最多一次。 */
export function applyStationWearProgress(save: Save, stationId: StationId, delta: number, now: number): void {
  if (!(delta > 0)) return
  const station = save.stations[stationId]
  const kinds = ensureStationWear(save, stationId)
  const credit = Math.min(delta, Math.max(0, 1 - (station.wearCredited || 0)))
  if (!(credit > 0)) return
  const creditedBefore = station.wearCredited || 0
  if (kinds.includes('dot')) payCrew(save, stationId, credit, now)
  if (kinds.includes('scare') && !station.wearScareHit && crewOf(save, stationId).length > 0) {
    if (scareRoll(save, stationId, creditedBefore) < scareChance(credit)) {
      station.wearScareHit = true
      payCrew(save, stationId, 1, now)
    }
  }
  if (crewOf(save, stationId).length <= 0) {
    resetStationWearCycle(save, stationId)
    return
  }
  station.wearCredited = Math.min(1, creditedBefore + credit)
}

/**
 * 一轮做完。先由调用方出货，这里再扣。
 * 持续损耗补上还没走到的进度；惊吓若这轮还没响，按剩余进度再判一次。
 * 完成后掉只在真的出了货时扣。倒地回营不收回成品。
 */
export function applyStationWearOnComplete(save: Save, stationId: StationId, now: number, produced: boolean): void {
  const station = save.stations[stationId]
  const kinds = ensureStationWear(save, stationId)
  const remain = Math.max(0, 1 - (station.wearCredited || 0))
  if (kinds.includes('dot') && remain > 0) payCrew(save, stationId, remain, now)
  if (kinds.includes('scare') && !station.wearScareHit && remain > 0 && crewOf(save, stationId).length > 0) {
    if (scareRoll(save, stationId, station.wearCredited || 0) < scareChance(remain)) {
      station.wearScareHit = true
      payCrew(save, stationId, 1, now)
    }
  }
  if (produced && kinds.includes('finish') && crewOf(save, stationId).length > 0) {
    payCrew(save, stationId, 1, now)
  }
  resetStationWearCycle(save, stationId)
}

export type StationWearRow = { label: string; detail: string }

export type StationWearView = {
  rows: StationWearRow[]
  strength: string
  remainText: string
  emptyText: string
}

/** 站点详情用。会在窗口到期时重抽。 */
export function stationWearView(save: Save, stationId: StationId): StationWearView {
  const kinds = ensureStationWear(save, stationId)
  return {
    rows: kinds.map((kind) => ({ label: STATION_WEAR_LABEL[kind], detail: STATION_WEAR_DETAIL[kind] })),
    strength: stationWearStrengthWord(save.stations[stationId].stationLevel),
    remainText: stationWearRemainText(save.elapsedS),
    emptyText: '这 8 小时没有掉血词条',
  }
}
