import { reactive } from 'vue'
import { isWorkerInCombat } from '../sim/combat'
import {
  BANTER_BUBBLE_MS,
  considerWorkshopBanter,
  planWorkshopBanter,
  blankBanterMemory,
  type BanterEvent,
  type BanterMemory,
  type BanterRng,
} from '../sim/workshopBanter'
import type { Save, StationId } from '../sim/types'
import { STATION_IDS } from '../sim/tables'
import { appTab, workshopGroup } from './appNav'
import { stationsOfWorkshopGroup } from './workshopTabs'
import { isWorkerDragActive } from './workerDrag'

export const WORKSHOP_BANTER_KEY = 'workshopBanter'

export type WorkshopBanterBubble = {
  id: number
  workerId: string
  text: string
}

const bubbles = reactive<Partial<Record<StationId, WorkshopBanterBubble | null>>>({})
const memory: BanterMemory = blankBanterMemory()
let nextId = 1
let epoch = 0
let greeted = false

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

/** 缺省开。`0` / `false` / `off` 关。 */
export function loadWorkshopBanter(storage?: Storage | null): boolean {
  const store = storageOf(storage)
  if (!store) return true
  try {
    const raw = store.getItem(WORKSHOP_BANTER_KEY)
    if (raw == null || raw.trim() === '') return true
    const text = raw.trim().toLowerCase()
    return text !== '0' && text !== 'false' && text !== 'off'
  } catch {
    return true
  }
}

export function saveWorkshopBanter(on: boolean, storage?: Storage | null): boolean {
  const store = storageOf(storage)
  if (!store) return on
  try {
    store.setItem(WORKSHOP_BANTER_KEY, on ? '1' : '0')
  } catch {
    // quota / private mode
  }
  return on
}

export function workshopBanterBubble(stationId: StationId): WorkshopBanterBubble | null {
  return bubbles[stationId] ?? null
}

function later(fn: () => void, ms: number) {
  const timer = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout
  timer(fn, ms)
}

function stationOnScreen(stationId: StationId): boolean {
  if (appTab.value !== 'workshop') return false
  return stationsOfWorkshopGroup(workshopGroup.value).includes(stationId)
}

function showBubble(stationId: StationId, workerId: string, text: string) {
  if (!stationOnScreen(stationId)) return
  const id = nextId++
  for (const sid of STATION_IDS) {
    if (sid !== stationId) bubbles[sid] = null
  }
  bubbles[stationId] = { id, workerId, text }
  later(() => {
    if (bubbles[stationId]?.id === id) bubbles[stationId] = null
  }, BANTER_BUBBLE_MS)
}

/** 当前不在工坊、或该站不在屏上，这一拍丢掉，不排队补播。 */
export function playWorkshopBanter(event: BanterEvent) {
  const token = epoch
  for (const beat of event.beats) {
    const fire = () => {
      if (token !== epoch) return
      showBubble(beat.stationId, beat.workerId, beat.text)
    }
    if (beat.delayMs <= 0) fire()
    else later(fire, beat.delayMs)
  }
}

/** 测例复位。清掉「已经打过招呼」和冷却，避免用例互相吃掉强制那一次。 */
export function resetWorkshopBanterForTests() {
  greeted = false
  epoch += 1
  memory.lastEventS = -1
  memory.cooldownS = 0
  memory.busyUntilS = 0
  memory.workerAt = {}
  for (const sid of STATION_IDS) bubbles[sid] = null
}

/** 离开工坊页时停掉未播的一拍，清掉还挂着的气泡。 */
export function dismissWorkshopBanter() {
  epoch += 1
  for (const sid of STATION_IDS) bubbles[sid] = null
}

export function offerWorkshopBanter(save: Save, successStationIds: readonly StationId[]) {
  if (!loadWorkshopBanter()) return
  const event = considerWorkshopBanter({
    save,
    nowS: save.elapsedS,
    memory,
    dragging: isWorkerDragActive(),
    successStationIds,
    rng: Math.random,
  })
  if (!event) return
  playWorkshopBanter(event)
}

function onDutyWorkers(save: Save) {
  return save.workers.filter((worker) => worker.assignment != null && !isWorkerInCombat(save, worker.id))
}

/**
 * 第一次进入工坊页时调用。人还不在工坊页则直接返回，不记已打招呼、不写冷却。
 * 当前分组屏上有在岗且未战斗的人才播；算出的站不在屏上则不 commit。
 * 人在工坊但无人在岗，或开关关着，记一次跳过，之后不补播。
 */
export function greetWorkshopBanter(save: Save, rng: BanterRng = Math.random) {
  if (greeted) return
  if (appTab.value !== 'workshop') return
  if (isWorkerDragActive()) return
  if (!loadWorkshopBanter()) {
    greeted = true
    return
  }
  const visible = stationsOfWorkshopGroup(workshopGroup.value)
  const crew = onDutyWorkers(save)
  if (!crew.length) {
    greeted = true
    return
  }
  if (!crew.some((worker) => worker.assignment != null && visible.includes(worker.assignment))) return
  const planned = planWorkshopBanter({
    save,
    nowS: save.elapsedS,
    memory,
    dragging: false,
    successStationIds: [],
    rng,
    forced: true,
    onlyStationIds: visible,
  })
  if (!planned || !stationOnScreen(planned.event.stationId)) return
  planned.apply()
  greeted = true
  playWorkshopBanter(planned.event)
}
