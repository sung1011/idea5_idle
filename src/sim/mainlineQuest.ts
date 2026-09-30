import { addToBank, itemQty } from './bank'
import { grantHerbProbes, herbWorkerCounters } from './herbPvp'
import { grantKnightXp } from './knightLevel'
import {
  bindMainlineModuleGate,
  grantOpenedModules,
  isModuleUnlocked,
  levelGateTitle,
  modulesAtGate,
  type ModuleId,
} from './moduleUnlock'
import { knightLevelOf } from './stationUnlock'
import { POTION_ITEM_IDS, STATION_ORDER } from './tables'
import { TECH_TABS } from './tech'
import { addVault, bannerLevelOf } from './treasureMine'
import type { ItemId, Save, StationId, TreasureId } from './types'
import {
  blankGuideQuestStats,
  ensureGuideQuestStats,
  normalizeGuideQuestStats,
  type GuideQuestStats,
} from './mainlineStats'

export type MainlineReward = {
  gold?: number
  diamonds?: number
  xp?: number
  inspiration?: number
  items?: { id: ItemId; qty: number; label: string }[]
  vault?: { id: TreasureId; qty: number; label: string }[]
  probes?: number
}

export type MainlineTier = 'intro' | 'advanced' | 'long' | 'level'

export type MainlineTask = {
  id: string
  goal: string
  title: string
  /** 升到这一级才算完成。0 表示不是等级任务。 */
  gate: number
  module: ModuleId | null
  tier: MainlineTier
  reward: MainlineReward
}

/** 跳过位图能记到的步数。一个 JS 数字只有 31 个正位，当前清单拆成 3 个字。 */
export const GUIDE_SKIP_CAP = 93
const SKIP_WORD_BITS = 31


function gold(n: number): MainlineReward {
  return { gold: n }
}

/** 保留的原有引导步：20 金 + 20 经验。 */
function kept(): MainlineReward {
  return { gold: 20, xp: 20 }
}

function gems(n: number, xp = 0): MainlineReward {
  return xp > 0 ? { diamonds: n, xp } : { diamonds: n }
}

function goods(items: MainlineReward['items'], xp = 0): MainlineReward {
  return xp > 0 ? { items, xp } : { items }
}

function longReward(inspiration = 1, diamonds = 24): MainlineReward {
  return { diamonds, inspiration, xp: 30 }
}

function rich(): MainlineReward {
  return { diamonds: 24, inspiration: 2, xp: 30 }
}

function levelReward(level: number): MainlineReward {
  if (level <= 20) return { gold: 20 }
  return { diamonds: 24, xp: 10 }
}

function levelGoal(level: number): string {
  return levelGateTitle(level)
}

function levelTask(level: number): MainlineTask {
  const goal = levelGoal(level)
  return {
    id: `level${level}`,
    goal,
    title: goal,
    gate: level,
    module: null,
    tier: 'level',
    reward: levelReward(level),
  }
}

function task(
  id: string,
  goal: string,
  title: string,
  tier: MainlineTier,
  reward: MainlineReward,
  module: ModuleId | null = null,
): MainlineTask {
  return { id, goal, title, gate: 0, module, tier, reward }
}

/**
 * 唯一的主线顺序。下标就是步号，运行时不重排。
 * 顺序以确认过的清单为准，中间插入了派工、排队和挂自动。运行时不重排。
 */
