import { QUALITY_MAX, QUALITY_MIN } from './tables'
import type { Save, StationId, TreasureMine, Worker, WorkerRaceId } from './types'

/** 稀有种族更强的分档。开局三族 base，橙合 rare，粉/红/金链 epic。 */
export type RaceTalentTier = 'base' | 'rare' | 'epic'

/** 各族一条独特效果。选人按当前玩法相关 effect 优先，不再写死三大类。 */
export type RaceTalentEffectId =
  | 'beastFirstHit'
  | 'treasureExtraOre'
  | 'herbStamina'
  | 'killHeal'
  | 'marketPayout'
  | 'workshopFatigue'
  | 'campMeal'
  | 'runeCombat'
  | 'herbCrashTaken'
  | 'beastPhaseExtra'
  | 'treasureJewel'
  | 'herbDayVault'
  | 'breakWindow'
  | 'workshopExtra'
  | 'combatAtk'
  | 'combatInterval'
  | 'beastHpMax'
  | 'treasureInterval'
  | 'herbWeedTime'
  | 'treasureCrystal'

export type RaceTalentScene = 'herb' | 'beast' | 'battlefield' | 'treasure'

/**
 * 白档(1) 乘区 1，彩档(10) 乘区 1+SPAN。
 * SPAN=1 即彩色大约是白色的 2 倍。
 */
export const RACE_TALENT_QUALITY_SPAN = 1

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
  effectId: RaceTalentEffectId
  icon: string
  tier: RaceTalentTier
  /** 白品质基准。减益类是减少比例，增益类是增加比例或额外概率。 */
  base: number
  /**
   * 第二条白档基准。龙希尔：攻击间隔减少。
   * 文案用 `{pct2}`。
   */
  extraBase?: number
  /** 玩家短说明。`{pct}` / `{pct2}` 换成当前品质实际百分数。 */
  copy: string
}

export type RaceTalentView = {
  icon: string
  text: string
  effectId: RaceTalentEffectId
}

export const RACE_TALENT_SCENE_EFFECTS: Readonly<Record<RaceTalentScene, readonly RaceTalentEffectId[]>> = {
  herb: ['herbStamina', 'herbCrashTaken', 'herbDayVault', 'herbWeedTime'],
  beast: ['beastFirstHit', 'killHeal', 'beastPhaseExtra', 'beastHpMax'],
  battlefield: ['killHeal', 'runeCombat', 'breakWindow', 'combatAtk', 'combatInterval'],
  treasure: ['treasureExtraOre', 'treasureJewel', 'treasureInterval', 'treasureCrystal', 'runeCombat'],
}

const CUT_EFFECTS = new Set<RaceTalentEffectId>([
  'herbStamina',
  'workshopFatigue',
  'herbCrashTaken',
  'combatInterval',
  'treasureInterval',
  'herbWeedTime',
])

