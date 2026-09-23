import { isWorkerInCombat } from './combat'
import { canFuseStationWorkers } from './fuse'
import { isGatherFrozen } from './gather'
import { STATION_IDS } from './tables'
import type { Save, StationId, Worker } from './types'
import { isEmptyHp, isWoundedHp } from './workshopHp'

/** 成功吞吐 / 空转后的检定下限。条件往上加，封顶见 MAX。 */
export const BANTER_CHANCE_MIN = 0.04
export const BANTER_CHANCE_MAX = 0.08
export const BANTER_GLOBAL_COOLDOWN_MIN_S = 45
export const BANTER_GLOBAL_COOLDOWN_MAX_S = 75
export const BANTER_WORKER_COOLDOWN_S = 120
export const BANTER_DUET_CHANCE = 0.3
export const BANTER_DUET_GAP_MIN_MS = 800
export const BANTER_DUET_GAP_MAX_MS = 1200
/** 气泡在工人页上的停留时间。淡入淡出嵌在这段里，不另加。 */
export const BANTER_BUBBLE_MS = 10000

export const BANTER_POOLS = ['gripe', 'fuseWish', 'gossip', 'idle', 'byStation'] as const
export type BanterPool = (typeof BANTER_POOLS)[number]

export type BanterWeightFlags = {
  stalled: boolean
  wounded: boolean
  emptyHp: boolean
  canFuse: boolean
  isNew: boolean
}

export type BanterBeat = {
  workerId: string
  stationId: StationId
  text: string
  delayMs: number
}

export type BanterEvent = {
  stationId: StationId
  kind: 'solo' | 'duet'
  beats: [BanterBeat] | [BanterBeat, BanterBeat]
}

/** 不进存档。只记冷却，避免刷屏，也避免玩法副作用。 */
export type BanterMemory = {
  lastEventS: number
  cooldownS: number
  busyUntilS: number
  workerAt: Record<string, number>
}

export type BanterRng = () => number

const GRIPE = [
  '草怎么采不完……',
  '炉子哼一声血就掉',
  '矿脉恢复中我永久劳损',
  '猎狼还要等冷静',
  '香料炖香的是锅',
  '炼药建议扣灵感',
  '铭刻软失败硬的是脸',
  '空岗100%有人在岗才打折',
  '这一口劳损记在脸上',
  '效率掉了人还在',
] as const

const FUSE_WISH = [
  '隔壁绿的骨架不错拼一下',
  '嫌弃自己的品质',
  '合成声明自愿清醒求变强',
  '先派人来拖我',
  '合成经验相加',
  '你扛伤害我出手数',
  '请把我拖到同品质头上',
  '同档两人醒着升一档',
  '品质卡在这一档',
] as const

const GOSSIP = [
  '休息区血条比进度条满',
  '战斗区又倒了',
  'NEW还亮着',
  '炼金运气好我运气在挖空',
  '骑士升级我们升级劳损',
  '抽人钮金灿灿',
  '派入键往左寿命往右',
  '消息红点比我眼红',
  '顶栏不写劳损',
] as const

const IDLE = [
  '我还在岗吗',
  '进度条动一下今天没白活',
  '订单不吃库存能否躺平',
  '符文一场就没',
  '休息区回血我在回扣',
  '条不动我也算在岗',
  '空转这一分钟先发呆',
  '百分比再跳一下',
] as const

const BY_STATION: Record<StationId, readonly string[]> = {
  herbalism: ['草叶又沾了一手', '这片还没采完', '药香比炉火安静'],
  mining: ['矿脉在喘气，人在等', '镐落下才算一班', '挖空之前先别走'],
  hunting: ['狼还在冷静，人先蹲着', '猎物不看工时', '遇险那下不算休息'],
  cooking: ['锅比人先出香', '这锅熟了再说话', '香味先走，人后走'],
  alchemy: ['瓶里运气，人在旁边', '这一炉别看我脸色', '炼成之前先别许愿'],
  inscription: ['软失败不写在符文上', '一场符文，一场脸', '铭下去就不回头'],
}

/** A 先说，B 隔一拍接。不点名。 */
export const BANTER_DUETS: readonly (readonly [string, string])[] = [
  ['先做完这锅带着香味走', '你是高级材料'],
  ['战场缺人', '工坊也缺'],
  ['词缀不扣草', '残血别抢熟食'],
  ['你扛伤害', '我出手数'],
  ['先把这锅收了', '香味你带着走'],
  ['同品质别装不认识', '拖到我头上再说'],
  ['进度你看着', '血我看着'],
  ['别抢熟食', '残血的先吃'],
]