function buildSchedule(): MainlineTask[] {
  const rows: MainlineTask[] = [
    task('recruit', '抽取苦工 2 次', '招兵', 'intro', kept()),
    task('autoHerb', '点采药站，把营地队首派上去干一轮', '派工', 'intro', kept()),
    task('herbQueue', '采药站还在干时再点一次，排上下一轮（最多 5 轮）', '排队', 'intro', kept()),
    task('fuse', '在营地把两名同品质苦工合成，名册出现 2 档', '合伙', 'intro', kept()),
    task('combat', '在 PVE 选人弹层点过开战', '出征', 'intro', kept()),
    levelTask(2),
    task('autoLine', '在站卡右上角打开一条自动线', '挂自动', 'intro', kept()),
    task('alchemy', '点炼金站，把队首派上去熬一轮药', '熬药', 'intro', kept()),
    task('potionInstall', '在营地把任一药剂槽装上药', '装药', 'intro', kept()),
    task('potionUse', '在营地点用过药剂槽', '用药', 'intro', kept()),
    levelTask(3),
    task('firstBlood', '在悬赏打赢一个敌人并领到战利品', '头功', 'intro', gold(30)),
    task('explore', '探索悬赏 1 次', '探路', 'intro', gold(16)),
    levelTask(4),
    task('alchemy3', '把炼金站升到 3 级', '药方渐丰', 'advanced', gems(12, 10)),
    task('slotsFull', '4 个药剂槽全部装上药剂', '四槽齐备', 'advanced', gems(12, 10)),
    levelTask(5),
    task('blueWorker', '名册里有 1 名蓝色苦工', '蓝衣苦工', 'advanced', gems(12, 10)),
    levelTask(6),
    task('huntStart', '点狩猎站，把营地队首派上去干一轮', '猎手出发', 'intro', gold(20), 'hunting'),
    task('market', '在集市板成交一单', '赶集', 'intro', kept(), 'market'),
    task('huntHaul', '狩猎站成功出货累计 10 次。可以挂自动，也可以连点派工', '满载而归', 'intro', goods([{ id: 'salve', qty: 2, label: '巫毒回春剂' }]), 'hunting'),
    task('pawn', '在地精当铺典当成交一单', '地精当铺', 'intro', gold(16), 'market'),
    task('timed', '成交一单限时集市', '抢时辰', 'intro', gold(20), 'market'),
    levelTask(7),
    task('herbSickle', '把采药站升到 5 级', '磨镰', 'advanced', gems(12, 10)),
    levelTask(8),
    task('cookStart', '点烹饪站，把营地队首派上去干一轮', '起灶', 'intro', gold(20), 'cooking'),
    task('restFood', '选好营地伙食', '开饭', 'intro', kept(), 'restFood'),
    task('dungeon', '当天地牢开过战', '下地牢', 'intro', kept(), 'dungeon'),
    task('stockFood', '物资里熟食、烤肉、香料炖合计至少 10 份', '囤粮', 'intro', goods([{ id: 'spice', qty: 10, label: '香料' }]), 'cooking'),
    task('chest', '领取过一次地牢宝箱', '开箱', 'intro', goods([{ id: 'salve', qty: 3, label: '巫毒回春剂' }]), 'dungeon'),
    task('dungeonBoth', '同一个游戏日里两张地牢单都开过战', '两单全开', 'intro', goods([{ id: 'meal', qty: 4, label: '熟食' }]), 'dungeon'),
    levelTask(9),
    task('huntWolf', '狩猎站升到 5 级，并把猎物换成狼', '猎狼', 'advanced', gems(12, 10), 'hunting'),
    task('marketHigh', '成交一单紫色或橙色集市', '大主顾', 'advanced', gems(24, 10), 'market'),
    levelTask(10),
    task('herbAssign', '派一名苦工去割草', '下田', 'intro', gold(20), 'herb'),
    task('herb', '割到一株珍贵草药', '珍草上榜', 'intro', { probes: 1, xp: 20 }, 'herb'),
    task('herbCounter', '派一名克制该地块弱点的苦工去割', '对症下镰', 'intro', gold(20), 'herb'),
    levelTask(11),
    task('tech', '点亮一项科技', '初开灵窍', 'intro', kept(), 'tech'),
    task('techTabs', '生产、战斗、事务三页各点亮至少 1 项', '三路并进', 'intro', gold(20), 'tech'),
    task('cookStew', '烹饪站升到 5 级，并把营地伙食换成香料炖', '香料炖', 'advanced', gems(12, 10), 'cooking'),
    levelTask(12),
    task('marketSlot', '点亮科技「市集摊位」', '多开一格', 'advanced', gems(12, 10), 'tech'),
    task('chapter2', '击败本章首领，进入第 2 章', '斩将夺旗', 'advanced', gems(24, 10)),
    levelTask(13),
    task('beast', '对困兽造成过伤害', '猎兽', 'intro', kept(), 'beast'),
    task('beastManual', '在困兽战里用出打断、闪避或畏缩', '见招拆招', 'intro', goods([{ id: 'salve', qty: 2, label: '巫毒回春剂' }]), 'beast'),
    task('boneSoup', '做出一份骨汤，或把营地伙食换成骨汤', '熬骨汤', 'intro', goods([{ id: 'meat', qty: 10, label: '肉' }]), 'beast'),
    levelTask(14),
    task('cyanWorker', '名册里有 1 名青色苦工', '青衣头目', 'long', longReward()),
    task('dungeonGold', '地牢开出一次金箱', '典狱破门', 'long', longReward(), 'dungeon'),
    levelTask(15),
    task('tech8', '累计点亮 8 项科技', '博学', 'long', rich(), 'tech'),
    task('chapter3', '进入第 3 章', '三章告捷', 'long', longReward()),
    task('huntDeer', '狩猎站升到 10 级，并把猎物换成鹿', '逐鹿', 'long', longReward(), 'hunting'),
    levelTask(16),
    task('mining', '点采矿站，把营地队首派上去干一轮', '开矿', 'intro', kept(), 'mining'),
    task('crystal', '物资里荒晶至少 10 个', '攒荒晶', 'intro', gold(30), 'mining'),
    task('miningIron', '采矿站升到 5 级，并换成铁矿', '换铁矿', 'advanced', gems(12, 10), 'mining'),
    levelTask(17),
    task('herbPayout', '领到一次割草日结奖励', '日结领赏', 'advanced', gems(12, 10), 'herb'),
    task('oreDeal', '用矿石成交一单集市', '矿石换钱', 'advanced', gems(24, 10), 'market'),
    task('veteran', '任一苦工的战斗等级达到 8', '百战老兵', 'long', longReward()),
    levelTask(18),
    task('inscribe', '点铭刻站，把营地队首派上去干一轮', '刻符人', 'intro', gold(20), 'inscription'),
    task('runeCraft', '铭刻站成功刻出 1 枚符文', '第一枚符文', 'intro', goods([{ id: 'wildCrystal', qty: 6, label: '荒晶' }]), 'inscription'),
    task('rune', '在选人面板点开过符文槽', '符文槽', 'intro', kept(), 'rune'),
    task('runeWin', '带着符文打一场悬赏或地牢', '带符出征', 'intro', goods([{ id: 'runeSharp', qty: 2, label: '锋锐符文' }]), 'rune'),
    task('stationsOpen', '六个生产站都点上派工，让它们同时有人在干', '六站齐开', 'long', longReward()),
    levelTask(19),
    task('miningMithril', '采矿站升到 10 级，并换成秘银矿', '秘银', 'long', longReward(), 'mining'),
    task('inscribe5', '铭刻站升到 5 级', '破障', 'long', longReward(), 'inscription'),
    levelTask(20),
    task('treasure', '夺宝累计收获大于 0', '开采', 'intro', kept(), 'treasure'),
    task('scout', '揭开一座矿洞的全部弱点', '探洞', 'intro', { vault: [{ id: 'sandGold', qty: 20, label: '砂金' }] }, 'treasure'),
    task('raid', '从守军手里抢下一座矿洞', '夺洞', 'intro', { vault: [{ id: 'jewel', qty: 60, label: '珠宝' }] }, 'treasure'),
    task('guard', '给自己的矿洞加固或布置陷阱', '设防', 'intro', { vault: [{ id: 'sandGold', qty: 40, label: '砂金' }] }, 'treasure'),
    task('feast', '摆一次酋长宴', '酋长宴', 'advanced', gems(24, 10), 'beast'),
    task('chapter5', '进入第 5 章', '第五章', 'long', longReward()),
    task('banner1', '把战旗升到 1 级', '竖旗', 'long', longReward(), 'treasure'),
    levelTask(22),
    task('purpleWorker', '名册里有 1 名紫色苦工', '紫衣头目', 'long', rich()),
    task('banner3', '把战旗升到 3 级', '战旗三级', 'long', rich(), 'treasure'),
    levelTask(25),
    task('chapter8', '进入第 8 章', '第八章', 'long', rich()),
    task('stations10', '六个生产站都升到 10 级', '六站十级', 'long', rich()),
    levelTask(28),
    task('banner5', '把战旗升到 5 级', '战旗五级', 'long', rich(), 'treasure'),
    levelTask(30),
  ]
  return rows
}

