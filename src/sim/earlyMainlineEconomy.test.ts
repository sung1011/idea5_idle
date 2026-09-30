import { describe, expect, it } from 'vitest'
import { restingWorkers } from './assign'
import { bankQty } from './bank'
import { endEnemyCombat, stepEnemyCombat } from './combat'
import { claimLoot, exploreBoard, exploreCost, startCombat } from './encounters'
import { createSave } from './createSave'
import { fuseRestWorkers } from './fuse'
import { claimGuideQuest, guideQuestView } from './guideQuest'
import { installPotionSlot } from './potionSlots'
import { usePotionSlot } from './potions'
import { recruitCost } from './tech'
import { recruitWorker } from './recruit'
import { ticks } from './tick'
import { POTION_ITEM_IDS } from './tables'
import { dispatchManualRound, toggleStationAuto } from './workshopDispatch'
import type { EnemyEncounter, PotionItemId, Save } from './types'

function claimCurrent(save: Save) {
  const id = guideQuestView(save)?.taskId ?? '?'
  const result = claimGuideQuest(save)
  expect(result.ok, `${id}：${result.ok ? '' : result.reason}`).toBe(true)
}

function healCamp(save: Save) {
  for (const worker of save.workers) {
    if (worker.assignment != null) continue
    worker.hp = worker.hpMax
    worker.fatigueDebt = 0
  }
}

function pumpHerbs(save: Save, need: number): Save {
  let current = save
  for (let i = 0; i < 80 && bankQty(current, 'herb') < need; i++) {
    const station = current.stations.herbalism
    if (!station.auto && station.manualRounds < 5) {
      healCamp(current)
      dispatchManualRound(current, 'herbalism')
    }
    current = ticks(current, 20)
  }
  return current
}

function waitResting(save: Save, count: number): Save {
  let current = save
  for (let i = 0; i < 40 && restingWorkers(current).length < count; i++) {
    current = ticks(current, 20)
  }
  return current
}

function bringHome(save: Save): Save {
  if (save.stations.alchemy.auto) toggleStationAuto(save, 'alchemy')
  if (save.stations.herbalism.auto) toggleStationAuto(save, 'herbalism')
  let current = save
  for (let i = 0; i < 50 && current.workers.some((worker) => worker.assignment != null); i++) {
    if (bankQty(current, 'herb') < 1 && restingWorkers(current).length > 0) {
      topUp(current)
      dispatchManualRound(current, 'herbalism')
    }
    current = ticks(current, 20)
  }
  topUp(current)
  return current
}

function potionKinds(save: Save): PotionItemId[] {
  return POTION_ITEM_IDS.filter((id) => bankQty(save, id) > 0)
}

function topUp(save: Save) {
  for (const worker of save.workers) {
    worker.hp = worker.hpMax
    worker.fatigueDebt = 0
  }
}

function runStation(save: Save, stationId: 'herbalism' | 'alchemy', steps: number): Save {
  const other = stationId === 'herbalism' ? 'alchemy' : 'herbalism'
  if (save.stations[other].auto) toggleStationAuto(save, other)
  topUp(save)
  if (!save.stations[stationId].auto) {
    const turned = toggleStationAuto(save, stationId)
    if (!turned.ok) dispatchManualRound(save, stationId)
  }
  let current = save
  const chunk = 40
  for (let left = steps; left > 0; left -= chunk) {
    topUp(current)
    current = ticks(current, Math.min(chunk, left))
  }
  return current
}

function runAlchemy(save: Save, done: (save: Save) => boolean): Save {
  let current = save
  for (let i = 0; i < 12 && !done(current); i++) {
    if (bankQty(current, 'herb') < 8) current = runStation(current, 'herbalism', 400)
    current = runStation(current, 'alchemy', 400)
  }
  return current
}

function fuseTier(save: Save, tier: number) {
  const pair = restingWorkers(save).filter((worker) => worker.qualityTier === tier)
  expect(pair.length, `品质 ${tier} 要有两名在营地`).toBeGreaterThanOrEqual(2)
  const fused = fuseRestWorkers(save, pair[0].id, pair[1].id)
  expect(fused.ok, fused.ok ? '' : fused.reason).toBe(true)
}