export const RACE_TALENT_BY_RACE: Readonly<Record<WorkerRaceId, RaceTalentDef>> = {
  orc: {
    race: 'orc',
    effectId: 'beastFirstHit',
    icon: '🐗',
    tier: 'base',
    base: 0.25,
    copy: '困兽开战首击伤害 +{pct}',
  },
  troll: {
    race: 'troll',
    effectId: 'treasureExtraOre',
    icon: '💎',
    tier: 'base',
    base: 0.15,
    copy: '夺宝每挖一下额外 {pct} 概率多 1 矿',
  },
  tauren: {
    race: 'tauren',
    effectId: 'herbStamina',
    icon: '🌿',
    tier: 'base',
    base: 0.25,
    copy: '割草体力消耗 −{pct}',
  },
  bloodElf: {
    race: 'bloodElf',
    effectId: 'killHeal',
    icon: '💖',
    tier: 'rare',
    base: 0.08,
    copy: '战场 / 困兽击杀回 {pct} 生命',
  },
  goblin: {
    race: 'goblin',
    effectId: 'marketPayout',
    icon: '💰',
    tier: 'rare',
    base: 0.12,
    copy: '商场订单结算金钻 +{pct}',
  },
  forsaken: {
    race: 'forsaken',
    effectId: 'workshopFatigue',
    icon: '🧪',
    tier: 'rare',
    base: 0.3,
    copy: '工坊在岗掉血 −{pct}',
  },
  pandaren: {
    race: 'pandaren',
    effectId: 'campMeal',
    icon: '🍜',
    tier: 'rare',
    base: 0.2,
    copy: '回营吃饭效果 +{pct}',
  },
  nightborne: {
    race: 'nightborne',
    effectId: 'runeCombat',
    icon: '✨',
    tier: 'rare',
    base: 0.15,
    copy: '符文战斗效果 +{pct}',
  },
  vulpera: {
    race: 'vulpera',
    effectId: 'herbCrashTaken',
    icon: '🦊',
    tier: 'rare',
    base: 0.15,
    copy: '割草撞车受伤 −{pct}',
  },
  magharOrc: {
    race: 'magharOrc',
    effectId: 'beastPhaseExtra',
    icon: '🐗',
    tier: 'epic',
    base: 0.12,
    copy: '困兽阶段奖励多抽一次概率 +{pct}',
  },
  zandalariTroll: {
    race: 'zandalariTroll',
    effectId: 'treasureJewel',
    icon: '💎',
    tier: 'epic',
    base: 0.18,
    copy: '夺宝珠宝掉率 +{pct}',
  },
  highmountainTauren: {
    race: 'highmountainTauren',
    effectId: 'herbDayVault',
    icon: '🌿',
    tier: 'epic',
    base: 0.15,
    copy: '割草日结宝库奖励 +{pct}',
  },
  voidElf: {
    race: 'voidElf',
    effectId: 'breakWindow',
    icon: '⚔️',
    tier: 'epic',
    base: 0.2,
    copy: '战场破招窗口 +{pct}',
  },
  earthen: {
    race: 'earthen',
    effectId: 'workshopExtra',
    icon: '🪨',
    tier: 'epic',
    base: 0.12,
    copy: '工坊一轮产出 +1 概率 +{pct}',
  },
  dracthyr: {
    race: 'dracthyr',
    effectId: 'combatAtk',
    icon: '🐉',
    tier: 'epic',
    base: 0.12,
    extraBase: 0.08,
    copy: '战场攻击 +{pct}，攻击间隔 −{pct2}',
  },
  ogre: {
    race: 'ogre',
    effectId: 'beastHpMax',
    icon: '🛡️',
    tier: 'epic',
    base: 0.2,
    copy: '困兽（作己方）最大生命 +{pct}',
  },
  centaur: {
    race: 'centaur',
    effectId: 'combatInterval',
    icon: '🐎',
    tier: 'epic',
    base: 0.12,
    copy: '战场攻击间隔 −{pct}',
  },
  naga: {
    race: 'naga',
    effectId: 'treasureInterval',
    icon: '🌊',
    tier: 'epic',
    base: 0.18,
    copy: '夺宝挖矿间隔 −{pct}',
  },
  murloc: {
    race: 'murloc',
    effectId: 'herbWeedTime',
    icon: '🐟',
    tier: 'epic',
    base: 0.25,
    copy: '割草除草耗时 −{pct}',
  },
  kobold: {
    race: 'kobold',
    effectId: 'treasureCrystal',
    icon: '💎',
    tier: 'epic',
    base: 0.2,
    copy: '夺宝荒晶掉率 +{pct}',
  },
}

type TalentFace = Pick<Worker, 'race' | 'qualityTier'>

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

function faceOf(worker?: TalentFace | null): TalentFace | null {
  if (!worker || worker.race == null) return null
  return worker
}

export function raceTalentBonus(worker: TalentFace | null | undefined, effectId: RaceTalentEffectId): number {
  const face = faceOf(worker)
  if (!face) return 0
  const def = raceTalentOf(face.race)
  if (!def || def.effectId !== effectId) return 0
  if (CUT_EFFECTS.has(effectId)) return raceTalentReduction(def.base, face.qualityTier, def.tier)
  return raceTalentScaledValue(def.base, face.qualityTier, def.tier)
}

export function raceTalentExtraBonus(worker: TalentFace | null | undefined, effectId: RaceTalentEffectId): number {
  const face = faceOf(worker)
  if (!face) return 0
  const def = raceTalentOf(face.race)
  if (!def || def.effectId !== effectId || def.extraBase == null) return 0
  return raceTalentReduction(def.extraBase, face.qualityTier, def.tier)
}

function bestBonus(workers: readonly TalentFace[], effectId: RaceTalentEffectId): number {
  let best = 0
  for (const worker of workers) {
    const value = raceTalentBonus(worker, effectId)
    if (value > best) best = value
  }
  return best
}

export function rosterTalentBonus(save: Pick<Save, 'workers'> | undefined, effectId: RaceTalentEffectId): number {
  if (!save?.workers?.length) return 0
  return bestBonus(save.workers, effectId)
}

export function assignedTalentBonus(
  save: Pick<Save, 'workers'> | undefined,
  stationId: StationId,
  effectId: RaceTalentEffectId,
): number {
  if (!save?.workers?.length) return 0
  return bestBonus(
    save.workers.filter((worker) => worker.assignment === stationId),
    effectId,
  )
}