const SOLO_LINES: Record<Exclude<BanterPool, 'byStation'>, readonly string[]> = {
  gripe: GRIPE,
  fuseWish: FUSE_WISH,
  gossip: GOSSIP,
  idle: IDLE,
}

export function blankBanterMemory(): BanterMemory {
  return { lastEventS: -1, cooldownS: 0, busyUntilS: 0, workerAt: {} }
}

export function blankBanterFlags(): BanterWeightFlags {
  return { stalled: false, wounded: false, emptyHp: false, canFuse: false, isNew: false }
}

/** 基础 4%，空转 / 残血 / 空血 / 可合成 / isNew 各 +1%，封顶 8%。 */
export function banterTriggerChance(flags: BanterWeightFlags): number {
  let chance = BANTER_CHANCE_MIN
  if (flags.stalled) chance += 0.01
  if (flags.wounded) chance += 0.01
  if (flags.emptyHp) chance += 0.01
  if (flags.canFuse) chance += 0.01
  if (flags.isNew) chance += 0.01
  return Math.min(BANTER_CHANCE_MAX, chance)
}

export function poolWeight(pool: BanterPool, flags: BanterWeightFlags): number {
  const base = 10
  if (pool === 'gripe' && (flags.wounded || flags.emptyHp)) return base + 30
  if (pool === 'fuseWish' && flags.canFuse) return base + 30
  if (pool === 'gossip' && flags.isNew) return base + 30
  if (pool === 'idle' && flags.stalled) return base + 30
  return base
}

export function banterPoolWeights(flags: BanterWeightFlags): number[] {
  return BANTER_POOLS.map((pool) => poolWeight(pool, flags))
}

/** 成功吞吐给底权；空转以及血线 / 合成 / 新人再抬。两边都没有则 0。 */
export function stationCandidateWeight(flags: BanterWeightFlags, success: boolean): number {
  if (!success && !flags.stalled) return 0
  let weight = success ? 10 : 0
  if (flags.stalled) weight += 8
  if (flags.wounded) weight += 4
  if (flags.emptyHp) weight += 6
  if (flags.canFuse) weight += 6
  if (flags.isNew) weight += 4
  return weight
}

export function workerBanterWeight(worker: Worker): number {
  let weight = 10
  if (worker.isNew) weight += 20
  if (isEmptyHp(worker)) weight += 20
  else if (isWoundedHp(worker)) weight += 12
  return weight
}

export function pickWeighted(weights: readonly number[], roll: number): number {
  const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0))
  const total = safe.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) return 0
  const t = Math.min(0.999999, Math.max(0, roll))
  let cursor = t * total
  for (let i = 0; i < safe.length; i++) {
    cursor -= safe[i]
    if (cursor < 0) return i
  }
  return safe.length - 1
}

export function pickBanterPool(flags: BanterWeightFlags, roll: number): BanterPool {
  return BANTER_POOLS[pickWeighted(banterPoolWeights(flags), roll)]
}

export function banterLines(pool: BanterPool, stationId: StationId): readonly string[] {
  if (pool === 'byStation') return BY_STATION[stationId]
  return SOLO_LINES[pool]
}

export function rollGlobalCooldownS(roll: number): number {
  const t = Math.min(1, Math.max(0, roll))
  return BANTER_GLOBAL_COOLDOWN_MIN_S + t * (BANTER_GLOBAL_COOLDOWN_MAX_S - BANTER_GLOBAL_COOLDOWN_MIN_S)
}

export function duetGapMs(roll: number): number {
  const t = Math.min(1, Math.max(0, roll))
  return Math.round(BANTER_DUET_GAP_MIN_MS + t * (BANTER_DUET_GAP_MAX_MS - BANTER_DUET_GAP_MIN_MS))
}

function workerReady(memory: BanterMemory, workerId: string, nowS: number): boolean {
  const at = memory.workerAt[workerId]
  if (at == null) return true
  return nowS >= at + BANTER_WORKER_COOLDOWN_S
}

function stationIdle(save: Save, stationId: StationId): boolean {
  if (save.stations[stationId].stallReason != null) return true
  return isGatherFrozen(save, stationId)
}

function flagsOf(save: Save, stationId: StationId, crew: Worker[]): BanterWeightFlags {
  return {
    stalled: stationIdle(save, stationId),
    wounded: crew.some((worker) => isWoundedHp(worker)),
    emptyHp: crew.some((worker) => isEmptyHp(worker)),
    canFuse: canFuseStationWorkers(save, stationId),
    isNew: crew.some((worker) => worker.isNew),
  }
}

function commit(
  memory: BanterMemory,
  nowS: number,
  speakerIds: string[],
  gapMs: number,
  cooldownRoll: number,
): void {
  memory.lastEventS = nowS
  memory.cooldownS = rollGlobalCooldownS(cooldownRoll)
  memory.busyUntilS = nowS + (gapMs + BANTER_BUBBLE_MS) / 1000
  for (const id of speakerIds) memory.workerAt[id] = nowS
}