describe('early mainline from an empty purse', () => {
  it('reaches explore and the first paid recruit without a gold or diamond stall', () => {
    let save = createSave()
    expect(save.gold).toBe(0)
    expect(save.diamonds).toBe(0)
    expect(save.freeRecruitLeft).toBe(2)

    expect(recruitWorker(save).ok).toBe(true)
    expect(recruitWorker(save).ok).toBe(true)
    expect(save.diamonds).toBe(0)
    expect(save.freeRecruitLeft).toBe(0)
    claimCurrent(save)
    expect(guideQuestView(save)?.taskId).toBe('autoHerb')

    expect(dispatchManualRound(save, 'herbalism').ok).toBe(true)
    claimCurrent(save)
    expect(dispatchManualRound(save, 'herbalism').ok).toBe(true)
    claimCurrent(save)
    expect(guideQuestView(save)?.taskId).toBe('fuse')

    save = waitResting(save, 2)
    expect(restingWorkers(save).length).toBeGreaterThanOrEqual(2)
    fuseTier(save, 1)
    claimCurrent(save)

    save = pumpHerbs(save, 2)
    expect(bankQty(save, 'herb')).toBeGreaterThanOrEqual(2)
    const fighter = restingWorkers(save).find((worker) => worker.hp >= worker.hpMax && worker.fatigueDebt === 0)
    expect(fighter, '出征需要一名满血苦工').toBeTruthy()
    expect(startCombat(save, 0, [fighter!.id]).ok).toBe(true)
    claimCurrent(save)
    expect(guideQuestView(save)?.taskId).toBe('level2')
    claimCurrent(save)

    const enc = save.encounters[0] as EnemyEncounter
    const now = save.lastTick || Date.now()
    endEnemyCombat(save, enc, now, 'win', '胜')
    const home = enc.combat?.phaseEndsAt ?? now
    stepEnemyCombat(save, enc, home)
    const loot = claimLoot(save, 0, home)
    expect(loot.ok, loot.ok ? '' : loot.reason).toBe(true)
    healCamp(save)

    save = runAlchemy(save, (current) => (current.stations.alchemy.completed ?? 0) >= 1 && potionKinds(current).length >= 1)
    expect(save.stations.alchemy.completed).toBeGreaterThanOrEqual(1)
    claimCurrent(save)
    expect(guideQuestView(save)?.taskId).toBe('potionInstall')

    const firstPotion = potionKinds(save)[0]
    expect(firstPotion).toBeTruthy()
    expect(installPotionSlot(save, 0, firstPotion!).ok).toBe(true)
    claimCurrent(save)

    if (save.stations.alchemy.auto) toggleStationAuto(save, 'alchemy')
    if (save.stations.herbalism.auto) toggleStationAuto(save, 'herbalism')
    save = waitResting(save, 1)
    healCamp(save)
    const target = restingWorkers(save)[0]
    expect(target).toBeTruthy()
    target!.hp = Math.max(1, target!.hpMax - 1)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    claimCurrent(save)
    expect(guideQuestView(save)?.taskId).toBe('autoLine')
    expect(toggleStationAuto(save, 'herbalism').ok).toBe(true)
    claimCurrent(save)
    expect(guideQuestView(save)?.taskId).toBe('level3')
    claimCurrent(save)
    expect(guideQuestView(save)?.taskId).toBe('firstBlood')
    claimCurrent(save)
    expect(guideQuestView(save)?.taskId).toBe('explore')

    const cost = exploreCost(save)
    expect(save.gold).toBeGreaterThanOrEqual(cost)
    expect(save.diamonds).toBe(0)
    const explored = exploreBoard(save)
    expect(explored.ok, explored.ok ? '' : explored.reason).toBe(true)
    expect(save.exploreCount).toBe(1)
    claimCurrent(save)
    expect(guideQuestView(save)?.taskId).toBe('level4')
    claimCurrent(save)

    save = runAlchemy(
      save,
      (current) => current.stations.alchemy.stationLevel >= 4 && potionKinds(current).length >= 4,
    )
    expect(save.stations.alchemy.stationLevel).toBeGreaterThanOrEqual(4)
    expect(potionKinds(save).length).toBeGreaterThanOrEqual(4)
    expect(guideQuestView(save)?.taskId).toBe('alchemy3')
    claimCurrent(save)
    expect(save.diamonds).toBe(12)

    const spare = potionKinds(save).filter((id) => !save.potionSlots.includes(id))
    for (let i = 0; i < 4; i++) {
      if (save.potionSlots[i]) continue
      const id = spare.find((item) => !save.potionSlots.includes(item))
      expect(id, '要有还没装上的药剂').toBeTruthy()
      const installed = installPotionSlot(save, i, id!)
      expect(installed.ok, installed.ok ? '' : installed.reason).toBe(true)
    }
    expect(guideQuestView(save)?.taskId).toBe('slotsFull')
    claimCurrent(save)
    expect(save.diamonds).toBe(24)
    expect(guideQuestView(save)?.taskId).toBe('level5')
    claimCurrent(save)
    expect(guideQuestView(save)?.taskId).toBe('blueWorker')

    if (save.stations.alchemy.auto) toggleStationAuto(save, 'alchemy')
    if (save.stations.herbalism.auto) toggleStationAuto(save, 'herbalism')
    save = waitResting(save, 1)
    healCamp(save)

    const paid = recruitCost(save)
    expect(save.diamonds).toBeGreaterThanOrEqual(paid * 2)
    expect(recruitWorker(save).ok).toBe(true)
    expect(recruitWorker(save).ok).toBe(true)
    expect(save.diamonds).toBe(24 - paid * 2)
    fuseTier(save, 1)
    save = bringHome(save)
    fuseTier(save, 2)
    expect(save.workers.some((worker) => worker.qualityTier >= 3)).toBe(true)
    claimCurrent(save)
    expect(guideQuestView(save)?.taskId).not.toBe('blueWorker')
  })
})
