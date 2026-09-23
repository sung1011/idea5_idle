import type {
  CombatAttrId,
  CombatStats,
  EncounterNeedMap,
  EnemyCombat,
  EnemyEncounter,
  EnemyTargetRuleId,
  ItemId,
} from './types'

export const DUNGEON_LEGACY_BOSS_ID = 'dungeonWarden'
export const DUNGEON_JAILER_ID = 'dungeonJailer'
export const DUNGEON_BROKER_ID = 'dungeonBroker'
export const DUNGEON_JAILER_LABEL = '深渊狱卒'
export const DUNGEON_BROKER_LABEL = '黑市掮客'
/** 钻单。旧档「地牢看守」迁到这一张。 */
export const DUNGEON_BOSS_ID = DUNGEON_JAILER_ID
export const DUNGEON_BOSS_LABEL = DUNGEON_JAILER_LABEL
export const DUNGEON_BOSS_IDS = [DUNGEON_JAILER_ID, DUNGEON_BROKER_ID] as const
export type DungeonBossId = (typeof DUNGEON_BOSS_IDS)[number]
export type DungeonRewardKind = 'diamonds' | 'gold'
export const DUNGEON_PARTY_MAX = 5
/** 每张地牢单每天 1 次开战。 */
export const DUNGEON_ATTEMPTS_PER_DAY = 1
export const DUNGEON_STUN_S = 3
export const DUNGEON_TIMEOUT_S = 1800
export const DUNGEON_TARGET_ROTATE_S = 18

export const DUNGEON_NEEDS: EncounterNeedMap = { herb: 12, spice: 6, meal: 4, salve: 3 }

export const DUNGEON_AFFIX_FX = {
  thickHideHpMul: 1.4,
  quickenedSpdMul: 0.7,
  heavyHandsAtkMul: 1.45,
  ironShieldBonus: 2,
  jaggedExtra: 4,
  richVeinDiamondMul: 1.5,
  shortStunDelta: -1,
  workshopRageMul: 1.5,
  reinforceDelayMs: 4000,
  dullEdgeDamageMul: 1,
} as const

export const DUNGEON_CHAPTER_FX = {
  hpMulPerChapter: 1.12,
  spdMulPerChapter: 0.97,
  atkMulPerChapter: 1.06,
  shieldFromChapter: 3,
} as const

/** 深渊狱卒：厚血、出手偏慢、攻击略高。 */
export const DUNGEON_JAILER_STATS: CombatStats = { hp: 9600, atk: 6, spd: 5 }
/** 黑市掮客：偏脆、出手更勤、攻击更高。 */
export const DUNGEON_BROKER_STATS: CombatStats = { hp: 6200, atk: 7, spd: 3 }
export const DUNGEON_BOSS_STATS: CombatStats = DUNGEON_JAILER_STATS

export const DUNGEON_AFFIX_IDS = [
  'thickHide',
  'quickened',
  'heavyHands',
  'ironShield',
  'jagged',
  'richVein',
  'shortStun',
  'workshopRage',
  'slowReinforce',
  'dullEdge',
] as const
export type DungeonAffixId = (typeof DUNGEON_AFFIX_IDS)[number]

/** 每张地牢单独立掷的词缀条数。 */
export const DUNGEON_AFFIX_COUNT = 2
export const BATTLEFIELD_AFFIX_COUNT = 1
export type CombatAffixScope = 'dungeon' | 'battlefield'

