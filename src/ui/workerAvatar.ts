import { isWorkerRaceId, raceFromWorkerId } from '../sim/workerRace'
import { WORKER_RACE_IDS, type WorkerRaceId } from '../sim/types'

const RACE_AVATAR_FILES = import.meta.glob('../assets/workerRaces/*.webp', {
  eager: true,
  import: 'default',
}) as Record<string, string>

/** 小 24、中 32、大 48。描边 24/32 为 2px，48 为 3px。 */
export const WORKER_AVATAR_PX = {
  sm: 24,
  md: 32,
  lg: 48,
} as const

export type WorkerAvatarSize = keyof typeof WORKER_AVATAR_PX

export function isWorkerAvatarSize(value: unknown): value is WorkerAvatarSize {
  return value === 'sm' || value === 'md' || value === 'lg'
}

export function workerAvatarPx(size: WorkerAvatarSize): number {
  return WORKER_AVATAR_PX[size]
}

export function workerAvatarBorderPx(size: WorkerAvatarSize): number {
  return size === 'lg' ? 3 : 2
}

function raceFileUrl(id: string): string | null {
  for (const [path, url] of Object.entries(RACE_AVATAR_FILES)) {
    if (path.endsWith(`/${id}.webp`) && url) return url
  }
  return null
}

/** 每个种族 id 一张图。认不出的种族用兽人，不抛。 */
export function workerRaceAvatarUrl(race: unknown): string {
  const id = isWorkerRaceId(race) ? race : 'orc'
  return raceFileUrl(id) ?? raceFileUrl('orc') ?? ''
}

/**
 * 旧档或缺字段：有合法种族用它；否则按苦工 id 落到固定种族；再没有就用兽人。
 */
export function workerAvatarRace(race: unknown, workerId?: string | null): WorkerRaceId {
  if (isWorkerRaceId(race)) return race
  if (typeof workerId === 'string' && workerId.length > 0) return raceFromWorkerId(workerId)
  return 'orc'
}

export function workerRaceAvatarReady(): boolean {
  return WORKER_RACE_IDS.every((id) => !!raceFileUrl(id))
}