export const MAINLINE_TASKS: readonly MainlineTask[] = buildSchedule()

const TASK_BY_ID = new Map(MAINLINE_TASKS.map((row) => [row.id, row]))

export function mainlineTaskAt(step: number): MainlineTask | null {
  if (!Number.isFinite(step)) return null
  return MAINLINE_TASKS[Math.floor(step) - 1] ?? null
}

export function mainlineStepOf(id: string): number {
  return MAINLINE_TASKS.findIndex((row) => row.id === id) + 1
}

export function mainlineTaskById(id: string): MainlineTask | null {
  return TASK_BY_ID.get(id) ?? null
}

function statsOf(save: Save): GuideQuestStats {
  return save.guideQuestStats ?? blankGuideQuestStats()
}

function metHas(save: Save, id: string): boolean {
  return (save.guideQuestMet ?? []).includes(id)
}

function recruited(save: Save): boolean {
  const roster = save.workers?.length ?? 0
  const spawned = Math.max(0, Math.floor(save.nextWorkerId ?? 1) - 1)
  return Math.max(roster, spawned) >= 2
}

export function guideRecruitCount(save: Save): number {
  const roster = save.workers?.length ?? 0
  const spawned = Math.max(0, Math.floor(save.nextWorkerId ?? 1) - 1)
  return Math.max(roster, spawned)
}

