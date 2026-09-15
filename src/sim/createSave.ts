import type { Save } from './types'

export const START_GOLD = 40

function blankTrack() {
  return { lifeLevel: 1, lifeXp: 0 }
}

export function createSave(): Save {
  return {
    gold: START_GOLD,
    bank: {},
    workers: [],
    life: {
      woodcutting: blankTrack(),
      alchemy: blankTrack(),
      mining: blankTrack(),
    },
    lastTick: Date.now(),
    elapsedS: 0,
    nextWorkerId: 1,
  }
}
