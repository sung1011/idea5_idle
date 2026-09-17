import { workerQualityDef } from '../sim/tables'
import type { Worker } from '../sim/types'

export function qualityOf(worker: Worker) {
  return workerQualityDef(worker.qualityTier)
}

/** 浅档用深字，其余角标白字，避免羊皮纸上白/粉/金看不清。 */
export function qualityInk(worker: Worker) {
  const id = qualityOf(worker).id
  return id === 'white' || id === 'gold' || id === 'cyan' || id === 'pink' ? '#5a3a10' : '#fffdf8'
}

export function workerQualityToneClass(worker: Worker) {
  const id = qualityOf(worker).id
  return {
    rainbow: id === 'rainbow',
    pink: id === 'pink',
  }
}

export function workerQualityCardStyle(worker: Worker) {
  const color = qualityOf(worker).color
  return {
    borderColor: color,
    boxShadow: `inset 6px 0 0 ${color}, 0 3px 0 var(--gold-deep), inset 0 0 0 2px #fff8e0`,
  }
}

export function workerQualityBadgeStyle(worker: Worker) {
  return {
    color: qualityInk(worker),
    background: qualityOf(worker).color,
    borderColor: qualityOf(worker).color,
  }
}

/** 选人列表名字色：用档表色；白档等浅色改偏深棕，羊皮纸上能看清。 */
export function workerQualityNameStyle(worker: Worker) {
  const { id, color } = qualityOf(worker)
  return {
    color: id === 'white' ? '#5a3a10' : color,
  }
}