function onStation(save: Save, id: StationId): boolean {
  return save.workers?.some((worker) => worker.assignment === id) ?? false
}

function stationAt(save: Save, id: StationId, level: number, category?: string): boolean {
  const station = save.stations?.[id]
  if (!station || (station.stationLevel ?? 1) < level) return false
  if (category && station.selectedCategory !== category) return false
  return true
}

function litTech(save: Save): Set<string> {
  const ids = new Set<string>()
  for (const id of save.unlockedTechIds ?? []) ids.add(id)
  for (const [id, level] of Object.entries(save.techLevels ?? {})) {
    if (typeof level === 'number' && level > 0) ids.add(id)
  }
  return ids
}

function tabHasTech(save: Save, tabId: 'production' | 'combat' | 'affairs'): boolean {
  const lit = litTech(save)
  const tab = TECH_TABS.find((row) => row.id === tabId)
  if (!tab) return false
  return tab.rows.some((row) => row.options.some((option) => lit.has(option.id)))
}

function marketBoardDone(save: Save, pred: (enc: Save['marketEncounters'][number]) => boolean): boolean {
  return save.marketEncounters?.some((enc) => 'completed' in enc && enc.completed && pred(enc)) ?? false
}

function haulSum(save: Save): number {
  const haul = save.treasureMines?.haul
  if (!haul) return 0
  let sum = 0
  for (const qty of Object.values(haul)) {
    if (typeof qty === 'number' && qty > 0) sum += qty
  }
  return sum
}

function mineFullyOpen(mine: { weaknesses?: readonly string[]; revealedWeaknesses?: readonly string[] }): boolean {
  const weaknesses = mine.weaknesses ?? []
  if (!weaknesses.length) return false
  const revealed = new Set(mine.revealedWeaknesses ?? [])
  return weaknesses.every((id) => revealed.has(id))
}

function foodSum(save: Save): number {
  return itemQty(save, 'meal') + itemQty(save, 'roast') + itemQty(save, 'stew')
}

function maxQuality(save: Save): number {
  return save.workers?.reduce((best, worker) => Math.max(best, worker.qualityTier ?? 1), 1) ?? 1
}

function maxCombatLevel(save: Save): number {
  return save.workers?.reduce((best, worker) => Math.max(best, worker.level ?? 1), 1) ?? 1
}

