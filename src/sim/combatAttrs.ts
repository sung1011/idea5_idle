import { roll01 } from './rng'
import type {
  CombatAttrId,
  EnemyEncounter,
  EnemyRank,
  EncounterPower,
  EncounterQuality,
  QualityTier,
  Save,
  Worker,
} from './types'

/** 物理 6 + 元素 6。同工人不重复。 */
export const COMBAT_ATTR_IDS = [
  'sword',
  'polearm',
  'dagger',
  'axe',
  'bow',
  'staff',
  'fire',
  'ice',
  'lightning',
  'wind',
  'light',
  'dark',
] as const satisfies readonly CombatAttrId[]

export const COMBAT_ATTR_LABEL: Record<CombatAttrId, string> = {
  sword: '剑',
  polearm: '枪',
  dagger: '匕首',
  axe: '斧',
  bow: '弓',
  staff: '杖',
  fire: '火',
  ice: '冰',
  lightning: '雷',
  wind: '风',
  light: '光',
  dark: '暗',
}

export const COMBAT_ATTR_KIND: Record<CombatAttrId, 'physical' | 'elemental'> = {
  sword: 'physical',
  polearm: 'physical',
  dagger: 'physical',
  axe: 'physical',
  bow: 'physical',
  staff: 'physical',
  fire: 'elemental',
  ice: 'elemental',
  lightning: 'elemental',
  wind: 'elemental',
  light: 'elemental',
  dark: 'elemental',
}

export const ENEMY_RANKS = ['minion', 'elite', 'boss'] as const satisfies readonly EnemyRank[]

export const ENEMY_RANK_LABEL: Record<EnemyRank, string> = {
  minion: '杂兵',
  elite: '精英',
  boss: '首领',
}

/** 杂兵 2～3；精英 / 首领 3～4。 */
export const ENEMY_WEAKNESS_COUNT: Readonly<Record<EnemyRank, { min: number; max: number }>> = {
  minion: { min: 2, max: 3 },
  elite: { min: 3, max: 4 },
  boss: { min: 3, max: 4 },
}

/**
 * 弱+绿蓝灰 → 杂兵；强或紫 → 精英；橙 → 首领。
 * 只决定弱点条数区间，不改 HP / ATK 表。
 */
export function enemyRankFor(power: EncounterPower, quality: EncounterQuality): EnemyRank {
  if (quality === 'orange') return 'boss'
  if (power === 'strong' || quality === 'purple') return 'elite'
  return 'minion'
}

export function isCombatAttrId(value: unknown): value is CombatAttrId {
  return typeof value === 'string' && (COMBAT_ATTR_IDS as readonly string[]).includes(value)
}

export function isEnemyRank(value: unknown): value is EnemyRank {
  return value === 'minion' || value === 'elite' || value === 'boss'
}

/** 槽 1 品质 ≥2；槽 2 品质 ≥5。白档 0。 */
export function combatAttrSlotCount(qualityTier: QualityTier): 0 | 1 | 2 {
  if (qualityTier >= 5) return 2
  if (qualityTier >= 2) return 1
  return 0
}

export function uniqueCombatAttrs(raw: unknown): CombatAttrId[] {
  if (!Array.isArray(raw)) return []
  const out: CombatAttrId[] = []
  const seen = new Set<CombatAttrId>()
  for (const row of raw) {
    if (!isCombatAttrId(row) || seen.has(row)) continue
    seen.add(row)
    out.push(row)
  }
  return out
}

export function pickDistinctAttrs(
  count: number,
  roll: () => number,
  exclude: readonly CombatAttrId[] = [],
): CombatAttrId[] {
  const used = new Set(exclude)
  const out: CombatAttrId[] = []
  const n = Math.max(0, Math.floor(count))
  for (let i = 0; i < n; i++) {
    const pool = COMBAT_ATTR_IDS.filter((id) => !used.has(id))
    if (!pool.length) break
    const idx = Math.min(pool.length - 1, Math.max(0, Math.floor(roll() * pool.length)))
    const id = pool[idx]
    used.add(id)
    out.push(id)
  }
  return out
}

export function fillWorkerCombatAttrs(worker: Worker, roll: () => number): Worker {
  const slots = combatAttrSlotCount(worker.qualityTier)
  const kept = uniqueCombatAttrs(worker.combatAttrs).slice(0, slots)
  if (kept.length < slots) {
    kept.push(...pickDistinctAttrs(slots - kept.length, roll, kept))
  }
  worker.combatAttrs = kept
  return worker
}

export function roll01Bag(seed: number): () => number {
  const bag = { rngState: seed >>> 0 || 1 }
  return () => roll01(bag as Save)
}

export function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0 || 1
}

