import { reactive } from 'vue'
import { restingWorkers } from '../sim/assign'
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
 * 与现规则一致：休息区互合，或休息工人拖到站上同品质；不能拖空槽上岗。
 * 队首上工、满血、封闭、回休息进队尾、不能手动上下岗。
 */
export const WORKER_TUTOR_LINES = [
  '拖同品质可以合成更强的：休息区互合，或拖到站上同品质的人，别拖空槽',
  '休息区按队首上工，队首太弱会堵住后面',
  '满血才能上岗',
  '站可以封闭，封闭后不再自动进人',
  '回休息排到队尾，不会堵在队首',
  '不能手动上下岗，等队首自动上',
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

/** 优先休息区。跳过战斗、夺宝，以及已经挂着工坊闲话的人。不挂空槽。 */
export function workerTutorCandidateIds(save: Save): string[] {
  const resting = restingWorkers(save)
    .map((worker) => worker.id)
    .filter((id) => !workshopBanterText(id))
  if (resting.length) return resting
  return save.workers
    .filter(
      (worker) =>
        worker.assignment != null &&
        (PLAYABLE_STATION_IDS as readonly string[]).includes(worker.assignment) &&
        !isWorkerInCombat(save, worker.id) &&
        !isWorkerInTreasureMine(save, worker.id) &&
        !workshopBanterText(worker.id),
    )
    .map((worker) => worker.id)
}

function expire(now: number) {
  const bubble = state.bubble
  if (bubble && now >= bubble.until) state.bubble = null
}

/**
 * 前期才出。同屏最多 1 条。拖拽中、还在停留、或冷却未到，都不新开。
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