function potionProduced(save: Save): boolean {
  if ((save.stations?.alchemy?.completed ?? 0) >= 1) return true
  if (save.potionSlots?.some((id) => id != null)) return true
  return POTION_ITEM_IDS.some((id) => itemQty(save, id) > 0)
}

function potionUsed(save: Save): boolean {
  if (save.guideQuestPotionUsed) return true
  const t = save.elapsedS ?? 0
  return (save.workers ?? []).some((worker) => {
    const buff = worker.potion
    if (!buff) return false
    return (
      (typeof buff.stimUntil === 'number' && buff.stimUntil > t) ||
      (typeof buff.beastOilUntil === 'number' && buff.beastOilUntil > t) ||
      (typeof buff.renewUntil === 'number' && buff.renewUntil > t) ||
      buff.rush === true ||
      buff.doubleMist === 2 ||
      buff.doubleMist === 3
    )
  })
}

function combatStarted(save: Save): boolean {
  if ((save.departCount ?? 0) >= 1) return true
  if ((save.mainLootClaims ?? 0) >= 1) return true
  return save.encounters?.some((enc) => {
    if (enc.kind !== 'enemy') return false
    if (enc.lootClaimed || enc.departed) return true
    return enc.combat != null
  }) ?? false
}

function herbCounterLive(save: Save): boolean {
  const plots = save.herbPvp?.plots ?? []
  for (const plot of plots) {
    if (!plot.workerId) continue
    const worker = save.workers?.find((row) => row.id === plot.workerId)
    if (worker && herbWorkerCounters(worker.combatAttrs, plot.weakness)) return true
  }
  return false
}

function runeLoadoutOn(loadout: Partial<Record<string, string>> | undefined): boolean {
  return !!loadout && Object.values(loadout).some((id) => typeof id === 'string' && id.length > 0)
}

function runeFightLive(save: Save): boolean {
  const boards = [...(save.encounters ?? []), ...(save.dungeon?.encounters ?? [])]
  return boards.some((enc) => enc.kind === 'enemy' && runeLoadoutOn(enc.combat?.runeLoadout))
}

function feastLive(save: Save): boolean {
  const buff = save.workshopBuff
  return buff?.kind === 'feast' && typeof buff.endsAt === 'number' && buff.endsAt > Date.now()
}

function guardLive(save: Save): boolean {
  const nowS = save.elapsedS ?? 0
  return (save.treasureMines?.mines ?? []).some((mine) => {
    const fort = mine.fortifyUntilS
    const trap = mine.trapUntilS
    return (typeof fort === 'number' && fort > nowS) || (typeof trap === 'number' && trap > nowS)
  })
}

