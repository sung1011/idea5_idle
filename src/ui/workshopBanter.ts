import { reactive } from 'vue'
import {
  BANTER_BUBBLE_MS,
  considerWorkshopBanter,
  blankBanterMemory,
  type BanterEvent,
  type BanterMemory,
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
