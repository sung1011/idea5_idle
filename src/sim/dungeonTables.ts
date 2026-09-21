import type {
  CombatAttrId,
  CombatStats,
  EncounterNeedMap,
  EnemyCombat,
  EnemyEncounter,
  EnemyTargetRuleId,
  ItemId,
} from './types'

export const DUNGEON_BOSS_ID = 'dungeonWarden'
export const DUNGEON_BOSS_LABEL = '地牢看守'
export const DUNGEON_PARTY_MAX = 5
export const DUNGEON_ATTEMPTS_PER_DAY = 1
export const DUNGEON_STUN_S = 3
export const DUNGEON_TIMEOUT_S = 1800
export const DUNGEON_TARGET_ROTATE_S = 18

export const DUNGEON_NEEDS: EncounterNeedMap = { herb: 12, spice: 6, meal: 4, salve: 3 }

export const DUNGEON_DAILY_REFRESH_TIP = '地牢每日自动刷新'

export const DUNGEON_AFFIX_FX = {
  thickHideHpMul: 1.25,
  quickenedSpdMul: 0.8,
  heavyHandsAtkMul: 1.2,
  ironShieldBonus: 1,
  jaggedExtra: 2,
  richVeinDiamondMul: 1.25,
} as const

export const DUNGEON_BOSS_STATS: CombatStats = { hp: 8000, atk: 5, spd: 4 }

export const DUNGEON_AFFIX_IDS = [
  'thickHide',
  'quickened',
  'heavyHands',
  'ironShield',
  'jagged',
  'richVein',
] as const
export type DungeonAffixId = (typeof DUNGEON_AFFIX_IDS)[number]