/** 当场还能看出来的完成条件。累计数也算在这里，所以日切后仍然成立。 */
export function mainlineLive(save: Save, id: string): boolean {
  const stats = statsOf(save)
  const taskRow = TASK_BY_ID.get(id)
  if (taskRow?.tier === 'level') return knightLevelOf(save) >= taskRow.gate
  switch (id) {
    case 'recruit':
      return recruited(save)
    case 'autoHerb':
      return onStation(save, 'herbalism') || (save.stations?.herbalism?.completed ?? 0) >= 1
    case 'herbQueue':
      return (save.stations?.herbalism?.manualRounds ?? 0) >= 2
    case 'autoLine':
      return Object.values(save.stations ?? {}).some((station) => station?.auto === true)
    case 'fuse':
      return maxQuality(save) >= 2
    case 'alchemy':
      return potionProduced(save)
    case 'combat':
      return combatStarted(save)
    case 'potionInstall':
      return save.potionSlots?.some((slot) => slot != null) ?? false
    case 'potionUse':
      return potionUsed(save)
    case 'firstBlood':
      return (save.mainLootClaims ?? 0) >= 1 || (save.mainChapter ?? 1) >= 2
    case 'explore':
      return (save.exploreCount ?? 0) >= 1
    case 'alchemy3':
      return (save.stations?.alchemy?.stationLevel ?? 1) >= 3
    case 'blueWorker':
      return maxQuality(save) >= 3
    case 'slotsFull':
      return (save.potionSlots?.length ?? 0) >= 4 && save.potionSlots.every((slot) => slot != null)
    case 'chapter2':
      return (save.mainChapter ?? 1) >= 2
    case 'huntStart':
      return onStation(save, 'hunting')
    case 'market':
      return stats.marketDeals >= 1 || marketBoardDone(save, () => true)
    case 'huntHaul':
      return (save.stations?.hunting?.completed ?? 0) >= 10
    case 'pawn':
      return stats.marketPawn >= 1 || marketBoardDone(save, (enc) => enc.kind === 'pawn')
    case 'timed':
      return stats.marketTimed >= 1 || marketBoardDone(save, (enc) => enc.timedUntil != null)
    case 'herbSickle':
      return (save.stations?.herbalism?.stationLevel ?? 1) >= 5
    case 'huntWolf':
      return stationAt(save, 'hunting', 5, 'iron')
    case 'cookStart':
      return onStation(save, 'cooking')
    case 'restFood':
      return save.restFoodId != null
    case 'dungeon':
      return stats.dungeonRuns >= 1 || Object.values(save.dungeon?.attemptsUsedById ?? {}).some((n) => typeof n === 'number' && n > 0)
    case 'stockFood':
      return foodSum(save) >= 10
    case 'chest':
      return stats.dungeonChests >= 1
    case 'dungeonBoth':
      return stats.dungeonBoth
    case 'marketHigh':
      return stats.marketHigh >= 1 || marketBoardDone(save, (enc) => enc.quality === 'purple' || enc.quality === 'orange')
    case 'herbAssign':
      return stats.herbAssigns >= 1 || (save.herbPvp?.plots?.some((plot) => !!plot.workerId) ?? false)
    case 'herb':
      return stats.herbPrecious >= 1 || (save.herbPvp?.playerScore ?? 0) > 0
    case 'herbCounter':
      return stats.herbCounter >= 1 || herbCounterLive(save)
    case 'cookStew':
      return stationAt(save, 'cooking', 5, 'mithril') && save.restFoodId === 'stew'
    case 'tech':
      return litTech(save).size > 0
    case 'techTabs':
      return tabHasTech(save, 'production') && tabHasTech(save, 'combat') && tabHasTech(save, 'affairs')
    case 'herbPayout':
      return stats.herbPayouts >= 1
    case 'marketSlot':
      return litTech(save).has('marketLicense')
    case 'dungeonGold':
      return stats.dungeonGoldChests >= 1
    case 'huntDeer':
      return stationAt(save, 'hunting', 10, 'mithril')
    case 'chapter3':
      return (save.mainChapter ?? 1) >= 3
    case 'beast':
      return stats.beastChallenges >= 1 || (save.beastPvp?.playerDamage ?? 0) > 0
    case 'beastManual':
      return (
        stats.beastManual >= 1 ||
        Object.values(save.beastPvp?.reacts ?? {}).some((react) => react === 'dodge' || react === 'interrupt' || react === 'cower')
      )
    case 'boneSoup':
      return itemQty(save, 'boneSoup') > 0 || save.restFoodId === 'boneSoup'
    case 'cyanWorker':
      return maxQuality(save) >= 4
    case 'tech8':
      return litTech(save).size >= 8
    case 'feast':
      return stats.feast || feastLive(save)
    case 'mining':
      return onStation(save, 'mining')
    case 'crystal':
      return itemQty(save, 'wildCrystal') >= 10
    case 'miningIron':
      return stationAt(save, 'mining', 5, 'iron')
    case 'veteran':
      return maxCombatLevel(save) >= 8
    case 'oreDeal':
      return stats.marketOre >= 1
    case 'inscribe':
      return onStation(save, 'inscription')
    case 'rune':
      return save.guideQuestRuneOpened === true
    case 'runeCraft':
      return (save.stations?.inscription?.completed ?? 0) >= 1
    case 'runeWin':
      return stats.runeFights >= 1 || stats.runeWins >= 1 || runeFightLive(save)
    case 'stationsOpen':
      return STATION_ORDER.every((id) => onStation(save, id))
    case 'miningMithril':
      return stationAt(save, 'mining', 10, 'mithril')
    case 'inscribe5':
      return (save.stations?.inscription?.stationLevel ?? 1) >= 5
    case 'chapter5':
      return (save.mainChapter ?? 1) >= 5
    case 'treasure':
      return haulSum(save) > 0
    case 'scout':
      return stats.treasureScouted >= 1 || (save.treasureMines?.mines ?? []).some((mine) => mineFullyOpen(mine))
    case 'raid':
      return stats.treasureRaids >= 1
    case 'guard':
      return stats.treasureGuarded >= 1 || guardLive(save)
    case 'banner1':
      return bannerLevelOf(save) >= 1
    case 'banner3':
      return bannerLevelOf(save) >= 3
    case 'purpleWorker':
      return maxQuality(save) >= 5
    case 'chapter8':
      return (save.mainChapter ?? 1) >= 8
    case 'stations10':
      return STATION_ORDER.every((id) => (save.stations?.[id]?.stationLevel ?? 1) >= 10)
    case 'banner5':
      return bannerLevelOf(save) >= 5
    default:
      return false
  }
}

