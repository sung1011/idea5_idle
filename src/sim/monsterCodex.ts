import { DUNGEON_BROKER_ID, DUNGEON_BROKER_LABEL, DUNGEON_JAILER_ID, DUNGEON_JAILER_LABEL } from './dungeonTables'
import { isChapterBoss, normalizeMainChapter } from './mainChapter'
import { roll01 } from './rng'
import type { ActionResult, Encounter, Save } from './types'

export const MONSTER_FIRST_LIGHT_DIAMONDS = 2
export const MONSTER_SHARD_EXCHANGE_COST = 10
export const MONSTER_EARLY_DROP_CHANCE = 0.08
export const MONSTER_MID_DROP_CHANCE = 0.05
export const MONSTER_SIGN_DROP_CHANCE = 0.03

export const MONSTER_TITLE_WIDE = '见多识广'
export const MONSTER_TITLE_MASTER = '怪物通'

export type MonsterDropBand = 'early' | 'mid' | 'signature'
export type MonsterShardId = 'fang' | 'cloth' | 'look'
export type MonsterProgressId = 't5' | 't10' | 'all'
export type MonsterCosmeticId = 'fangCampFlag' | 'beastCampCurtain' | 'lookAvatarFrame'
export type MonsterSpeciesId = string

export type MonsterSpeciesDef = {
  id: MonsterSpeciesId
  label: string
  how: string
  band: MonsterDropBand
  dropHint: string
}

export type MonsterProgressDef = {
  id: MonsterProgressId
  need: number
  diamonds: number
  title?: string
}

export type MonsterExchangeDef = {
  id: MonsterCosmeticId
  shard: MonsterShardId
  cost: number
  label: string
  kind: 'camp' | 'frame'
}

export type MonsterCodexState = {
  seenIds: string[]
  submittedIds: string[]
  firstLightGranted: string[]
  claimedProgress: MonsterProgressId[]
  fangShard: number
  hideCloth: number
  lookShard: number
  titles: string[]
  cosmetics: MonsterCosmeticId[]
  equippedCosmetic: MonsterCosmeticId | null
  signatureDropDone: string[]
}

