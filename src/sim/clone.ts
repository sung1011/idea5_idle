import type { Save } from './types'

export function cloneSave(save: Save): Save {
  return structuredClone(save)
}