export function mainlineDone(save: Save, id: string): boolean {
  return metHas(save, id) || mainlineLive(save, id)
}

function rawMeter(save: Save, id: string): { numer: number; denom: number } | null {
  switch (id) {
    case 'recruit':
      return { numer: guideRecruitCount(save), denom: 2 }
    case 'huntHaul':
      return { numer: save.stations?.hunting?.completed ?? 0, denom: 10 }
    case 'stockFood':
      return { numer: foodSum(save), denom: 10 }
    case 'crystal':
      return { numer: itemQty(save, 'wildCrystal'), denom: 10 }
    case 'tech8':
      return { numer: litTech(save).size, denom: 8 }
    case 'chapter2':
      return { numer: save.mainChapter ?? 1, denom: 2 }
    case 'chapter3':
      return { numer: save.mainChapter ?? 1, denom: 3 }
    case 'chapter5':
      return { numer: save.mainChapter ?? 1, denom: 5 }
    case 'chapter8':
      return { numer: save.mainChapter ?? 1, denom: 8 }
    case 'veteran':
      return { numer: maxCombatLevel(save), denom: 8 }
    case 'stationsOpen':
      return { numer: STATION_ORDER.filter((stationId) => onStation(save, stationId)).length, denom: STATION_ORDER.length }
    case 'stations10':
      return {
        numer: STATION_ORDER.filter((stationId) => (save.stations?.[stationId]?.stationLevel ?? 1) >= 10).length,
        denom: STATION_ORDER.length,
      }
    case 'banner1':
      return { numer: bannerLevelOf(save), denom: 1 }
    case 'banner3':
      return { numer: bannerLevelOf(save), denom: 3 }
    case 'banner5':
      return { numer: bannerLevelOf(save), denom: 5 }
    default:
      return null
  }
}

export function mainlineMeter(save: Save, id: string): { numer: number; denom: number; done: boolean } {
  const done = mainlineDone(save, id)
  const raw = rawMeter(save, id)
  if (!raw) return { numer: done ? 1 : 0, denom: 1, done }
  const denom = Math.max(1, raw.denom)
  const numer = done ? denom : Math.max(0, Math.min(denom, raw.numer))
  return { numer, denom, done }
}

export function mainlineRewardLabel(reward: MainlineReward): string {
  const parts: string[] = []
  if (reward.gold) parts.push(`金币 +${reward.gold}`)
  if (reward.diamonds) parts.push(`钻石 +${reward.diamonds}`)
  for (const item of reward.items ?? []) parts.push(`${item.label} ×${item.qty}`)
  for (const item of reward.vault ?? []) parts.push(`${item.label} ×${item.qty}`)
  if (reward.probes) parts.push(`侦测 ×${reward.probes}`)
  if (reward.inspiration) parts.push(`灵感 +${reward.inspiration}`)
  if (reward.xp) parts.push(`酋长经验 +${reward.xp}`)
  return parts.join('、') || '完成'
}

