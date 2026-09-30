import { afterEach, describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import { GUIDE_QUEST_DONE_STEP } from '../sim/guideQuest'
import type { Save, Worker } from '../sim/types'
import { appTab } from './appNav'
import { DEFAULT_APP_TAB, type AppTabId } from './appTabs'
import { setWorkerDragActive } from './workerDrag'
import { dismissWorkshopBanter, playWorkshopBanter } from './workshopBanter'
import workersPanelSource from './workersPanelV2.vue?raw'
import {
  WORKER_TUTOR_GAP_MS,
  WORKER_TUTOR_KNIGHT_MAX,
  WORKER_TUTOR_LIFE_MS,
  WORKER_TUTOR_LINES,
  considerWorkerTutor,
  dismissWorkerTutor,
  isWorkerTutorActive,
  resetWorkerTutorForTests,
  workerTutorCandidateIds,
  workerTutorText,
} from './workerTutorTips'

function worker(patch: Partial<Worker> & Pick<Worker, 'id'>): Worker {
  return {
    assignment: null,
    qualityTier: 1,
    foodSlot: null,
    fatigueDebt: 0,
    isNew: false,
    hp: 20,
    hpMax: 20,
    level: 1,
    xp: 0,
    combatAttrs: [],
    ...patch,
  }
}

function earlySave(): Save {
  const save = createSave()
  save.knightLevel = 1
  save.guideQuestStep = 1
  save.workers.push(worker({ id: 'rest-a' }))
  return save
}

function dutySave(): Save {
  const save = earlySave()
  save.workers.push(worker({ id: 'duty', assignment: 'herbalism' }))
  return save
}

describe('worker tutor tips', () => {
  let prevApp: AppTabId = DEFAULT_APP_TAB

  afterEach(() => {
    resetWorkerTutorForTests()
    dismissWorkshopBanter()
    setWorkerDragActive(false)
    appTab.value = prevApp
  })

  it('keeps the lines aligned with fuse and queue-head rules', () => {
    const text = WORKER_TUTOR_LINES.join('\n')
    expect(text).toContain('营地互合')
    expect(text).toContain('拖到站上同品质')
    expect(text).toContain('别拖空槽')
    expect(text).toContain('队首')
    expect(text).toContain('堵住后面')
    expect(text).toContain('满血才能上岗')
    expect(text).toContain('封闭后不再自动进人')
    expect(text).toContain('回营地的苦工排到队尾，不会堵在队首')
    expect(text).not.toContain('回休息')
    expect(text).toContain('点站卡派工')
    expect(text).toContain('右上角可以挂自动')
    expect(text).not.toContain('点空岗')
    expect(text).not.toContain('拖回休息')
    expect(text).not.toContain('拖进空槽上岗')
  })

  it('shows one tutorial line on an on-duty worker, never a resting one', () => {
    const save = dutySave()
    expect(isWorkerTutorActive(save)).toBe(true)
    const bubble = considerWorkerTutor(save, 0, () => 0)
    expect(bubble?.workerId).toBe('duty')
    expect(WORKER_TUTOR_LINES).toContain(bubble?.text)
    expect(workerTutorText('duty')).toBe(bubble?.text)
    expect(workerTutorText('rest-a')).toBe('')
    expect(considerWorkerTutor(save, 1000, () => 0)?.id).toBe(bubble?.id)
    resetWorkerTutorForTests()
    expect(considerWorkerTutor(earlySave(), 0, () => 0)).toBeNull()
  })

  it('stops after knight level reaches hunting or the guide is fully claimed', () => {
    const knight = dutySave()
    knight.knightLevel = WORKER_TUTOR_KNIGHT_MAX - 1
    expect(isWorkerTutorActive(knight)).toBe(true)
    expect(considerWorkerTutor(knight, 0, () => 0)?.workerId).toBe('duty')
    resetWorkerTutorForTests()
    knight.knightLevel = WORKER_TUTOR_KNIGHT_MAX
    expect(isWorkerTutorActive(knight)).toBe(false)
    expect(considerWorkerTutor(knight, 0, () => 0)).toBeNull()
    expect(workerTutorText('duty')).toBe('')

    const guided = dutySave()
    guided.guideQuestStep = GUIDE_QUEST_DONE_STEP
    expect(isWorkerTutorActive(guided)).toBe(false)
    expect(considerWorkerTutor(guided, 0, () => 0)).toBeNull()
  })

  it('clears a showing bubble once the early-game gate closes', () => {
    const save = dutySave()
    considerWorkerTutor(save, 0, () => 0)
    expect(workerTutorText('duty')).not.toBe('')
    save.knightLevel = WORKER_TUTOR_KNIGHT_MAX
    expect(considerWorkerTutor(save, 1000, () => 0)).toBeNull()
    expect(workerTutorText('duty')).toBe('')
  })

  it('drops the line when the speaker leaves the station', () => {
    const save = dutySave()
    considerWorkerTutor(save, 0, () => 0)
    expect(workerTutorText('duty')).not.toBe('')
    const duty = save.workers.find((row) => row.id === 'duty')
    expect(duty).toBeTruthy()
    duty!.assignment = null
    expect(considerWorkerTutor(save, 1000, () => 0)).toBeNull()
    expect(workerTutorText('duty')).toBe('')
    expect(workerTutorText('rest-a')).toBe('')
  })

  it('waits out the life and the gap before the next line, and does not repeat the last one', () => {
    const save = dutySave()
    const first = considerWorkerTutor(save, 0, () => 0)
    expect(first?.text).toBe(WORKER_TUTOR_LINES[0])
    expect(considerWorkerTutor(save, WORKER_TUTOR_LIFE_MS, () => 0)).toBeNull()
    expect(workerTutorText('duty')).toBe('')
    const second = considerWorkerTutor(save, WORKER_TUTOR_LIFE_MS + WORKER_TUTOR_GAP_MS, () => 0)
    expect(second?.text).toBe(WORKER_TUTOR_LINES[1])
    expect(second?.text).not.toBe(first?.text)
  })

  it('click dismiss starts the gap immediately', () => {
    const save = dutySave()
    considerWorkerTutor(save, 0, () => 0)
    dismissWorkerTutor(1000)
    expect(workerTutorText('duty')).toBe('')
    expect(considerWorkerTutor(save, 1000 + WORKER_TUTOR_GAP_MS - 1, () => 0)).toBeNull()
    expect(considerWorkerTutor(save, 1000 + WORKER_TUTOR_GAP_MS, () => 0)?.workerId).toBe('duty')
  })

  it('skips camp, combat, banter, and drag', () => {
    const save = dutySave()
    expect(considerWorkerTutor(save, 0, () => 0.99)?.workerId).toBe('duty')
    expect(workerTutorText('rest-a')).toBe('')

    resetWorkerTutorForTests()
    const stationed = createSave()
    stationed.workers.push(worker({ id: 'duty', assignment: 'herbalism' }))
    expect(considerWorkerTutor(stationed, 0, () => 0)?.workerId).toBe('duty')

    resetWorkerTutorForTests()
    const fighting = dutySave()
    const fighter = fighting.workers.find((row) => row.id === 'duty')
    expect(fighter).toBeTruthy()
    fighting.encounters.push({
      id: 'enc-tutor',
      label: '狼',
      quality: 'green',
      kind: 'enemy',
      needs: {},
      lootGold: 0,
      departed: true,
      lootClaimed: false,
      enemyRank: 'minion',
      weaknesses: [],
      revealedWeaknesses: [],
      combat: {
        startedAt: 0,
        timeoutAt: 900,
        workerIds: ['duty'],
        workers: [{ id: 'duty', label: '甲', hp: 8, hpMax: 10, atk: 1, spd: 2, nextActAt: 0 }],
        enemy: { id: 'wolf', label: '狼', hp: 10, hpMax: 10, atk: 1, spd: 2, nextActAt: 0 },
        logs: [],
        outcome: null,
      },
    } as (typeof fighting.encounters)[number])
    expect(considerWorkerTutor(fighting, 0, () => 0)).toBeNull()

    resetWorkerTutorForTests()
    prevApp = appTab.value
    appTab.value = 'workshop'
    const talking = dutySave()
    talking.workers.push(worker({ id: 'quiet', assignment: 'cooking' }))
    playWorkshopBanter({
      stationId: 'herbalism',
      kind: 'solo',
      beats: [{ workerId: 'duty', stationId: 'herbalism', text: '闲话占着', delayMs: 0 }],
    })
    expect(considerWorkerTutor(talking, 0, () => 0)?.workerId).toBe('quiet')
    expect(workerTutorText('rest-a')).toBe('')

    resetWorkerTutorForTests()
    setWorkerDragActive(true)
    expect(considerWorkerTutor(dutySave(), 0, () => 0)).toBeNull()
  })

  it('hangs the tip on station slots only, not camp, queue, or combat', () => {
    const combatAt = workersPanelSource.indexOf('aria-label="战斗区"')
    const styleAt = workersPanelSource.indexOf('<style')
    expect(workersPanelSource.slice(0, combatAt)).toContain('class="tutor-tip"')
    expect(workersPanelSource.slice(combatAt, styleAt)).not.toContain('tutor-tip')
    expect(workersPanelSource).toContain('considerWorkerTutor')
    expect(workersPanelSource).toContain('dismissWorkerTutor')
    expect(workersPanelSource).not.toContain('tutorLine(row.id)')
    expect(workersPanelSource).not.toContain('tutorLine(queueHead.id)')
  })

  it('never offers camp or queue workers, even when the camp list is open', () => {
    const save = earlySave()
    save.workers.push(worker({ id: 'rest-b' }))
    save.workers.push(worker({ id: 'duty', assignment: 'herbalism' }))
    save.workers.push(worker({ id: 'cook', assignment: 'cooking' }))
    expect(workerTutorCandidateIds(save)).toEqual(['duty', 'cook'])
  })
})