export function crewTalentBonus(
  save: Pick<Save, 'workers'> | undefined,
  mine: Pick<TreasureMine, 'crewIds'> | undefined,
  effectId: RaceTalentEffectId,
): number {
  if (!save?.workers?.length || !mine?.crewIds?.length) return 0
  const crew: TalentFace[] = []
  for (const id of mine.crewIds) {
    const worker = save.workers.find((row) => row.id === id)
    if (worker) crew.push(worker)
  }
  return bestBonus(crew, effectId)
}

export function fightTalentBonus(
  save: Pick<Save, 'workers'> | undefined,
  fighterIds: readonly string[] | undefined,
  effectId: RaceTalentEffectId,
): number {
  if (!save?.workers?.length || !fighterIds?.length) return 0
  const party: TalentFace[] = []
  for (const id of fighterIds) {
    const worker = save.workers.find((row) => row.id === id)
    if (worker) party.push(worker)
  }
  return bestBonus(party, effectId)
}

export function herbStaminaCut(worker?: TalentFace | null): number {
  return raceTalentBonus(worker, 'herbStamina')
}

export function herbWeedTimeCut(worker?: TalentFace | null): number {
  return raceTalentBonus(worker, 'herbWeedTime')
}

export function herbCrashTakenCut(worker?: TalentFace | null): number {
  return raceTalentBonus(worker, 'herbCrashTaken')
}

export function applyHerbCrashTaken(damage: number, worker?: TalentFace | null): number {
  const cut = herbCrashTakenCut(worker)
  if (!cut || !Number.isFinite(damage) || damage <= 0) return damage
  return Math.max(1, Math.round(damage * (1 - cut)))
}

export function applyCombatAtk(atk: number, worker?: TalentFace | null): number {
  const bonus = raceTalentBonus(worker, 'combatAtk')
  if (!bonus || !Number.isFinite(atk) || atk <= 0) return atk
  return Math.max(1, Math.round(atk * (1 + bonus)))
}

export function combatIntervalCut(worker?: TalentFace | null): number {
  const own = raceTalentBonus(worker, 'combatInterval')
  const extra = raceTalentExtraBonus(worker, 'combatAtk')
  return Math.min(RACE_TALENT_REDUCTION_CAP, Math.max(own, extra))
}

export function applyCombatInterval(intervalS: number, worker?: TalentFace | null): number {
  const cut = combatIntervalCut(worker)
  if (!cut || !Number.isFinite(intervalS) || intervalS <= 0) return intervalS
  return Math.max(0.01, intervalS * (1 - cut))
}

export function applyBeastFirstHit(damage: number, worker?: TalentFace | null): number {
  const bonus = raceTalentBonus(worker, 'beastFirstHit')
  if (!bonus || !Number.isFinite(damage) || damage <= 0) return damage
  return Math.max(1, Math.round(damage * (1 + bonus)))
}

export function applyBeastHpMax(hp: number, worker?: TalentFace | null): number {
  const bonus = raceTalentBonus(worker, 'beastHpMax')
  if (!bonus || !Number.isFinite(hp) || hp <= 0) return hp
  return Math.max(1, Math.round(hp * (1 + bonus)))
}

export function applyTreasureMineInterval(intervalS: number, worker?: TalentFace | null): number {
  const cut = raceTalentBonus(worker, 'treasureInterval')
  if (!cut || !Number.isFinite(intervalS) || intervalS <= 0) return intervalS
  return Math.max(RACE_TALENT_MINE_INTERVAL_FLOOR_S, intervalS * (1 - cut))
}

export function applyWorkshopFatigue(amount: number, worker?: TalentFace | null): number {
  const cut = raceTalentBonus(worker, 'workshopFatigue')
  if (!cut || !Number.isFinite(amount) || amount <= 0) return amount
  return amount * (1 - cut)
}

export function applyKillHeal(hp: number, hpMax: number, worker?: TalentFace | null): number {
  const bonus = raceTalentBonus(worker, 'killHeal')
  if (!bonus || !(hp > 0) || !(hpMax > 0)) return hp
  const heal = Math.max(1, Math.round(hpMax * bonus))
  return Math.min(hpMax, hp + heal)
}

export function applyCampMealMul(base: number, worker?: TalentFace | null): number {
  const bonus = raceTalentBonus(worker, 'campMeal')
  if (!bonus || !Number.isFinite(base) || base <= 0) return base
  return base * (1 + bonus)
}