export function dungeonAffixEffect(id: DungeonAffixId, scope: CombatAffixScope = 'dungeon'): string {
  if (scope === 'battlefield') return battlefieldAffixEffect(id)
  switch (id) {
    case 'thickHide':
      return `开战时本单 Boss 生命 ×${DUNGEON_AFFIX_FX.thickHideHpMul}。只作用于本单。`
    case 'quickened':
      return `开战时本单 Boss 出手间隔 ×${DUNGEON_AFFIX_FX.quickenedSpdMul}（下限 2s）。只作用于本单。`
    case 'heavyHands':
      return `开战时本单 Boss 攻击 ×${DUNGEON_AFFIX_FX.heavyHandsAtkMul}。只作用于本单。`
    case 'ironShield':
      return `每个阶段破防盾 +${DUNGEON_AFFIX_FX.ironShieldBonus}。开战写入，持续整场。只作用于本单。`
    case 'jagged':
      return `本单 Boss 每次打中场上工人额外造成 ${DUNGEON_AFFIX_FX.jaggedExtra} 点伤害。不波及工坊站。只作用于本单。`
    case 'richVein':
      return `领取本单宝箱时，该单货币 ×${DUNGEON_AFFIX_FX.richVeinDiamondMul}（四舍五入）。钻单抬钻石，金单抬金币。`
    case 'shortStun':
      return `破防硬直 ${DUNGEON_STUN_S + DUNGEON_AFFIX_FX.shortStunDelta}s（基准 ${DUNGEON_STUN_S}s ${DUNGEON_AFFIX_FX.shortStunDelta}s）。只作用于本单。`
    case 'workshopRage':
      return `本单 Boss 打中工坊在岗工人的伤害 ×${DUNGEON_AFFIX_FX.workshopRageMul}。不改变对场上工人的伤害。`
    case 'slowReinforce':
      return `增援入场后延迟 ${DUNGEON_AFFIX_FX.reinforceDelayMs / 1000}s 才能出手。开战首发不受影响。只作用于本单。`
    case 'dullEdge':
      return `克制伤害倍率固定 ×${DUNGEON_AFFIX_FX.dullEdgeDamageMul}（按无克制结算），破盾与揭示仍算。只作用于本单。`
  }
}

export function battlefieldAffixEffect(id: DungeonAffixId): string {
  switch (id) {
    case 'thickHide':
      return `开战时该敌生命 ×${DUNGEON_AFFIX_FX.thickHideHpMul}。只作用于本单。`
    case 'quickened':
      return `开战时该敌出手间隔 ×${DUNGEON_AFFIX_FX.quickenedSpdMul}（下限 2s）。只作用于本单。`
    case 'heavyHands':
      return `开战时该敌攻击 ×${DUNGEON_AFFIX_FX.heavyHandsAtkMul}。只作用于本单。`
    case 'ironShield':
      return `破防盾 +${DUNGEON_AFFIX_FX.ironShieldBonus}。开战写入，持续整场。`
    case 'jagged':
      return `该敌每次打中场上工人额外造成 ${DUNGEON_AFFIX_FX.jaggedExtra} 点伤害。不波及工坊站。`
    case 'richVein':
      return `领取战利品时金币或钻石 ×${DUNGEON_AFFIX_FX.richVeinDiamondMul}（四舍五入）。只作用于本单。`
    case 'shortStun':
      return `破防硬直 ${DUNGEON_AFFIX_FX.shortStunDelta}s。只作用于本单。`
    case 'workshopRage':
      return `该敌打中工坊在岗工人的伤害 ×${DUNGEON_AFFIX_FX.workshopRageMul}。不改变对场上工人的伤害。`
    case 'slowReinforce':
      return `增援入场后延迟 ${DUNGEON_AFFIX_FX.reinforceDelayMs / 1000}s 才能出手。开战首发不受影响。`
    case 'dullEdge':
      return `克制伤害倍率固定 ×${DUNGEON_AFFIX_FX.dullEdgeDamageMul}（按无克制结算），破盾与揭示仍算。只作用于本单。`
  }
}

export const DUNGEON_MECHANIC_IDS = ['cleave', 'workshopSmash', 'enrage'] as const
export type DungeonMechanicId = (typeof DUNGEON_MECHANIC_IDS)[number]

export const DUNGEON_MECHANIC_LABEL: Record<DungeonMechanicId, string> = {
  cleave: '横扫',
  workshopSmash: '砸场',
  enrage: '狂暴',
}

export type DungeonPhaseDef = {
  shield: number
  weaknesses: readonly CombatAttrId[]
  mechanic: DungeonMechanicId
  targetRuleId: EnemyTargetRuleId
}

