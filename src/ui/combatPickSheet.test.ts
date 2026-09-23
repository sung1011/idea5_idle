import { describe, expect, it } from 'vitest'
import sheet from './combatPickSheet.vue?raw'
import encounter from './encounterPanel.vue?raw'
import mine from './treasureMinePanel.vue?raw'

describe('combat pick sheet', () => {
  it('is the only worker pick list, shared by PVE orders and treasure mines', () => {
    expect(sheet).toContain('class="pick-list"')
    expect(sheet).toContain('enemyPickCopy')
    expect(sheet).toContain('v-if="showRunes"')
    expect(encounter).toContain('<CombatPickSheet')
    expect(encounter).not.toContain('class="pick-list"')
    expect(mine).toContain('<CombatPickSheet')
    expect(mine).toContain(':show-runes="pickKind === \'raid\'"')
    expect(mine).toContain(':show-assist="false"')
    expect(mine).toContain('mode="start"')
    expect(mine).not.toContain('抢夺编队')
    expect(mine).not.toContain('class="pick-list"')
  })
})