export function applyRuneCombatMul(base: number, identity: number, worker?: TalentFace | null): number {
  const bonus = raceTalentBonus(worker, 'runeCombat')
  if (!bonus || !Number.isFinite(base)) return base
  if (base === identity) return base
  if (base > identity) return identity + (base - identity) * (1 + bonus)
  const cut = Math.min(RACE_TALENT_REDUCTION_CAP, (identity - base) * (1 + bonus))
  return identity - cut
}

export function applyBreakWindow(stunMs: number, worker?: TalentFace | null): number {
  const bonus = raceTalentBonus(worker, 'breakWindow')
  if (!bonus || !Number.isFinite(stunMs) || stunMs <= 0) return stunMs
  return Math.max(1, Math.round(stunMs * (1 + bonus)))
}

export function applyPayoutMul(qty: number, mul: number): number {
  if (!Number.isFinite(qty) || qty <= 0) return qty
  const n = Number.isFinite(mul) && mul > 0 ? mul : 1
  if (n === 1) return qty
  return Math.max(0, Math.round(qty * n))
}

export function applyMarketPayout(
  payout: { gold: number; diamonds: number },
  save?: Pick<Save, 'workers'>,
): { gold: number; diamonds: number } {
  const mul = 1 + rosterTalentBonus(save, 'marketPayout')
  if (mul === 1) return payout
  return {
    gold: applyPayoutMul(payout.gold, mul),
    diamonds: applyPayoutMul(payout.diamonds, mul),
  }
}

export function applyHerbDayVault(qty: number, save?: Pick<Save, 'workers'>): number {
  return applyPayoutMul(qty, 1 + rosterTalentBonus(save, 'herbDayVault'))
}

export function raceTalentPctLabel(value: number): string {
  return `${Math.round(value * 100)}%`
}

function fillCopy(template: string, pct: string, pct2?: string): string {
  return template.replaceAll('{pct}', pct).replaceAll('{pct2}', pct2 ?? pct)
}

function displayedValue(def: RaceTalentDef, qualityTier: number, extra = false): number {
  const base = extra ? def.extraBase : def.base
  if (base == null) return 0
  const effectId = extra && def.effectId === 'combatAtk' ? 'combatInterval' : def.effectId
  if (CUT_EFFECTS.has(effectId)) return raceTalentReduction(base, qualityTier, def.tier)
  return raceTalentScaledValue(base, qualityTier, def.tier)
}

/** 玩家可见短说明，带当前品质的实际数字。 */
export function bestOwnedQuality(save: Pick<Save, 'workers'>, race: WorkerRaceId): number {
  let best: number = QUALITY_MIN
  for (const worker of save.workers) {
    if (worker.race === race && worker.qualityTier > best) best = worker.qualityTier
  }
  return best
}

export function raceTalentCopy(def: RaceTalentDef, qualityTier: number = QUALITY_MIN): string {
  const pct = raceTalentPctLabel(displayedValue(def, qualityTier))
  const pct2 = def.extraBase != null ? raceTalentPctLabel(displayedValue(def, qualityTier, true)) : undefined
  return fillCopy(def.copy, pct, pct2)
}

export function workerRaceTalentView(worker: TalentFace): RaceTalentView | null {
  const def = raceTalentOf(worker.race)
  if (!def) return null
  return { icon: def.icon, text: raceTalentCopy(def, worker.qualityTier), effectId: def.effectId }
}

export function raceTalentMark(worker: TalentFace): string | null {
  const view = workerRaceTalentView(worker)
  return view ? `${view.icon} ${view.text}` : null
}

export function workerMatchesTalentEffects(
  worker: { race?: unknown },
  effects: readonly RaceTalentEffectId[] | null | undefined,
): boolean {
  if (!effects?.length) return false
  const def = raceTalentOf(worker.race)
  if (!def) return false
  return effects.includes(def.effectId)
}

export function workerMatchesTalentScene(
  worker: { race?: unknown },
  scene: RaceTalentScene | null | undefined,
): boolean {
  if (!scene) return false
  return workerMatchesTalentEffects(worker, RACE_TALENT_SCENE_EFFECTS[scene])
}

/** 当前玩法相关 effect 排前面，两组内部都保持原顺序。 */
export function orderPickByTalent<T extends { race?: unknown }>(
  workers: readonly T[],
  effects: readonly RaceTalentEffectId[] | RaceTalentScene | null | undefined,
): T[] {
  const list: readonly RaceTalentEffectId[] | null =
    typeof effects === 'string' ? RACE_TALENT_SCENE_EFFECTS[effects] : (effects ?? null)
  if (!list?.length) return [...workers]
  return workers
    .map((worker, index) => ({
      worker,
      index,
      rank: workerMatchesTalentEffects(worker, list) ? 0 : 1,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.worker)
}