/** 深渊狱卒：砸场 + 工坊目标，盾更厚。 */
export const DUNGEON_JAILER_PHASES: readonly DungeonPhaseDef[] = [
  { shield: 7, weaknesses: ['fire', 'axe', 'wind'], mechanic: 'workshopSmash', targetRuleId: 'workshopBias' },
  { shield: 9, weaknesses: ['ice', 'polearm', 'lightning'], mechanic: 'workshopSmash', targetRuleId: 'sameStation' },
  { shield: 12, weaknesses: ['dark', 'sword', 'bow'], mechanic: 'enrage', targetRuleId: 'workshopBias' },
]

/** 黑市掮客：横扫 + 残血点杀，盾更薄。 */
export const DUNGEON_BROKER_PHASES: readonly DungeonPhaseDef[] = [
  { shield: 4, weaknesses: ['sword', 'bow', 'lightning'], mechanic: 'cleave', targetRuleId: 'cleave2' },
  { shield: 6, weaknesses: ['fire', 'ice', 'axe'], mechanic: 'cleave', targetRuleId: 'lowestHp' },
  { shield: 8, weaknesses: ['dark', 'wind', 'polearm'], mechanic: 'enrage', targetRuleId: 'lowestHp' },
]

export const DUNGEON_PHASES: readonly DungeonPhaseDef[] = DUNGEON_JAILER_PHASES

export const DUNGEON_TARGET_ROTATION: readonly EnemyTargetRuleId[] = [
  'cleave2',
  'workshopBias',
  'sameStation',
  'rand2',
  'lowestHp',
]

export type DungeonChestTier = 'copper' | 'silver' | 'gold'

export type DungeonChestRow = {
  diamonds: number
  gold: number
  items: Readonly<Partial<Record<ItemId, number>>>
}

/** 钻单宝箱。金箱钻石约为旧金箱 22 的 1.8 倍。物品略减。 */
export const DUNGEON_DIAMOND_CHEST: Readonly<Record<DungeonChestTier, DungeonChestRow>> = {
  copper: { diamonds: 12, gold: 0, items: { herb: 3, meal: 1 } },
  silver: { diamonds: 22, gold: 0, items: { herb: 3, meal: 1, salve: 1 } },
  gold: { diamonds: 40, gold: 0, items: { herb: 4, meal: 2, salve: 1 } },
}

/** 金单宝箱底。金箱 100，再随章节略涨。几乎不给钻。 */
export const DUNGEON_GOLD_CHEST: Readonly<Record<DungeonChestTier, DungeonChestRow>> = {
  copper: { diamonds: 0, gold: 40, items: { herb: 2 } },
  silver: { diamonds: 0, gold: 70, items: { herb: 2, meal: 1 } },
  gold: { diamonds: 0, gold: 100, items: { herb: 3, meal: 1 } },
}

export const DUNGEON_GOLD_CHAPTER_STEP = 0.08

/** 旧名指向钻单表，方便对照钻石档。 */
export const DUNGEON_CHEST = DUNGEON_DIAMOND_CHEST

export const DUNGEON_AFFIX_DEFS: Readonly<Record<DungeonAffixId, { label: string; tip: string; effect: string }>> = {
  thickHide: { label: '厚皮', tip: '地牢 Boss 生命更高', effect: dungeonAffixEffect('thickHide') },
  quickened: { label: '迅捷', tip: '地牢 Boss 出手更快', effect: dungeonAffixEffect('quickened') },
  heavyHands: { label: '重击', tip: '地牢 Boss 伤害更高', effect: dungeonAffixEffect('heavyHands') },
  ironShield: { label: '铁盾', tip: '每阶段盾数 +2', effect: dungeonAffixEffect('ironShield') },
  jagged: { label: '尖刺', tip: '工人挨打额外受伤', effect: dungeonAffixEffect('jagged') },
  richVein: { label: '富矿', tip: '本单货币更多', effect: dungeonAffixEffect('richVein') },
  shortStun: { label: '急醒', tip: '破防硬直更短', effect: dungeonAffixEffect('shortStun') },
  workshopRage: { label: '砸场强化', tip: '工坊波及更疼', effect: dungeonAffixEffect('workshopRage') },
  slowReinforce: { label: '迟援', tip: '增援出手更慢', effect: dungeonAffixEffect('slowReinforce') },
  dullEdge: { label: '钝刃', tip: '克制伤害失效', effect: dungeonAffixEffect('dullEdge') },
}

