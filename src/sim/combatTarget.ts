import { isStationId, STATION_DEF } from './tables'
import { roll01 } from './rng'
import type {
  CombatFighter,
  EnemyCombat,
  EnemyEncounter,
  EnemyRank,
  EncounterQuality,
  EnemyTargetRuleId,
  Save,
  StationId,
} from './types'

export const ENEMY_TARGET_RULE_IDS = [
  'all',
  'rand1',
  'rand2',
  'rand3',
  'lowestHp',
  'highestHp',
  'workshopBias',
  'frontlineBias',
  'sameStation',
  'cleave2',
] as const satisfies readonly EnemyTargetRuleId[]

export type CombatTargetLane = 'frontline' | 'workshop'

export type CombatTarget = {
  id: string
  label: string
  hp: number
  hpMax: number
  lane: CombatTargetLane
  stationId: StationId | null
}

/** 小兵偏 rand1 / 前线；精英偏 rand2 / 横扫 / 残血；Boss 偶发全体 / 工坊。 */
export const ENEMY_TARGET_RULE_WEIGHTS: Readonly<Record<EnemyRank, Readonly<Partial<Record<EnemyTargetRuleId, number>>>>> =
  {
    minion: { rand1: 3, frontlineBias: 2 },
    elite: { rand2: 2, cleave2: 2, lowestHp: 2 },
    boss: { lowestHp: 4, rand1: 2, all: 1, workshopBias: 1 },
  }

/**
 * 品质加权叠在阶级表上。灰绿蓝走杂兵池、紫橙走精英池；本章 Boss 是 boss 阶。
 * 橙略抬全体，给高品精英一点「砸场」感。
 */
export const ENEMY_TARGET_RULE_QUALITY_WEIGHTS: Readonly<
  Partial<Record<EncounterQuality, Partial<Record<EnemyTargetRuleId, number>>>>
> = {
  orange: { all: 1 },
}

export function isEnemyTargetRuleId(value: unknown): value is EnemyTargetRuleId {
  return typeof value === 'string' && (ENEMY_TARGET_RULE_IDS as readonly string[]).includes(value)
}

export function workshopStationLabel(stationId: StationId | null | undefined): string {
  if (!stationId || !isStationId(stationId)) return '工坊'
  return STATION_DEF[stationId].label
}

export function enemyTargetRuleWeights(
  rank: EnemyRank,
  quality?: EncounterQuality,
): Partial<Record<EnemyTargetRuleId, number>> {
  const base: Partial<Record<EnemyTargetRuleId, number>> = { ...ENEMY_TARGET_RULE_WEIGHTS[rank] }
  const extra = quality ? ENEMY_TARGET_RULE_QUALITY_WEIGHTS[quality] : undefined
  if (!extra) return base
  for (const id of ENEMY_TARGET_RULE_IDS) {
    const add = extra[id]
    if (add) base[id] = (base[id] ?? 0) + add
  }
  return base
}

export function pickWeightedTargetRule(
  weights: Partial<Record<EnemyTargetRuleId, number>>,
  roll: () => number,
): EnemyTargetRuleId {
  const entries = ENEMY_TARGET_RULE_IDS.map((id) => [id, weights[id] ?? 0] as const).filter(([, w]) => w > 0)
  if (!entries.length) return 'rand1'
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let cursor = roll() * total
  for (const [id, weight] of entries) {
    cursor -= weight
    if (cursor < 0) return id
  }
  return entries[entries.length - 1][0]
}

/** 订单钉死规则则不抽；否则按阶级 + 品质权重表抽一次。 */
export function drawEnemyTargetRule(save: Save, enc: EnemyEncounter): EnemyTargetRuleId {
  if (isEnemyTargetRuleId(enc.targetRuleId)) return enc.targetRuleId
  return pickWeightedTargetRule(enemyTargetRuleWeights(enc.enemyRank, enc.quality), () => roll01(save))
}

function hpRatio(target: CombatTarget): number {
  return target.hp / Math.max(1, target.hpMax)
}

function byId(a: CombatTarget, b: CombatTarget): number {
  return a.id.localeCompare(b.id)
}

function ofLane(pool: CombatTarget[], lane: CombatTargetLane): CombatTarget[] {
  return pool.filter((row) => row.lane === lane)
}

function preferLane(pool: CombatTarget[], lane: CombatTargetLane): CombatTarget[] {
  const hit = ofLane(pool, lane)
  return hit.length ? hit : ofLane(pool, lane === 'frontline' ? 'workshop' : 'frontline')
}