export function payMainlineReward(save: Save, reward: MainlineReward): string {
  if (reward.gold) save.gold += reward.gold
  if (reward.diamonds) save.diamonds += reward.diamonds
  for (const item of reward.items ?? []) addToBank(save, item.id, item.qty)
  for (const item of reward.vault ?? []) addVault(save, item.id, item.qty)
  if (reward.probes) grantHerbProbes(save, reward.probes)
  if (reward.inspiration) save.techPoints = Math.max(0, Math.floor(save.techPoints ?? 0)) + reward.inspiration
  if (reward.xp) grantKnightXp(save, reward.xp)
  return mainlineRewardLabel(reward)
}

/**
 * 只给当前这一条记「达成过」。任务还没轮到时不算，轮到之后离岗或日切也不收回。
 * 不在渲染时写档。
 */
export function syncGuideQuestMet(save: Save): void {
  if (!Array.isArray(save.guideQuestMet)) save.guideQuestMet = []
  const step = typeof save.guideQuestStep === 'number' ? Math.floor(save.guideQuestStep) : 1
  const row = mainlineTaskAt(step)
  if (!row || !mainlineLive(save, row.id)) return
  if (save.guideQuestMet.includes(row.id)) return
  save.guideQuestMet = [...save.guideQuestMet, row.id]
}

export function blankSkipMask(): number[] {
  return [0, 0, 0]
}

/** 当前档是 3 个字。单个数字只当作第 1 个字。 */
export function normalizeSkipMask(raw: unknown): number[] {
  const words = blankSkipMask()
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    words[0] = Math.max(0, Math.floor(raw))
    return words
  }
  if (!Array.isArray(raw)) return words
  for (let i = 0; i < words.length; i += 1) {
    const value = raw[i]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) words[i] = Math.floor(value)
  }
  return words
}

export function skipMaskHas(mask: readonly number[], step: number): boolean {
  if (step < 1 || step > GUIDE_SKIP_CAP) return false
  const index = step - 1
  const word = Math.floor(index / SKIP_WORD_BITS)
  const bit = index % SKIP_WORD_BITS
  return ((mask[word] ?? 0) & (1 << bit)) !== 0
}

export function skipMaskSet(mask: number[], step: number): void {
  if (step < 1 || step > GUIDE_SKIP_CAP) return
  const index = step - 1
  const word = Math.floor(index / SKIP_WORD_BITS)
  const bit = index % SKIP_WORD_BITS
  mask[word] = (mask[word] ?? 0) | (1 << bit)
}

function writeSkipMask(skipped: ReadonlySet<string>): number[] {
  const mask = blankSkipMask()
  MAINLINE_TASKS.forEach((row, index) => {
    if (skipped.has(row.id)) skipMaskSet(mask, index + 1)
  })
  return mask
}

export function normalizeGuideIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const id of raw) {
    if (typeof id !== 'string' || !id || out.includes(id)) continue
    out.push(id)
  }
  return out
}

export function taskModuleReady(save: Save, row: MainlineTask): boolean {
  if (!row.module) return true
  return isModuleUnlocked(save, row.module)
}

/** 主线步号已经走过、或跳过位图里的等级任务，打开该级功能。 */
export function grantPassedLevelModules(save: Save): void {
  const step = typeof save.guideQuestStep === 'number' && Number.isFinite(save.guideQuestStep) ? Math.floor(save.guideQuestStep) : 1
  const skipped = new Set(save.guideQuestSkipped ?? [])
  const ids: ModuleId[] = []
  for (const row of MAINLINE_TASKS) {
    if (row.tier !== 'level') continue
    const at = mainlineStepOf(row.id)
    if (at > 0 && (step > at || skipped.has(row.id))) ids.push(...modulesAtGate(row.gate))
  }
  grantOpenedModules(save, ids)
}

bindMainlineModuleGate((save, level) => {
  const id = `level${level}`
  const at = mainlineStepOf(id)
  if (at <= 0) return false
  const step =
    typeof save.guideQuestStep === 'number' && Number.isFinite(save.guideQuestStep) ? Math.floor(save.guideQuestStep) : 1
  if (step > at) return true
  return (save.guideQuestSkipped ?? []).includes(id)
})