export function isDungeonAffixId(value: unknown): value is DungeonAffixId {
  return typeof value === 'string' && (DUNGEON_AFFIX_IDS as readonly string[]).includes(value)
}

export function rollDungeonAffixes(roll: () => number, count = DUNGEON_AFFIX_COUNT): DungeonAffixId[] {
  const pool = [...DUNGEON_AFFIX_IDS]
  const out: DungeonAffixId[] = []
  const n = Math.max(0, Math.min(pool.length, Math.floor(count)))
  for (let i = 0; i < n && pool.length; i++) {
    const raw = roll()
    const t = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0
    const idx = Math.min(pool.length - 1, Math.floor(t * pool.length))
    out.push(pool.splice(idx, 1)[0])
  }
  return out
}

export function applyCombatAffixStats(stats: CombatStats, affixIds: readonly DungeonAffixId[]): CombatStats {
  let hp = stats.hp
  let atk = stats.atk
  let spd = stats.spd
  if (affixIds.includes('thickHide')) hp = Math.round(hp * DUNGEON_AFFIX_FX.thickHideHpMul)
  if (affixIds.includes('heavyHands')) atk = Math.max(1, Math.round(atk * DUNGEON_AFFIX_FX.heavyHandsAtkMul))
  if (affixIds.includes('quickened')) {
    spd = Math.max(2, Math.round(spd * DUNGEON_AFFIX_FX.quickenedSpdMul * 100) / 100)
  }
  return { hp, atk, spd }
}

export type DungeonBossProfile = {
  id: DungeonBossId
  label: string
  reward: DungeonRewardKind
  stats: CombatStats
  phases: readonly DungeonPhaseDef[]
  /** 增援基准延迟。词缀迟援取更大值。狱卒的迟援味。 */
  reinforceDelayMs: number
  /** 打场上工人的基准额外伤。掮客的尖刺味。 */
  jaggedExtra: number
  /** 工坊伤害基准倍率。狱卒的砸场味。与词缀砸场强化相乘。 */
  workshopMul: number
  /** 克制加成保留比例。1 不削弱；越小越接近钝刃。 */
  counterKeep: number
}

export const DUNGEON_BOSS_DEFS: Readonly<Record<DungeonBossId, DungeonBossProfile>> = {
  dungeonJailer: {
    id: DUNGEON_JAILER_ID,
    label: DUNGEON_JAILER_LABEL,
    reward: 'diamonds',
    stats: DUNGEON_JAILER_STATS,
    phases: DUNGEON_JAILER_PHASES,
    reinforceDelayMs: 2000,
    jaggedExtra: 0,
    workshopMul: 1.25,
    counterKeep: 1,
  },
  dungeonBroker: {
    id: DUNGEON_BROKER_ID,
    label: DUNGEON_BROKER_LABEL,
    reward: 'gold',
    stats: DUNGEON_BROKER_STATS,
    phases: DUNGEON_BROKER_PHASES,
    reinforceDelayMs: 0,
    jaggedExtra: 3,
    workshopMul: 1,
    counterKeep: 0.35,
  },
}

export function isDungeonBossId(value: unknown): value is DungeonBossId {
  return value === DUNGEON_JAILER_ID || value === DUNGEON_BROKER_ID
}

export function dungeonBossProfile(id: unknown): DungeonBossProfile {
  return isDungeonBossId(id) ? DUNGEON_BOSS_DEFS[id] : DUNGEON_BOSS_DEFS[DUNGEON_JAILER_ID]
}

export function dungeonBossReward(id: unknown): DungeonRewardKind {
  return dungeonBossProfile(id).reward
}

export function dungeonPhasesOf(bossId: unknown): readonly DungeonPhaseDef[] {
  return dungeonBossProfile(bossId).phases
}

