import { roll01 } from './rng'
import { revealExtraCount, weaknessCritBonus } from './tech'
import type {
  CombatAttrId,
  EnemyEncounter,
  EnemyRank,
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

/** 芯片字色 / 底色。元素必须互不相同，避免火（水滴形）被看成冰蓝。 */
export const COMBAT_ATTR_TONE: Record<CombatAttrId, { ink: string; fill: string }> = {
  sword: { ink: '#6b3f12', fill: '#f3e2c0' },
  polearm: { ink: '#6b3f12', fill: '#f3e2c0' },
  dagger: { ink: '#6b3f12', fill: '#f3e2c0' },
  axe: { ink: '#6b3f12', fill: '#f3e2c0' },
  bow: { ink: '#6b3f12', fill: '#f3e2c0' },
  staff: { ink: '#6b3f12', fill: '#f3e2c0' },
  fire: { ink: '#c0392b', fill: '#ffe0cc' },
  ice: { ink: '#1a7a9a', fill: '#d4f1fa' },
  lightning: { ink: '#b8860b', fill: '#fff3c4' },
  wind: { ink: '#2e7d4f', fill: '#d8f3e4' },
  light: { ink: '#8a6d1f', fill: '#fff6d0' },
  dark: { ink: '#4a2f7a', fill: '#ebe4f8' },
}

export function combatAttrChipStyle(id: CombatAttrId): { color: string; backgroundColor: string } {
  const tone = COMBAT_ATTR_TONE[id]
  return { color: tone.ink, backgroundColor: tone.fill }
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

/** 开战前卡面预暴露：杂兵 2、精英 1、首领 0。打中未暴露的仍可再揭。 */
export const INITIAL_REVEALED_WEAKNESS_COUNT: Readonly<Record<EnemyRank, number>> = {
  minion: 2,
  elite: 1,
  boss: 0,
}

export function initialRevealedWeaknessCount(rank: EnemyRank, save?: Save): number {
  const extra = rank === 'boss' ? 0 : save ? revealExtraCount(save) : 0
  return INITIAL_REVEALED_WEAKNESS_COUNT[rank] + extra
}

/**
 * 灰绿蓝 → 杂兵；紫橙 → 精英。橙不自动当首领。
 * 决定弱点条数、战斗超时，以及 HP / ATK / SPD 阶级倍率。
 */
export function enemyRankFor(quality: EncounterQuality): EnemyRank {
  if (quality === 'purple' || quality === 'orange') return 'elite'
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

/** 只按「这一个」工人命中数：0 → ×1，1 → ×1.2，2 → ×1.5。札记再 +10%。 */
export function weaknessDamageMul(hitCount: number, save?: Save): number {
  let mul = 1
  if (hitCount >= 2) mul = 1.5
  else if (hitCount >= 1) mul = 1.2
  if (mul > 1 && save) mul += weaknessCritBonus(save)
  return mul
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
  save?: Save,
): { damage: number; mul: number; hits: CombatAttrId[]; newlyRevealed: CombatAttrId[] } {
  const hits = matchingWeaknesses(attrs, enc.weaknesses ?? [])
  const newlyRevealed = revealMatchedWeaknesses(enc, hits)
  const mul = weaknessDamageMul(hits.length, save)
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

/** 卡面与克制共用：只读战斗态 weaknesses / revealedWeaknesses。 */
export function enemyWeaknessView(enc: EnemyEncounter): {
  weaknesses: CombatAttrId[]
  revealed: CombatAttrId[]
  slots: Array<CombatAttrId | null>
} {
  const weaknesses = uniqueCombatAttrs(enc.weaknesses)
  const revealed = uniqueCombatAttrs(enc.revealedWeaknesses).filter((id) => weaknesses.includes(id))
  return {
    weaknesses,
    revealed,
    slots: weaknesses.map((id) => (revealed.includes(id) ? id : null)),
  }
}

export function visibleWeaknessSlots(enc: EnemyEncounter): Array<CombatAttrId | null> {
  return enemyWeaknessView(enc).slots
}

/** 只读已揭示弱点与工人属性的命中。隐藏弱点不计入选人推荐。 */
export function revealedWeaknessHits(
  attrs: readonly CombatAttrId[],
  enc: EnemyEncounter,
): CombatAttrId[] {
  return matchingWeaknesses(attrs, enemyWeaknessView(enc).revealed)
}

export type FighterRecommendLabel = '推荐' | '强烈推荐'

/** 命中 1 条已揭示 → 推荐；2 条 → 强烈推荐；0 条不标。 */
export function fighterRecommendLabel(
  attrs: readonly CombatAttrId[],
  enc: EnemyEncounter,
): FighterRecommendLabel | null {
  const n = revealedWeaknessHits(attrs, enc).length
  if (n >= 2) return '强烈推荐'
  if (n >= 1) return '推荐'
  return null
}

/** 已有揭示保留；不足阶级初始条数则按弱点表顺序补齐，不重掷。 */
export function seedInitialRevealedWeaknesses(enc: EnemyEncounter, save?: Save): EnemyEncounter {
  const rank = isEnemyRank(enc.enemyRank) ? enc.enemyRank : enemyRankFor(enc.quality)
  const weaknesses = uniqueCombatAttrs(enc.weaknesses)
  const have = uniqueCombatAttrs(enc.revealedWeaknesses).filter((id) => weaknesses.includes(id))
  const need = Math.min(initialRevealedWeaknessCount(rank, save), weaknesses.length)
  const seen = new Set(have)
  for (const id of weaknesses) {
    if (have.length >= need) break
    if (seen.has(id)) continue
    seen.add(id)
    have.push(id)
  }
  enc.revealedWeaknesses = have
  return enc
}

export function formatCombatAttrs(attrs: readonly CombatAttrId[]): string {
  if (!attrs.length) return '无克制属性'
  return attrs.map((id) => COMBAT_ATTR_LABEL[id]).join(' ')
}

export function formatWeaknessLabels(ids: readonly CombatAttrId[]): string {
  return ids.map((id) => COMBAT_ATTR_LABEL[id]).join('、')
}

/** 弱点命中漂字：一条 `枪 暴击`，两条 `枪 火 暴击`。不写「弱点×」。 */
export function formatWeaknessCritTip(ids: readonly CombatAttrId[]): string {
  if (!ids.length) return ''
  return `${ids.map((id) => COMBAT_ATTR_LABEL[id]).join(' ')} 暴击`
}

/** 旧单缺弱点表则按 id 种子补；已有列表只补齐/截断，开战不另掷一份。同一单保留已揭示，并按阶级补齐初始暴露。 */
export function ensureEnemyIntel(enc: EnemyEncounter, seed = 0, slot = 0, save?: Save): EnemyEncounter {
  const rank = isEnemyRank(enc.enemyRank) ? enc.enemyRank : enemyRankFor(enc.quality)
  enc.enemyRank = rank
  const existing = uniqueCombatAttrs(enc.weaknesses)
  const { min, max } = ENEMY_WEAKNESS_COUNT[rank]
  const rollSeed = seed || hashString(enc.id)
  if (existing.length === 0) {
    enc.weaknesses = pickEnemyWeaknesses(rollSeed, slot, rank)
  } else if (existing.length < min) {
    enc.weaknesses = [
      ...existing,
      ...pickDistinctAttrs(min - existing.length, roll01Bag(rollSeed + slot * 17 + 3), existing),
    ]
  } else if (existing.length > max) {
    const revealed = new Set(uniqueCombatAttrs(enc.revealedWeaknesses))
    enc.weaknesses = uniqueCombatAttrs([
      ...existing.filter((id) => revealed.has(id)),
      ...existing.filter((id) => !revealed.has(id)),
    ]).slice(0, max)
  } else {
    enc.weaknesses = existing
  }
  enc.revealedWeaknesses = uniqueCombatAttrs(enc.revealedWeaknesses).filter((id) =>
    enc.weaknesses.includes(id),
  )
  return seedInitialRevealedWeaknesses(enc, save)
}
