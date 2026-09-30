import { reactive } from 'vue'
import { isWorkerInCombat } from '../sim/combat'
import { isGuideQuestDone } from '../sim/guideQuest'
import { knightLevelOf } from '../sim/stationUnlock'
import { PLAYABLE_STATION_IDS } from '../sim/tables'
import { isWorkerInTreasureMine } from '../sim/treasureMineQuery'
import type { Save } from '../sim/types'
import { isWorkerDragActive } from './workerDrag'
import { workshopBanterText } from './workshopBanter'

/** 骑士未到狩猎（5 级）才算前期。到 5 级停。 */
export const WORKER_TUTOR_KNIGHT_MAX = 5

/** 气泡停留。工坊页约每秒看一次时钟，到点即收。 */
export const WORKER_TUTOR_LIFE_MS = 5000

/** 收起后再隔这么久才抽下一句。点掉也走这段。 */
export const WORKER_TUTOR_GAP_MS = 7000

/**
 * 与现规则一致：两人都在营地才能合成；不能拖空槽上岗，也不能拖到站上合成。
 * 队首上工、满血、回营地排到队尾、点站卡派工、右上角标里挂自动。
 */
export const WORKER_TUTOR_LINES = [
  '同品质要在营地里拖到对方身上合成，别拖空槽，也别拖到站上',
  '自动线做完一轮回营地队尾，再拉满血队首；队首太弱会堵住后面',
  '满血才能上岗',
  '回营地的苦工排到队尾，不会堵在队首',
  '点站卡派工，右上角标里可以挂自动',
] as const

export type WorkerTutorBubble = {
  id: number
  workerId: string
  text: string
  until: number
}

type TutorRng = () => number

const state = reactive({
  bubble: null as WorkerTutorBubble | null,
  readyAt: 0,
  lastText: '',
})

let nextId = 1

export function isWorkerTutorActive(save: Save): boolean {
  return knightLevelOf(save) < WORKER_TUTOR_KNIGHT_MAX && !isGuideQuestDone(save)
}

export function workerTutorBubble(): WorkerTutorBubble | null {
  return state.bubble
}

export function workerTutorText(workerId: string): string {
  const bubble = state.bubble
  if (!bubble || bubble.workerId !== workerId) return ''
  return bubble.text
}

function unitRoll(rng: TutorRng): number {
  const n = rng()
  if (!Number.isFinite(n) || n < 0) return 0
  if (n >= 1) return 1 - 1e-9
  return n
}

function pickIndex(length: number, roll: number): number {
  if (length <= 1) return 0
  const index = Math.floor(roll * length)
  if (index < 0) return 0
  if (index >= length) return length - 1
  return index
}

/** 避开上一句。只剩一句时允许重复。 */
export function pickWorkerTutorLine(roll: number, previous = ''): string {
  const pool = WORKER_TUTOR_LINES.filter((line) => line !== previous)
  const lines = pool.length > 0 ? pool : WORKER_TUTOR_LINES
  return lines[pickIndex(lines.length, roll)] ?? WORKER_TUTOR_LINES[0]
}

/** 人还在六个生产站上，且不在战斗、夺宝。营地休息和排队不算。 */
function isStationTutorSpeaker(save: Save, workerId: string): boolean {
  const worker = save.workers.find((row) => row.id === workerId)
  if (!worker?.assignment) return false
  return (
    (PLAYABLE_STATION_IDS as readonly string[]).includes(worker.assignment) &&
    !isWorkerInCombat(save, worker.id) &&
    !isWorkerInTreasureMine(save, worker.id)
  )
}

function onDutyTutorIds(save: Save): string[] {
  return save.workers
    .filter((worker) => isStationTutorSpeaker(save, worker.id) && !workshopBanterText(worker.id))
    .map((worker) => worker.id)
}

/**
 * 只挂六个生产站上、未战斗、未夺宝、且没在说工坊闲话的人。
 * 营地休息、排队队首和战斗区不说。不挂空槽。
 */
export function workerTutorCandidateIds(save: Save): string[] {
  return onDutyTutorIds(save)
}

function expire(now: number) {
  const bubble = state.bubble
  if (bubble && now >= bubble.until) state.bubble = null
}

/**
 * 前期才出。同屏最多 1 条，只挂在岗苦工。拖拽中、还在停留、或冷却未到，都不新开。
 * 说话的人离开工位（回营地、进战斗或夺宝）则收起，不改到休息或队首上。
 * 过了前期门槛则清掉，之后不再刷。
 */
export function considerWorkerTutor(
  save: Save,
  now: number,
  rng: TutorRng = Math.random,
): WorkerTutorBubble | null {
  expire(now)
  if (!isWorkerTutorActive(save)) {
    state.bubble = null
    return null
  }
  if (state.bubble && !isStationTutorSpeaker(save, state.bubble.workerId)) state.bubble = null
  if (isWorkerDragActive()) return state.bubble
  if (state.bubble) return state.bubble
  if (now < state.readyAt) return null
  const ids = workerTutorCandidateIds(save)
  if (!ids.length) return null
  const workerId = ids[pickIndex(ids.length, unitRoll(rng))] ?? ids[0]
  const text = pickWorkerTutorLine(unitRoll(rng), state.lastText)
  const bubble: WorkerTutorBubble = {
    id: nextId++,
    workerId,
    text,
    until: now + WORKER_TUTOR_LIFE_MS,
  }
  state.bubble = bubble
  state.lastText = text
  state.readyAt = now + WORKER_TUTOR_LIFE_MS + WORKER_TUTOR_GAP_MS
  return bubble
}

/** 点一下收起，并进入冷却。 */
export function dismissWorkerTutor(now: number) {
  if (!state.bubble) return
  state.bubble = null
  state.readyAt = now + WORKER_TUTOR_GAP_MS
}

/** 离开工坊页时收起气泡，冷却照旧。 */
export function hideWorkerTutor() {
  state.bubble = null
}

export function resetWorkerTutorForTests() {
  state.bubble = null
  state.readyAt = 0
  state.lastText = ''
  nextId = 1
}