export function dungeonBossReinforceDelayMs(enc: { id?: unknown; dungeon?: unknown }): number {
  if (!isDungeonEncounter(enc)) return 0
  return dungeonBossProfile(enc.id).reinforceDelayMs
}

export function dungeonBossJaggedExtra(enc: { id?: unknown; dungeon?: unknown }): number {
  if (!isDungeonEncounter(enc)) return 0
  return dungeonBossProfile(enc.id).jaggedExtra
}

export function dungeonBossWorkshopMul(enc: { id?: unknown; dungeon?: unknown }): number {
  if (!isDungeonEncounter(enc)) return 1
  return dungeonBossProfile(enc.id).workshopMul
}

export function dungeonBossCounterKeep(enc: { id?: unknown; dungeon?: unknown }): number {
  if (!isDungeonEncounter(enc)) return 1
  return dungeonBossProfile(enc.id).counterKeep
}

export function dungeonGoldAmount(tier: DungeonChestTier, chapter: unknown): number {
  const base = DUNGEON_GOLD_CHEST[tier].gold
  return Math.round(base * (1 + DUNGEON_GOLD_CHAPTER_STEP * dungeonChapterOffset(chapter)))
}

export function encounterAffixIds(_save: unknown, enc: EnemyEncounter): DungeonAffixId[] {
  if (Array.isArray(enc.affixIds) && enc.affixIds.length) {
    const out: DungeonAffixId[] = []
    for (const id of enc.affixIds) {
      if (isDungeonAffixId(id) && !out.includes(id)) out.push(id)
    }
    if (out.length) return out
  }
  if (isDungeonEncounter(enc)) return []
  return isDungeonAffixId(enc.affixId) ? [enc.affixId] : []
}

export function hasEncounterAffix(save: unknown, enc: EnemyEncounter, id: DungeonAffixId): boolean {
  return encounterAffixIds(save, enc).includes(id)
}

export type DungeonEncounter = EnemyEncounter & { dungeon: true }

export function isDungeonEncounter(
  enc: { kind?: unknown; dungeon?: unknown } | null | undefined,
): enc is DungeonEncounter {
  return !!enc && enc.kind === 'enemy' && enc.dungeon === true
}

export function dungeonPhaseIndex(phase: unknown): number {
  const n = typeof phase === 'number' && Number.isFinite(phase) ? Math.floor(phase) : 1
  return Math.min(DUNGEON_PHASES.length, Math.max(1, n))
}

export function dungeonPhaseDef(phase: unknown, bossId?: unknown): DungeonPhaseDef {
  const phases = dungeonPhasesOf(bossId)
  return phases[dungeonPhaseIndex(phase) - 1]
}

export function dungeonPhaseShield(phase: unknown, bonus = 0, bossId?: unknown): number {
  return dungeonPhaseDef(phase, bossId).shield + Math.max(0, Math.floor(bonus))
}

export function dungeonChapterOffset(chapter: unknown): number {
  const n = typeof chapter === 'number' && Number.isFinite(chapter) ? Math.floor(chapter) : 1
  return Math.max(0, n - 1)
}

export function dungeonChapterScale(chapter: unknown): {
  hpMul: number
  spdMul: number
  atkMul: number
  shield: number
} {
  const n = dungeonChapterOffset(chapter)
  const ch = n + 1
  return {
    hpMul: DUNGEON_CHAPTER_FX.hpMulPerChapter ** n,
    spdMul: DUNGEON_CHAPTER_FX.spdMulPerChapter ** n,
    atkMul: DUNGEON_CHAPTER_FX.atkMulPerChapter ** n,
    shield: ch >= DUNGEON_CHAPTER_FX.shieldFromChapter ? 1 : 0,
  }
}

export function dungeonStunS(hasShortStun: boolean): number {
  return Math.max(1, DUNGEON_STUN_S + (hasShortStun ? DUNGEON_AFFIX_FX.shortStunDelta : 0))
}

export function dungeonChestTier(enc: EnemyEncounter): DungeonChestTier {
  if (enc.combat?.outcome === 'win') return 'gold'
  if ((enc.dungeonPhaseReached ?? 1) >= 2) return 'silver'
  return 'copper'
}