export type BanterPlan = {
  event: BanterEvent
  /** 写入全局 / 个人冷却。强制招呼确认能上屏后再调用。 */
  apply: () => void
}

/**
 * 一次 tick 最多一条。成功吞吐的站，以及在岗空转的站，先按权重挑一个再做 4%～8% 检定。
 * `forced` 是第一次进工人页那一次：只挑六个生产站上在岗且未战斗的人，跳过检定、全局冷却、个人冷却。
 * 默认立刻写入冷却；`deferCommit` 时只返回计划，由调用方在确认上屏后 `apply`。
 * 不改 save（含 isNew / rngState）。休息区（无派驻）和战斗中的人不说；dragging 时整段跳过。
 * 掷骰顺序：选站 → 检定（forced 跳过）→（两人）对白检定 → 台词 →（对白）间隔 → 全局冷却。
 */
export function planWorkshopBanter(input: {
  save: Save
  nowS: number
  memory: BanterMemory
  dragging: boolean
  successStationIds: readonly StationId[]
  rng: BanterRng
  forced?: boolean
  /** 只在这些站里挑。强制招呼用来限制当前屏上的站。 */
  onlyStationIds?: readonly StationId[]
}): BanterPlan | null {
  const { save, nowS, memory, dragging, successStationIds, rng } = input
  const forced = input.forced === true
  const only = input.onlyStationIds
  if (dragging) return null
  if (!forced && memory.busyUntilS > nowS) return null
  if (!forced && memory.lastEventS >= 0 && nowS < memory.lastEventS + memory.cooldownS) return null

  const succeeded = new Set(successStationIds)
  const candidates: {
    stationId: StationId
    ready: Worker[]
    flags: BanterWeightFlags
    weight: number
  }[] = []

  for (const stationId of STATION_IDS) {
    if (only && !only.includes(stationId)) continue
    const crew = save.workers.filter(
      (worker) => worker.assignment === stationId && !isWorkerInCombat(save, worker.id),
    )
    if (!crew.length) continue
    const stalled = stationIdle(save, stationId)
    const success = succeeded.has(stationId)
    if (!forced && !success && !stalled) continue
    const ready = forced ? crew : crew.filter((worker) => workerReady(memory, worker.id, nowS))
    if (!ready.length) continue
    const flags = flagsOf(save, stationId, crew)
    const weight = stationCandidateWeight(flags, success || forced)
    if (weight <= 0) continue
    candidates.push({ stationId, ready, flags, weight })
  }
  if (!candidates.length) return null

  const picked = candidates[pickWeighted(candidates.map((row) => row.weight), rng())]
  if (!forced && !(rng() < banterTriggerChance(picked.flags))) return null

  const ready = picked.ready
  if (ready.length >= 2 && rng() < BANTER_DUET_CHANCE) {
    const pair = BANTER_DUETS[pickWeighted(BANTER_DUETS.map(() => 1), rng())]
    const gap = duetGapMs(rng())
    const cooldownRoll = rng()
    const left = ready[0]
    const right = ready[1]
    return {
      event: {
        stationId: picked.stationId,
        kind: 'duet',
        beats: [
          { workerId: left.id, stationId: picked.stationId, text: pair[0], delayMs: 0 },
          { workerId: right.id, stationId: picked.stationId, text: pair[1], delayMs: gap },
        ],
      },
      apply: () => commit(memory, nowS, [left.id, right.id], gap, cooldownRoll),
    }
  }

  const speaker = ready.length === 1 ? ready[0] : ready[pickWeighted(ready.map(workerBanterWeight), rng())]
  const pool = pickBanterPool(picked.flags, rng())
  const lines = banterLines(pool, picked.stationId)
  const text = lines[pickWeighted(lines.map(() => 1), rng())]
  const cooldownRoll = rng()
  return {
    event: {
      stationId: picked.stationId,
      kind: 'solo',
      beats: [{ workerId: speaker.id, stationId: picked.stationId, text, delayMs: 0 }],
    },
    apply: () => commit(memory, nowS, [speaker.id], 0, cooldownRoll),
  }
}

export function considerWorkshopBanter(input: {
  save: Save
  nowS: number
  memory: BanterMemory
  dragging: boolean
  successStationIds: readonly StationId[]
  rng: BanterRng
  forced?: boolean
  onlyStationIds?: readonly StationId[]
}): BanterEvent | null {
  const planned = planWorkshopBanter(input)
  if (!planned) return null
  planned.apply()
  return planned.event
}
