import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import { guideQuestView } from '../sim/guideQuest'
import { mainlineStepOf } from '../sim/mainlineQuest'
import floatSource from './guideQuestFloat.vue?raw'
import { guideQuestCode } from './guideQuestCode'

describe('guide quest code', () => {
  it('writes the global step and the task id', () => {
    expect(guideQuestCode(2, 'autoHerb')).toBe('#2 autoHerb')
    expect(guideQuestCode(1, 'recruit')).toBe('#1 recruit')
    expect(guideQuestCode(2.8, 'autoHerb')).toBe('#2 autoHerb')
  })

  it('uses the mainline list index, not the phase step', () => {
    const save = createSave()
    save.guideQuestStep = mainlineStepOf('autoHerb')
    const herb = guideQuestView(save)
    expect(herb?.step).toBe(2)
    expect(guideQuestCode(herb!.step, herb!.taskId)).toBe('#2 autoHerb')

    save.guideQuestStep = mainlineStepOf('level2')
    const level = guideQuestView(save)
    expect(level?.taskId).toBe('level2')
    expect(level?.phaseStep).toBe(2)
    expect(guideQuestCode(level!.step, level!.taskId)).toBe(`#${level!.step} level2`)
    expect(level!.step).toBeGreaterThan(level!.phaseStep)
  })

  it('shows the code in small gray type beside the title for every player', () => {
    expect(floatSource).toContain('guideQuestCode(view.value.step, view.value.taskId)')
    expect(floatSource).toContain('class="code"')
    expect(floatSource).toContain('class="label"')
    const nameAt = floatSource.indexOf('class="name"')
    const codeAt = floatSource.indexOf('class="code"')
    expect(nameAt).toBeGreaterThan(0)
    expect(codeAt).toBeGreaterThan(nameAt)
    const style = floatSource.slice(floatSource.indexOf('<style'))
    expect(style).toMatch(/\.code\s*\{[^}]*font-size:\s*9px/)
    expect(style).toMatch(/\.code\s*\{[^}]*color:\s*#b7c0b4/)
    expect(floatSource).not.toContain('v-if="gm"')
  })
})
