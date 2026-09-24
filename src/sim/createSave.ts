import { blankDungeonState } from './dungeon'
import { PLAYER_AVATAR_DEFAULT, playerAvatarId } from './playerAvatarIds'
import { hydrateTreasureMines } from './treasureMine'
import { generateEncounterBoard } from './encounters'
import { GUIDE_QUEST_REV } from './guideQuest'
import { battlefieldSlotCount, marketSlotCount } from './tech'
import { computeKnightLevel } from './knightLevel'
import { blankPotionBuffs } from './potions'
import { hydrateStations } from './stationProgress'
import { blankPotionSlots } from './potionSlots'
import { START_DIAMONDS, START_GOLD, START_TECH_POINTS, WORKER_QUALITY_REV } from './tables'
import type { ActionResult, Save } from './types'

export { blankStation } from './stationProgress'

/** 我方玩家显示名。存档缺字段、空串或非字符串时用这个，不覆盖已有自定义名。 */
export const PLAYER_NAME_DEFAULT = '见习勇者'

export function playerDisplayName(value: unknown): string {
  if (typeof value !== 'string') return PLAYER_NAME_DEFAULT
  const trimmed = value.trim()
  return trimmed || PLAYER_NAME_DEFAULT
}

export { PLAYER_AVATAR_DEFAULT, PLAYER_AVATAR_IDS, playerAvatarId, type PlayerAvatarId } from './playerAvatarIds'

/** 确认改名改头像。空名字兜底见习勇者，未知头像兜底盔。 */
export function applyPlayerProfile(save: Save, name: unknown, avatar: unknown): ActionResult {
  save.playerName = playerDisplayName(name)
  save.playerAvatarId = playerAvatarId(avatar)
  return { ok: true }
}

/** 缺字段 / 非数字 → 新档初始钻石；已有数字（含 0）只夹成非负整数，不每次重灌。 */
export function normalizeDiamonds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return START_DIAMONDS
  return Math.max(0, Math.floor(value))
}

export function createSave(): Save {
  const stations = hydrateStations()
  const save: Save = {
    gold: START_GOLD,
    diamonds: START_DIAMONDS,
    playerName: PLAYER_NAME_DEFAULT,
    playerAvatarId: PLAYER_AVATAR_DEFAULT,
    bank: {},
    restFoodId: null,
    workers: [],
    stations,
    lastTick: Date.now(),
    elapsedS: 0,
    nextWorkerId: 1,
    encounters: [],
    marketEncounters: [],
    mainChapter: 1,
    mainLootClaims: 0,
    guideQuestStep: 1,
    guideQuestRev: GUIDE_QUEST_REV,
    guideQuestPotionUsed: false,
    guideQuestRuneOpened: false,
    workshopHpEfficiencyTipShown: false,
    fuseDragTipDone: false,
    starterCopperPawnDone: false,
    workshopBuff: null,
    exploreCount: 0,
    departCount: 0,
    lastDepartAt: null,
    messages: [],
    nextMessageId: 1,
    offlineCount: 0,
    rngState: 1,
    forgedTools: [],
    workerQualityRev: WORKER_QUALITY_REV,
    /** 新档：骑士 1 级，灵感 START_TECH_POINTS。六站开局都是 Lv1，公式见 computeKnightLevel。 */
    knightLevel: 1,
    techPoints: START_TECH_POINTS,
    unlockedTechIds: [],
    techLevels: {},
    potionSlots: blankPotionSlots(),
    potionBuffs: blankPotionBuffs(),
    dungeon: blankDungeonState(undefined, 1),
    treasureMines: { nextId: 1, roll: 1, vault: {}, mines: [] },
  }
  save.dungeon = blankDungeonState(save, 1)
  save.knightLevel = computeKnightLevel(save)
  save.encounters = generateEncounterBoard(0, battlefieldSlotCount(save), {
    rng: save,
    mainChapter: save.mainChapter,
    board: 'battlefield',
    save,
  })
  save.marketEncounters = generateEncounterBoard(17, marketSlotCount(save), {
    rng: save,
    mainChapter: save.mainChapter,
    board: 'market',
    starterCopperPawn: true,
    save,
  })
  hydrateTreasureMines(save)
  return save
}
