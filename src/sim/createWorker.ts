import type { ActionResult, ClassId, Save, Worker } from './types'

export function createWorker(save: Save, classId: ClassId, name?: string): ActionResult {
  const worker: Worker = {
    id: `w-${save.nextWorkerId}`,
    classId,
    combatLevel: 1,
    combatXp: 0,
    knownCombatSkills: [],
    assignment: null,
  }
  if (name) worker.name = name
  save.nextWorkerId += 1
  save.workers.push(worker)
  return { ok: true }
}

export function findWorker(save: Save, workerId: string): Worker | undefined {
  return save.workers.find((w) => w.id === workerId)
}