/** 旧档缺字段：按品质开槽掷点。白档空数组。已有属性保留，只补空槽。 */
export function hydrateWorkerCombatAttrs(worker: Worker, raw: unknown): Worker {
  worker.combatAttrs = uniqueCombatAttrs(raw)
  return fillWorkerCombatAttrs(worker, roll01Bag(hashString(`${worker.id}:${worker.qualityTier}`)))
}

export function spawnFillCombatAttrs(save: Save, worker: Worker): Worker {
  return fillWorkerCombatAttrs(worker, () => roll01(save))
}

export function matchingWeaknesses(
  attrs: readonly CombatAttrId[],
  weaknesses: readonly CombatAttrId[],
): CombatAttrId[] {
  const weak = new Set(weaknesses)
  const out: CombatAttrId[] = []
  const seen = new Set<CombatAttrId>()
  for (const id of attrs) {
    if (!weak.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** 只按「这一个」工人命中数：0 → ×1，1 → ×1.2，2 → ×1.5。两人属性不合并。 */
export function weaknessDamageMul(hitCount: number): number {
  if (hitCount >= 2) return 1.5
  if (hitCount >= 1) return 1.2
  return 1
}

export function scaledAttackDamage(atk: number, mul: number): number {
  const base = Number.isFinite(atk) && atk > 0 ? atk : 1
  const factor = Number.isFinite(mul) && mul > 0 ? mul : 1
  return Math.max(1, Math.round(base * factor))
}

export function revealMatchedWeaknesses(
  enc: EnemyEncounter,
  matched: readonly CombatAttrId[],
): CombatAttrId[] {
  if (!Array.isArray(enc.revealedWeaknesses)) enc.revealedWeaknesses = []
  const have = new Set(enc.revealedWeaknesses)
  const newly: CombatAttrId[] = []
  const trueSet = new Set(enc.weaknesses ?? [])
  for (const id of matched) {
    if (!trueSet.has(id) || have.has(id)) continue
    have.add(id)
    enc.revealedWeaknesses.push(id)
    newly.push(id)
  }
  return newly
}

export function resolveWorkerAttack(
  enc: EnemyEncounter,
  attrs: readonly CombatAttrId[],
  atk: number,
): { damage: number; mul: number; hits: CombatAttrId[]; newlyRevealed: CombatAttrId[] } {
  const hits = matchingWeaknesses(attrs, enc.weaknesses ?? [])
  const newlyRevealed = revealMatchedWeaknesses(enc, hits)
  const mul = weaknessDamageMul(hits.length)
  return { damage: scaledAttackDamage(atk, mul), mul, hits, newlyRevealed }
}

export function pickEnemyWeaknessCount(rank: EnemyRank, seed: number, slot: number): number {
  const { min, max } = ENEMY_WEAKNESS_COUNT[rank]
  return min + ((seed + slot * 13) % (max - min + 1))
}

export function pickEnemyWeaknesses(seed: number, slot: number, rank: EnemyRank): CombatAttrId[] {
  const count = pickEnemyWeaknessCount(rank, seed, slot)
  const out: CombatAttrId[] = []
  const used = new Set<number>()
  for (let i = 0; i < count; i++) {
    let idx = (seed * 3 + slot * 7 + i * 11) % COMBAT_ATTR_IDS.length
    while (used.has(idx)) idx = (idx + 1) % COMBAT_ATTR_IDS.length
    used.add(idx)
    out.push(COMBAT_ATTR_IDS[idx])
  }
  return out
}

export function visibleWeaknessSlots(enc: EnemyEncounter): Array<CombatAttrId | null> {
  const revealed = new Set(enc.revealedWeaknesses ?? [])
  return (enc.weaknesses ?? []).map((id) => (revealed.has(id) ? id : null))
}

export function formatCombatAttrs(attrs: readonly CombatAttrId[]): string {
  if (!attrs.length) return '无战斗属性'
  return attrs.map((id) => COMBAT_ATTR_LABEL[id]).join(' ')
}

export function formatWeaknessLabels(ids: readonly CombatAttrId[]): string {
  return ids.map((id) => COMBAT_ATTR_LABEL[id]).join('、')
}

/** 旧单缺弱点表则按 id 种子补；再战保留已揭示。新单 revealed 为空。 */
export function ensureEnemyIntel(enc: EnemyEncounter, seed = 0, slot = 0): EnemyEncounter {
  const rank = isEnemyRank(enc.enemyRank) ? enc.enemyRank : enemyRankFor(enc.power, enc.quality)
  enc.enemyRank = rank
  const existing = uniqueCombatAttrs(enc.weaknesses)
  const { min, max } = ENEMY_WEAKNESS_COUNT[rank]
  if (existing.length < min || existing.length > max) {
    enc.weaknesses = pickEnemyWeaknesses(seed || hashString(enc.id), slot, rank)
  } else {
    enc.weaknesses = existing
  }
  enc.revealedWeaknesses = uniqueCombatAttrs(enc.revealedWeaknesses).filter((id) =>
    enc.weaknesses.includes(id),
  )
  return enc
}