export function applyDungeonPhaseToEncounter(enc: EnemyEncounter, phase: number, at: number): void {
  const def = dungeonPhaseDef(phase, enc.id)
  enc.dungeonPhase = dungeonPhaseIndex(phase)
  enc.dungeonPhaseReached = Math.max(enc.dungeonPhaseReached ?? 1, enc.dungeonPhase)
  enc.dungeonMechanic = def.mechanic
  enc.weaknesses = [...def.weaknesses]
  enc.revealedWeaknesses = []
  enc.targetRuleId = def.targetRuleId
  enc.targetRuleUntil = at + DUNGEON_TARGET_ROTATE_S * 1000
  const bonus = enc.dungeonShieldBonus ?? 0
  const shield = dungeonPhaseShield(enc.dungeonPhase, bonus, enc.id)
  if (enc.combat) {
    enc.combat.shieldMax = shield
    enc.combat.shield = shield
    if (def.mechanic === 'enrage') {
      enc.combat.enemy.atk = Math.max(1, Math.round(enc.combat.enemy.atk * 1.3))
      enc.combat.enemy.spd = Math.max(2, Math.round(enc.combat.enemy.spd * 75) / 100)
    }
  }
}

export function onDungeonBreak(enc: EnemyEncounter, stunS = DUNGEON_STUN_S): number {
  const phase = dungeonPhaseIndex(enc.dungeonPhase)
  if (phase < DUNGEON_PHASES.length) {
    enc.dungeonPendingPhase = true
    enc.dungeonPhase = phase + 1
    enc.dungeonPhaseReached = Math.max(enc.dungeonPhaseReached ?? 1, enc.dungeonPhase)
  }
  return Math.max(1, stunS) * 1000
}

export function onDungeonWake(enc: EnemyEncounter, combat: EnemyCombat, at: number): boolean {
  if (!enc.dungeonPendingPhase) return false
  enc.dungeonPendingPhase = false
  enc.combat = combat
  applyDungeonPhaseToEncounter(enc, dungeonPhaseIndex(enc.dungeonPhase), at)
  combat.stunnedUntil = null
  return true
}

export function rotateDungeonTarget(enc: EnemyEncounter, at: number): void {
  const list = DUNGEON_TARGET_ROTATION
  const cur = enc.targetRuleId
  const i = cur ? list.indexOf(cur) : -1
  enc.targetRuleId = list[(i + 1) % list.length]
  enc.targetRuleUntil = at + DUNGEON_TARGET_ROTATE_S * 1000
}

export function maybeRotateDungeonTarget(enc: EnemyEncounter, at: number): void {
  if (!isDungeonEncounter(enc)) return
  const until = enc.targetRuleUntil
  if (typeof until === 'number' && at < until) return
  rotateDungeonTarget(enc, at)
}

export function makeDungeonEncounter(
  bossId: DungeonBossId = DUNGEON_JAILER_ID,
  affixIds: readonly DungeonAffixId[] = [],
  chapter = 1,
): EnemyEncounter {
  const boss = dungeonBossProfile(bossId)
  const phase = boss.phases[0]
  const diamonds = boss.reward === 'diamonds' ? DUNGEON_DIAMOND_CHEST.gold.diamonds : 0
  const gold = boss.reward === 'gold' ? dungeonGoldAmount('gold', chapter) : 0
  return {
    kind: 'enemy',
    id: boss.id,
    label: boss.label,
    quality: 'orange',
    needs: { ...DUNGEON_NEEDS },
    lootGold: gold,
    lootDiamonds: diamonds,
    departed: false,
    combat: null,
    lootClaimed: false,
    enemyRank: 'boss',
    dungeon: true,
    dungeonPhase: 1,
    dungeonPhaseReached: 1,
    dungeonMechanic: phase.mechanic,
    dungeonPendingPhase: false,
    dungeonShieldBonus: 0,
    weaknesses: [...phase.weaknesses],
    revealedWeaknesses: [],
    targetRuleId: phase.targetRuleId,
    targetRuleUntil: null,
    affixIds: [...affixIds],
  }
}