export function dungeonAffixEffect(id: DungeonAffixId): string {
  switch (id) {
    case 'thickHide':
      return `开战时地牢 Boss 生命 ×${DUNGEON_AFFIX_FX.thickHideHpMul}（基准 ${DUNGEON_BOSS_STATS.hp} → ${Math.round(DUNGEON_BOSS_STATS.hp * DUNGEON_AFFIX_FX.thickHideHpMul)}）。只作用于本日地牢。`
    case 'quickened': {
      const spd = Math.max(2, Math.round(DUNGEON_BOSS_STATS.spd * DUNGEON_AFFIX_FX.quickenedSpdMul * 100) / 100)
      return `开战时地牢 Boss 出手间隔 ×${DUNGEON_AFFIX_FX.quickenedSpdMul}（基准 ${DUNGEON_BOSS_STATS.spd}s → ${spd}s，下限 2s）。只作用于本日地牢。`
    }
    case 'heavyHands':
      return `开战时地牢 Boss 攻击 ×${DUNGEON_AFFIX_FX.heavyHandsAtkMul}（基准 ${DUNGEON_BOSS_STATS.atk} → ${Math.round(DUNGEON_BOSS_STATS.atk * DUNGEON_AFFIX_FX.heavyHandsAtkMul)}）。只作用于本日地牢。`
    case 'ironShield':
      return `每个阶段破防盾 +${DUNGEON_AFFIX_FX.ironShieldBonus}（${DUNGEON_PHASES.map((p) => p.shield).join('/')} → ${DUNGEON_PHASES.map((p) => p.shield + DUNGEON_AFFIX_FX.ironShieldBonus).join('/')}）。开战写入，持续整场。`
    case 'jagged':
      return `地牢 Boss 每次打中场上工人额外造成 ${DUNGEON_AFFIX_FX.jaggedExtra} 点伤害。只作用于本日地牢，不波及工坊站。`
    case 'richVein':
      return `领取宝箱时钻石 ×${DUNGEON_AFFIX_FX.richVeinDiamondMul}（四舍五入）。铜 ${DUNGEON_CHEST.copper.diamonds}→${Math.round(DUNGEON_CHEST.copper.diamonds * DUNGEON_AFFIX_FX.richVeinDiamondMul)}、银 ${DUNGEON_CHEST.silver.diamonds}→${Math.round(DUNGEON_CHEST.silver.diamonds * DUNGEON_AFFIX_FX.richVeinDiamondMul)}、金 ${DUNGEON_CHEST.gold.diamonds}→${Math.round(DUNGEON_CHEST.gold.diamonds * DUNGEON_AFFIX_FX.richVeinDiamondMul)}。`
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

export const DUNGEON_PHASES: readonly DungeonPhaseDef[] = [
  { shield: 5, weaknesses: ['fire', 'sword', 'bow'], mechanic: 'cleave', targetRuleId: 'cleave2' },
  { shield: 7, weaknesses: ['ice', 'polearm', 'lightning'], mechanic: 'workshopSmash', targetRuleId: 'workshopBias' },
  { shield: 9, weaknesses: ['dark', 'axe', 'wind'], mechanic: 'enrage', targetRuleId: 'lowestHp' },
]

export const DUNGEON_TARGET_ROTATION: readonly EnemyTargetRuleId[] = [
  'cleave2',
  'workshopBias',
  'sameStation',
  'rand2',
  'lowestHp',
]

export type DungeonChestTier = 'copper' | 'silver' | 'gold'

export const DUNGEON_CHEST: Readonly<
  Record<DungeonChestTier, { diamonds: number; items: Readonly<Partial<Record<ItemId, number>>> }>
> = {
  copper: { diamonds: 8, items: { herb: 4, meal: 1 } },
  silver: { diamonds: 14, items: { herb: 4, meal: 2, salve: 1 } },
  gold: { diamonds: 22, items: { herb: 6, meal: 3, salve: 2 } },
}

export const DUNGEON_AFFIX_DEFS: Readonly<Record<DungeonAffixId, { label: string; tip: string; effect: string }>> = {
  thickHide: { label: '厚皮', tip: '地牢 Boss 生命更高', effect: dungeonAffixEffect('thickHide') },
  quickened: { label: '迅捷', tip: '地牢 Boss 出手更快', effect: dungeonAffixEffect('quickened') },
  heavyHands: { label: '重击', tip: '地牢 Boss 伤害更高', effect: dungeonAffixEffect('heavyHands') },
  ironShield: { label: '铁盾', tip: '每阶段盾数 +1', effect: dungeonAffixEffect('ironShield') },
  jagged: { label: '尖刺', tip: '工人挨打额外受伤', effect: dungeonAffixEffect('jagged') },
  richVein: { label: '富矿', tip: '宝箱钻石更多', effect: dungeonAffixEffect('richVein') },
}

export function isDungeonAffixId(value: unknown): value is DungeonAffixId {
  return typeof value === 'string' && (DUNGEON_AFFIX_IDS as readonly string[]).includes(value)
}

export function rollDungeonAffixes(roll: () => number): DungeonAffixId[] {
  const pool = [...DUNGEON_AFFIX_IDS]
  const out: DungeonAffixId[] = []
  for (let n = 0; n < 2 && pool.length; n++) {
    const raw = roll()
    const t = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0
    const i = Math.min(pool.length - 1, Math.floor(t * pool.length))
    out.push(pool.splice(i, 1)[0])
  }
  return out
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

export function dungeonPhaseDef(phase: unknown): DungeonPhaseDef {
  return DUNGEON_PHASES[dungeonPhaseIndex(phase) - 1]
}

export function dungeonPhaseShield(phase: unknown, bonus = 0): number {
  return dungeonPhaseDef(phase).shield + Math.max(0, Math.floor(bonus))
}

export function dungeonChestTier(enc: EnemyEncounter): DungeonChestTier {
  if (enc.combat?.outcome === 'win') return 'gold'
  if ((enc.dungeonPhaseReached ?? 1) >= 2) return 'silver'
  return 'copper'
}

export function applyDungeonPhaseToEncounter(enc: EnemyEncounter, phase: number, at: number): void {
  const def = dungeonPhaseDef(phase)
  enc.dungeonPhase = dungeonPhaseIndex(phase)
  enc.dungeonPhaseReached = Math.max(enc.dungeonPhaseReached ?? 1, enc.dungeonPhase)
  enc.dungeonMechanic = def.mechanic
  enc.weaknesses = [...def.weaknesses]
  enc.revealedWeaknesses = []
  enc.targetRuleId = def.targetRuleId
  enc.targetRuleUntil = at + DUNGEON_TARGET_ROTATE_S * 1000
  const bonus = enc.dungeonShieldBonus ?? 0
  const shield = dungeonPhaseShield(enc.dungeonPhase, bonus)
  if (enc.combat) {
    enc.combat.shieldMax = shield
    enc.combat.shield = shield
    if (def.mechanic === 'enrage') {
      enc.combat.enemy.atk = Math.max(1, Math.round(enc.combat.enemy.atk * 1.3))
      enc.combat.enemy.spd = Math.max(2, Math.round(enc.combat.enemy.spd * 75) / 100)
    }
  }
}

export function onDungeonBreak(enc: EnemyEncounter): number {
  const phase = dungeonPhaseIndex(enc.dungeonPhase)
  if (phase < DUNGEON_PHASES.length) {
    enc.dungeonPendingPhase = true
    enc.dungeonPhase = phase + 1
    enc.dungeonPhaseReached = Math.max(enc.dungeonPhaseReached ?? 1, enc.dungeonPhase)
  }
  return DUNGEON_STUN_S * 1000
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

export function makeDungeonEncounter(): EnemyEncounter {
  const phase = DUNGEON_PHASES[0]
  return {
    kind: 'enemy',
    id: DUNGEON_BOSS_ID,
    label: DUNGEON_BOSS_LABEL,
    quality: 'orange',
    needs: { ...DUNGEON_NEEDS },
    lootGold: 0,
    lootDiamonds: DUNGEON_CHEST.gold.diamonds,
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
  }
}