export function pickRandomTargets(pool: CombatTarget[], n: number, roll: () => number): CombatTarget[] {
  if (n <= 0 || !pool.length) return []
  if (n >= pool.length) return [...pool]
  const bag = [...pool]
  const out: CombatTarget[] = []
  for (let i = 0; i < n; i++) {
    const idx = Math.min(bag.length - 1, Math.floor(roll() * bag.length))
    out.push(bag.splice(idx, 1)[0])
  }
  return out
}

export function pickLowestHpTarget(pool: CombatTarget[]): CombatTarget | undefined {
  if (!pool.length) return undefined
  return [...pool].sort((a, b) => {
    const ratio = hpRatio(a) - hpRatio(b)
    if (ratio !== 0) return ratio
    if (a.lane !== b.lane) return a.lane === 'frontline' ? -1 : 1
    return byId(a, b)
  })[0]
}

export function pickHighestHpTarget(pool: CombatTarget[]): CombatTarget | undefined {
  if (!pool.length) return undefined
  return [...pool].sort((a, b) => {
    if (a.hp !== b.hp) return b.hp - a.hp
    if (a.lane !== b.lane) return a.lane === 'frontline' ? -1 : 1
    return byId(a, b)
  })[0]
}

function pickSameStation(pool: CombatTarget[], roll: () => number): CombatTarget[] {
  const shop = ofLane(pool, 'workshop')
  if (!shop.length) return pickRandomTargets(ofLane(pool, 'frontline'), 1, roll)
  const first = pickRandomTargets(shop, 1, roll)[0]
  if (!first) return []
  const mate = shop.find((row) => row.id !== first.id && row.stationId === first.stationId)
  return mate ? [first, mate] : [first]
}

function pickCleave2(pool: CombatTarget[], roll: () => number): CombatTarget[] {
  const main = pickLowestHpTarget(pool)
  if (!main) return []
  const splash = pickRandomTargets(
    pool.filter((row) => row.id !== main.id),
    1,
    roll,
  )
  return [main, ...splash]
}

export function applyEnemyTargetRule(
  pool: CombatTarget[],
  ruleId: EnemyTargetRuleId,
  roll: () => number,
): CombatTarget[] {
  switch (ruleId) {
    case 'all':
      return [...pool]
    case 'rand1':
      return pickRandomTargets(pool, 1, roll)
    case 'rand2':
      return pickRandomTargets(pool, 2, roll)
    case 'rand3':
      return pickRandomTargets(pool, 3, roll)
    case 'lowestHp': {
      const hit = pickLowestHpTarget(pool)
      return hit ? [hit] : []
    }
    case 'highestHp': {
      const hit = pickHighestHpTarget(pool)
      return hit ? [hit] : []
    }
    case 'workshopBias':
      return preferLane(pool, 'workshop')
    case 'frontlineBias':
      return preferLane(pool, 'frontline')
    case 'sameStation':
      return pickSameStation(pool, roll)
    case 'cleave2':
      return pickCleave2(pool, roll)
  }
}

function fighterTarget(fighter: CombatFighter): CombatTarget {
  return {
    id: fighter.id,
    label: fighter.label,
    hp: fighter.hp,
    hpMax: fighter.hpMax,
    lane: 'frontline',
    stationId: null,
  }
}

/**
 * 本场出战（战斗快照里仍活着的）+ 当前工坊在岗。
 * 休息中、助战花名册外、已倒下的不进池。
 * 场上没有存活出战工人时整池为空，避免工坊变成敌方目标。
 */
export function collectEnemyTargetPool(save: Save, combat: EnemyCombat): CombatTarget[] {
  const fighting = new Set(combat.workerIds)
  const frontline = combat.workers.filter((fighter) => fighter.hp > 0).map(fighterTarget)
  if (!frontline.length) return []
  const workshop: CombatTarget[] = []
  for (const worker of save.workers) {
    if (worker.guest === true || worker.id.startsWith('assist-')) continue
    if (fighting.has(worker.id)) continue
    const stationId = worker.assignment
    if (!stationId || !isStationId(stationId)) continue
    if (worker.hp <= 0) continue
    workshop.push({
      id: worker.id,
      label: worker.name ?? worker.id,
      hp: worker.hp,
      hpMax: Math.max(1, worker.hpMax),
      lane: 'workshop',
      stationId,
    })
  }
  return [...frontline, ...workshop]
}

export function pickEnemyTargets(
  save: Save,
  combat: EnemyCombat,
  ruleId: EnemyTargetRuleId,
  roll: () => number,
): CombatTarget[] {
  return applyEnemyTargetRule(collectEnemyTargetPool(save, combat), ruleId, roll)
}
