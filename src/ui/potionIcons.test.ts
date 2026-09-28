import { describe, expect, it } from 'vitest'
import { POTION_ITEM_IDS } from '../sim/tables'
import { POTION_ICON_PATHS, allPotionIconsReady, potionIconPaths } from './potionIcons'
import workersPanelSource from './workersPanelV2.vue?raw'

const PATH_ARG: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
}

function pathCommandsValid(d: string): boolean {
  const tokens = d.match(/[MLHVCSQTAZ]|-?\d*\.?\d+/gi)
  if (!tokens?.length) return false
  let i = 0
  let cmd = ''
  while (i < tokens.length) {
    const token = tokens[i]
    if (/[MLHVCSQTAZ]/i.test(token) && !/^-?\d/.test(token)) {
      cmd = token.toUpperCase()
      i += 1
      if (cmd === 'Z') continue
    }
    const need = PATH_ARG[cmd]
    if (need == null || need === 0) return false
    for (let n = 0; n < need; n += 1) {
      if (i >= tokens.length || !/^-?\d/.test(tokens[i])) return false
      i += 1
    }
  }
  return true
}

describe('potion icons', () => {
  it('maps every potion to its own icon', () => {
    expect(Object.keys(POTION_ICON_PATHS).sort()).toEqual([...POTION_ITEM_IDS].sort())
    expect(allPotionIconsReady()).toBe(true)
    const signatures = POTION_ITEM_IDS.map((id) => potionIconPaths(id).join('|'))
    expect(new Set(signatures).size).toBe(POTION_ITEM_IDS.length)
    for (const id of POTION_ITEM_IDS) {
      const paths = potionIconPaths(id)
      expect(paths.length).toBeGreaterThan(0)
      for (const d of paths) {
        expect(d.length).toBeGreaterThan(8)
        expect(pathCommandsValid(d)).toBe(true)
      }
    }
  })

  it('puts the icon ahead of the name, and stacks icon, name, count in the slot', () => {
    const slotAt = workersPanelSource.indexOf('aria-label="药剂技能槽"')
    const slot = workersPanelSource.slice(slotAt, workersPanelSource.indexOf('potionBuffLine', slotAt))
    expect(slot.indexOf('<PotionIcon :name="itemId" />')).toBeLessThan(slot.indexOf('class="potion-name"'))
    expect(slot.indexOf('class="potion-name"')).toBeLessThan(slot.indexOf('class="potion-qty"'))
    expect(slot).toContain('class="potion-vacant"')
    expect(slot).not.toContain('name="alchemy"')
    const equipAt = workersPanelSource.indexOf('aria-label="装配药剂"')
    const equip = workersPanelSource.slice(equipAt, workersPanelSource.indexOf('没有可装的药剂', equipAt))
    const iconAt = equip.indexOf('<PotionIcon :name="id" />')
    expect(iconAt).toBeGreaterThan(-1)
    expect(iconAt).toBeLessThan(equip.indexOf('ITEM_DEF[id].label'))
    expect(equip).toContain('potion-group-title')
  })
})
