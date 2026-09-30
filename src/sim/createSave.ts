import { blankDungeonState } from './dungeon'
import { PLAYER_AVATAR_DEFAULT, playerAvatarId } from './playerAvatarIds'
import { hydrateBeastPvp } from './beastPvp'
import { hydrateHerbPvp } from './herbPvp'
import { hydrateTreasureMines } from './treasureMine'
import { generateEncounterBoard } from './encounters'
import { GUIDE_QUEST_REV } from './guideQuest'
import { blankSkipMask } from './mainlineQuest'
import { blankGuideQuestStats } from './mainlineStats'
import { battlefieldSlotCount, marketSlotCount } from './tech'
import { hydrateStations } from './stationProgress'
import { blankPotionSlots } from './potionSlots'
import { blankTravelingMerchant } from './travelingMerchant'
import { START_DIAMONDS, START_GOLD, START_TECH_POINTS, WORKER_QUALITY_REV } from './tables'

/** 对不上这个版本的存档整档丢弃，重新开一局。 */
export const SAVE_VERSION = 4
import type { ActionResult, BeastPvpState, HerbPvpState, Save } from './types'
import { PLAYER_NAME_DEFAULT, playerDisplayName } from './playerName'

export { blankStation } from './stationProgress'
export { PLAYER_NAME_DEFAULT, PLAYER_NAME_LEGACY_DEFAULT, playerDisplayName } from './playerName'

export { PLAYER_AVATAR_DEFAULT, PLAYER_AVATAR_IDS, playerAvatarId, type PlayerAvatarId } from './playerAvatarIds'

/** 确认改名改头像。空名字兜底见习酋长，未知头像兜底獠牙。 */
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
    saveVersion: SAVE_VERSION,
    nextWorkerId: 1,
    encounters: [],
    marketEncounters: [],
    mainChapter: 1,
    mainLootClaims: 0,
    guideQuestStep: 1,
    guideQuestRev: GUIDE_QUEST_REV,
    guideQuestPotionUsed: false,
    guideQuestRuneOpened: false,
    openedModules: [],
    seenModules: [],
    mainlineUnlockRev: 1,
    moduleUnlockQueue: [],
    guideQuestSkipMask: blankSkipMask(),
    guideQuestSkipped: [],
    guideQuestMet: [],
    guideQuestStats: blankGuideQuestStats(),
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
    /** 新档：酋长 1 级、经验 0，灵感 START_TECH_POINTS。等级只跟酋长经验走。 */
    knightLevel: 1,
    knightXp: 0,
    techPoints: START_TECH_POINTS,
    unlockedTechIds: [],
    techLevels: {},
    potionSlots: blankPotionSlots(),
    travelingMerchant: blankTravelingMerchant(),
    dungeon: blankDungeonState(undefined, 1),
    treasureMines: {
      nextId: 1,
      roll: 1,
      vault: {},
      mines: [],
      bannerLevel: 0,
      bounty: null,
      haul: {},
      dayKey: '',
      dayHaul: 0,
    },
    herbPvp: undefined as unknown as HerbPvpState,
    beastPvp: undefined as unknown as BeastPvpState,
  }
  save.dungeon = blankDungeonState(save, 1)
  save.encounters = generateEncounterBoard(0, battlefieldSlotCount(save), {
    rng: save,
    mainChapter: save.mainChapter,
    board: 'battlefield',
    starterGuideEnemy: true,
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
  hydrateHerbPvp(save)
  hydrateBeastPvp(save)
  return save
}