export const MONSTER_SPECIES: readonly MonsterSpeciesDef[] = [
  { id: 'wolfScout', label: '联盟斥候', how: '悬赏探索刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'banditCamp', label: '人类步兵', how: '悬赏探索刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'wildBoar', label: '矮人火枪手', how: '悬赏探索刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'riverRaider', label: '精灵哨兵', how: '悬赏探索刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'hillBrigand', label: '圣光牧师', how: '悬赏探索刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'merchantBuy', label: '地精干粮贩', how: '集市刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'merchantBuyOre', label: '地精矿石掮客', how: '集市刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'merchantBuyBlade', label: '地精工具贩', how: '集市刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'merchantBuyCook', label: '巨魔行脚厨子', how: '集市刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'merchantBuyRoast', label: '巨魔烤肉贩', how: '集市刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'merchantBarter', label: '牛头人换货商', how: '集市刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'merchantBarterOre', label: '牛头人矿换商', how: '集市刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'merchantBarterBlade', label: '血精灵工具商', how: '集市刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'merchantBarterCook', label: '兽人干粮商', how: '集市刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'merchantBarterStew', label: '巨魔香料商', how: '集市刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'merchantPawnCopper', label: '地精铜矿当', how: '采矿已开时，新档集市第 0 格固定刷出', band: 'early', dropHint: '牙饰碎片 8%' },
  { id: 'merchantPawn', label: '地精工具当', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'merchantPawnMeal', label: '地精干粮当', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'merchantPawnRoast', label: '地精烤肉当', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'merchantPawnWood', label: '地精矿料当', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'merchantPawnOre', label: '地精矿石当', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'artisanBlade', label: '修工具委托', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'artisanMeal', label: '灶头加餐', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'artisanStew', label: '炖锅加餐', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'artisanPotion', label: '药剂试制', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'bulkBlade', label: '工具收购', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'bulkMeal', label: '熟食收购', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'bulkRoast', label: '烤肉收购', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'bulkPotion', label: '药剂收购', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  { id: 'bulkCooked', label: '干粮收购', how: '集市刷出', band: 'mid', dropHint: '兽纹布 5%' },
  {
    id: 'chapterBoss',
    label: '联盟指挥官',
    how: '本章悬赏战利品交满 10 单后刷出',
    band: 'signature',
    dropHint: '外观碎片或头像框 3%，首次交单保底',
  },
  {
    id: DUNGEON_JAILER_ID,
    label: DUNGEON_JAILER_LABEL,
    how: '地牢页每日两单之一',
    band: 'signature',
    dropHint: '外观碎片或头像框 3%，首次交单保底',
  },
  {
    id: DUNGEON_BROKER_ID,
    label: DUNGEON_BROKER_LABEL,
    how: '地牢页每日两单之一',
    band: 'signature',
    dropHint: '外观碎片或头像框 3%，首次交单保底',
  },
]

export const MONSTER_SPECIES_IDS = MONSTER_SPECIES.map((row) => row.id)

export const MONSTER_PROGRESS: readonly MonsterProgressDef[] = [
  { id: 't5', need: 5, diamonds: 8, title: MONSTER_TITLE_WIDE },
  { id: 't10', need: 10, diamonds: 15 },
  { id: 'all', need: MONSTER_SPECIES.length, diamonds: 30, title: MONSTER_TITLE_MASTER },
]

export const MONSTER_EXCHANGES: readonly MonsterExchangeDef[] = [
  { id: 'fangCampFlag', shard: 'fang', cost: MONSTER_SHARD_EXCHANGE_COST, label: '牙饰营地旗', kind: 'camp' },
  { id: 'beastCampCurtain', shard: 'cloth', cost: MONSTER_SHARD_EXCHANGE_COST, label: '兽纹营地帘', kind: 'camp' },
  { id: 'lookAvatarFrame', shard: 'look', cost: MONSTER_SHARD_EXCHANGE_COST, label: '兽纹头像框', kind: 'frame' },
]

export const MONSTER_SHARD_LABEL: Record<MonsterShardId, string> = {
  fang: '牙饰碎片',
  cloth: '兽纹布',
  look: '外观碎片',
}

const SPECIES_BY_ID = new Map(MONSTER_SPECIES.map((row) => [row.id, row]))
const PREFIX_IDS = [...MONSTER_SPECIES_IDS].sort((a, b) => b.length - a.length)
const COSMETIC_IDS = new Set<string>(MONSTER_EXCHANGES.map((row) => row.id))
const PROGRESS_IDS = new Set<string>(MONSTER_PROGRESS.map((row) => row.id))

export function blankMonsterCodex(): MonsterCodexState {
  return {
    seenIds: [],
    submittedIds: [],
    firstLightGranted: [],
    claimedProgress: [],
    fangShard: 0,
    hideCloth: 0,
    lookShard: 0,
    titles: [],
    cosmetics: [],
    equippedCosmetic: null,
    signatureDropDone: [],
  }
}

function countOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

function uniqueIds(raw: unknown, allow: (id: string) => boolean): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string' || !allow(item) || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

function isSpeciesId(id: string): boolean {
  return SPECIES_BY_ID.has(id)
}

function isProgressId(id: string): id is MonsterProgressId {
  return PROGRESS_IDS.has(id)
}

function isCosmeticId(id: string): id is MonsterCosmeticId {
  return COSMETIC_IDS.has(id)
}

export function monsterSpeciesOf(id: unknown): MonsterSpeciesDef | null {
  return typeof id === 'string' ? SPECIES_BY_ID.get(id) ?? null : null
}

export function ensureMonsterCodex(save: Save): MonsterCodexState {
  const current = (save as { monsterCodex?: unknown }).monsterCodex
  if (current && typeof current === 'object' && Array.isArray((current as MonsterCodexState).seenIds)) {
    return current as MonsterCodexState
  }
  save.monsterCodex = blankMonsterCodex()
  return save.monsterCodex
}

export function normalizeMonsterCodex(raw: unknown): MonsterCodexState {
  const blank = blankMonsterCodex()
  if (!raw || typeof raw !== 'object') return blank
  const src = raw as Partial<MonsterCodexState>
  const cosmetics = uniqueIds(src.cosmetics, isCosmeticId) as MonsterCosmeticId[]
  const equipped =
    typeof src.equippedCosmetic === 'string' && cosmetics.includes(src.equippedCosmetic) ? src.equippedCosmetic : null
  return {
    seenIds: uniqueIds(src.seenIds, isSpeciesId),
    submittedIds: uniqueIds(src.submittedIds, isSpeciesId),
    firstLightGranted: uniqueIds(src.firstLightGranted, isSpeciesId),
    claimedProgress: uniqueIds(src.claimedProgress, isProgressId) as MonsterProgressId[],
    fangShard: countOf(src.fangShard),
    hideCloth: countOf(src.hideCloth),
    lookShard: countOf(src.lookShard),
    titles: uniqueIds(src.titles, (id) => id === MONSTER_TITLE_WIDE || id === MONSTER_TITLE_MASTER),
    cosmetics,
    equippedCosmetic: equipped,
    signatureDropDone: uniqueIds(src.signatureDropDone, isSpeciesId),
  }
}

function pushUnique(list: string[], id: string): boolean {
  if (list.includes(id)) return false
  list.push(id)
  return true
}

export function isMonsterLit(save: Save, id: string): boolean {
  const bag = ensureMonsterCodex(save)
  return bag.seenIds.includes(id) || bag.submittedIds.includes(id)
}

export function litMonsterCount(save: Save): number {
  const bag = ensureMonsterCodex(save)
  return new Set([...bag.seenIds, ...bag.submittedIds]).size
}

export function speciesIdOfEncounter(enc: Encounter | null | undefined): MonsterSpeciesId | null {
  if (!enc || typeof enc.id !== 'string') return null
  if (isChapterBoss(enc) || enc.label === '联盟指挥官') return 'chapterBoss'
  if (enc.id === DUNGEON_JAILER_ID || enc.label === DUNGEON_JAILER_LABEL) return DUNGEON_JAILER_ID
  if (enc.id === DUNGEON_BROKER_ID || enc.label === DUNGEON_BROKER_LABEL) return DUNGEON_BROKER_ID
  if (enc.id.startsWith('guideMinion-') || enc.label === '联盟斥候') return 'wolfScout'
  if (enc.id.startsWith('guideHerbMinion-') || enc.label === '人类步兵') return 'banditCamp'
  if (enc.id.startsWith('merchantPawnCopper-') || enc.label === '地精铜矿当') return 'merchantPawnCopper'
  for (const id of PREFIX_IDS) {
    if (enc.id === id || enc.id.startsWith(`${id}-`)) return id
  }
  const byLabel = MONSTER_SPECIES.find((row) => row.label === enc.label)
  return byLabel?.id ?? null
}

function allLiveEncounters(save: Save): Encounter[] {
  const dungeon = save.dungeon?.encounters ?? []
  return [...(save.encounters ?? []), ...(save.marketEncounters ?? []), ...dungeon]
}

function isSubmittedEncounter(enc: Encounter): boolean {
  if (enc.kind === 'enemy') return enc.lootClaimed === true
  return 'completed' in enc && enc.completed === true
}

function grantTitle(bag: MonsterCodexState, title: string): void {
  pushUnique(bag.titles, title)
}

function lightSpecies(save: Save, id: string, grantFirstLight: boolean): string | null {
  const def = monsterSpeciesOf(id)
  if (!def) return null
  const bag = ensureMonsterCodex(save)
  const already = isMonsterLit(save, id)
  if (already) return null
  pushUnique(bag.seenIds, id)
  if (!grantFirstLight) return null
  if (bag.firstLightGranted.includes(id)) return null
  bag.firstLightGranted.push(id)
  save.diamonds += MONSTER_FIRST_LIGHT_DIAMONDS
  return `图鉴点亮「${def.label}」。钻石 +${MONSTER_FIRST_LIGHT_DIAMONDS}`
}

export function noteMonsterSeen(save: Save, enc: Encounter, grantFirstLight: boolean): string | null {
  const id = speciesIdOfEncounter(enc)
  if (!id) return null
  return lightSpecies(save, id, grantFirstLight)
}

function addShard(bag: MonsterCodexState, shard: MonsterShardId, qty = 1): void {
  const n = Math.max(1, Math.floor(qty))
  if (shard === 'fang') bag.fangShard += n
  else if (shard === 'cloth') bag.hideCloth += n
  else bag.lookShard += n
}

function shardQty(bag: MonsterCodexState, shard: MonsterShardId): number {
  if (shard === 'fang') return bag.fangShard
  if (shard === 'cloth') return bag.hideCloth
  return bag.lookShard
}

function takeShard(bag: MonsterCodexState, shard: MonsterShardId, qty: number): boolean {
  if (shardQty(bag, shard) < qty) return false
  if (shard === 'fang') bag.fangShard -= qty
  else if (shard === 'cloth') bag.hideCloth -= qty
  else bag.lookShard -= qty
  return true
}

function grantCosmetic(bag: MonsterCodexState, id: MonsterCosmeticId): boolean {
  return pushUnique(bag.cosmetics, id)
}

function rollSignatureDrop(save: Save, bag: MonsterCodexState): string {
  const wantFrame = roll01(save) < 0.5
  if (wantFrame && grantCosmetic(bag, 'lookAvatarFrame')) {
    if (!bag.equippedCosmetic) bag.equippedCosmetic = 'lookAvatarFrame'
    return '头像框「兽纹头像框」'
  }
  addShard(bag, 'look')
  return `${MONSTER_SHARD_LABEL.look} ×1`
}

function rollExclusiveDrop(save: Save, def: MonsterSpeciesDef): string | null {
  const bag = ensureMonsterCodex(save)
  if (def.band === 'signature') {
    const first = !bag.signatureDropDone.includes(def.id)
    const hit = first || roll01(save) < MONSTER_SIGN_DROP_CHANCE
    if (!hit) return null
    if (first) pushUnique(bag.signatureDropDone, def.id)
    return rollSignatureDrop(save, bag)
  }
  const chance = def.band === 'early' ? MONSTER_EARLY_DROP_CHANCE : MONSTER_MID_DROP_CHANCE
  if (roll01(save) >= chance) return null
  const shard: MonsterShardId = def.band === 'early' ? 'fang' : 'cloth'
  addShard(bag, shard)
  return `${MONSTER_SHARD_LABEL[shard]} ×1`
}

export type MonsterSubmitNotes = {
  firstLight: string | null
  drop: string | null
}

export function settleMonsterSubmit(save: Save, enc: Encounter): MonsterSubmitNotes {
  const id = speciesIdOfEncounter(enc)
  if (!id) return { firstLight: null, drop: null }
  const def = monsterSpeciesOf(id)
  if (!def) return { firstLight: null, drop: null }
  const bag = ensureMonsterCodex(save)
  const firstLight = lightSpecies(save, id, true)
  pushUnique(bag.seenIds, id)
  pushUnique(bag.submittedIds, id)
  const drop = rollExclusiveDrop(save, def)
  return { firstLight, drop }
}

export function appendMonsterNotes(message: string, notes: MonsterSubmitNotes): string {
  const extra = [notes.firstLight, notes.drop ? `专属掉落：${notes.drop}` : null].filter(
    (row): row is string => !!row,
  )
  if (!extra.length) return message
  return `${message}。${extra.join('。')}`
}

function inferLegacySubmitted(save: Save, bag: MonsterCodexState): void {
  if (normalizeMainChapter(save.mainChapter) > 1) pushUnique(bag.submittedIds, 'chapterBoss')
  if (save.starterCopperPawnDone) pushUnique(bag.submittedIds, 'merchantPawnCopper')
  const fought = save.guideQuestStats?.dungeonFought ?? []
  for (const id of fought) {
    if (id === DUNGEON_JAILER_ID || id === DUNGEON_BROKER_ID) pushUnique(bag.seenIds, id)
  }
}

export function syncMonsterCodex(save: Save, opts: { grantFirstLight: boolean }): string[] {
  const bag = ensureMonsterCodex(save)
  const notes: string[] = []
  for (const enc of allLiveEncounters(save)) {
    const id = speciesIdOfEncounter(enc)
    if (!id) continue
    if (isSubmittedEncounter(enc)) {
      pushUnique(bag.submittedIds, id)
      pushUnique(bag.seenIds, id)
    }
    const lit = noteMonsterSeen(save, enc, opts.grantFirstLight)
    if (lit) notes.push(lit)
  }
  return notes
}

export function hydrateMonsterCodex(save: Save): void {
  save.monsterCodex = normalizeMonsterCodex((save as { monsterCodex?: unknown }).monsterCodex)
  inferLegacySubmitted(save, save.monsterCodex)
  syncMonsterCodex(save, { grantFirstLight: false })
}

export function monsterProgressView(save: Save): Array<
  MonsterProgressDef & { lit: number; claimed: boolean; ready: boolean }
> {
  const bag = ensureMonsterCodex(save)
  const lit = litMonsterCount(save)
  return MONSTER_PROGRESS.map((row) => {
    const claimed = bag.claimedProgress.includes(row.id)
    return { ...row, lit, claimed, ready: !claimed && lit >= row.need }
  })
}

export function claimMonsterProgress(save: Save, id: MonsterProgressId): ActionResult {
  const row = MONSTER_PROGRESS.find((item) => item.id === id)
  if (!row) return { ok: false, reason: '没有这项进度奖' }
  const bag = ensureMonsterCodex(save)
  if (bag.claimedProgress.includes(id)) return { ok: false, reason: '已经领过了' }
  if (litMonsterCount(save) < row.need) return { ok: false, reason: `还差 ${row.need - litMonsterCount(save)} 种` }
  bag.claimedProgress.push(id)
  save.diamonds += row.diamonds
  if (row.title) grantTitle(bag, row.title)
  const titleNote = row.title ? `，称号「${row.title}」` : ''
  return { ok: true, message: `图鉴进度奖：钻石 +${row.diamonds}${titleNote}` }
}

export function monsterShardQty(save: Save, shard: MonsterShardId): number {
  return shardQty(ensureMonsterCodex(save), shard)
}

export function exchangeMonsterShard(save: Save, cosmeticId: MonsterCosmeticId): ActionResult {
  const row = MONSTER_EXCHANGES.find((item) => item.id === cosmeticId)
  if (!row) return { ok: false, reason: '没有这项兑换' }
  const bag = ensureMonsterCodex(save)
  if (bag.cosmetics.includes(cosmeticId)) return { ok: false, reason: '已经兑过了' }
  if (!takeShard(bag, row.shard, row.cost)) {
    return { ok: false, reason: `${MONSTER_SHARD_LABEL[row.shard]}不够：要 ${row.cost}` }
  }
  grantCosmetic(bag, cosmeticId)
  if (!bag.equippedCosmetic) bag.equippedCosmetic = cosmeticId
  return { ok: true, message: `兑换成功：${row.label}` }
}

export function equipMonsterCosmetic(save: Save, cosmeticId: MonsterCosmeticId | null): ActionResult {
  const bag = ensureMonsterCodex(save)
  if (cosmeticId && !bag.cosmetics.includes(cosmeticId)) return { ok: false, reason: '还没兑到这件' }
  bag.equippedCosmetic = cosmeticId
  return { ok: true }
}

export function equippedMonsterTitle(save: Save): string | null {
  const titles = ensureMonsterCodex(save).titles
  if (titles.includes(MONSTER_TITLE_MASTER)) return MONSTER_TITLE_MASTER
  if (titles.includes(MONSTER_TITLE_WIDE)) return MONSTER_TITLE_WIDE
  return titles[0] ?? null
}

export function equippedCampDeco(save: Save): string | null {
  const bag = ensureMonsterCodex(save)
  const id = bag.equippedCosmetic
  if (!id) return null
  const row = MONSTER_EXCHANGES.find((item) => item.id === id && item.kind === 'camp')
  return row?.label ?? null
}

export function equippedMonsterFrame(save: Save): 'look' | null {
  return ensureMonsterCodex(save).cosmetics.includes('lookAvatarFrame') ? 'look' : null
}

export function monsterCodexRows(save: Save): Array<
  MonsterSpeciesDef & { lit: boolean; submitted: boolean }
> {
  const bag = ensureMonsterCodex(save)
  return MONSTER_SPECIES.map((row) => ({
    ...row,
    lit: isMonsterLit(save, row.id),
    submitted: bag.submittedIds.includes(row.id),
  }))
}
