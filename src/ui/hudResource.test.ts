import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import { START_DIAMONDS, START_GOLD, START_TECH_POINTS } from '../sim/tables'
import {
  HUD_CORE_IDS,
  hudChipAmount,
  hudChipDetail,
  itemHudSource,
  itemHudUsage,
  listHudChips,
} from './hudResource'

describe('hud resource chips', () => {
  it('puts knight level first, then gold / diamonds / workers / inspiration', () => {
    expect([...HUD_CORE_IDS]).toEqual(['knight', 'gold', 'diamonds', 'workers', 'inspiration'])
    const save = createSave()
    expect(listHudChips(save).map((chip) => chip.id)).toEqual([...HUD_CORE_IDS])
  })

  it('slides leftover stock chips in after the core row', () => {
    const save = createSave()
    save.bank.wood = 4
    save.bank.weapon = 2
    expect(listHudChips(save).map((chip) => chip.id)).toEqual([...HUD_CORE_IDS, 'wood', 'weapon'])
  })

  it('formats core amounts and knight as LvN', () => {
    const save = createSave()
    expect(hudChipAmount(save, 'knight')).toBe(`Lv${save.knightLevel}`)
    expect(hudChipAmount(save, 'gold')).toBe(String(START_GOLD))
    expect(hudChipAmount(save, 'diamonds')).toBe(String(START_DIAMONDS))
    expect(hudChipAmount(save, 'workers')).toBe(String(save.workers.length))
    expect(hudChipAmount(save, 'inspiration')).toBe(String(START_TECH_POINTS))
  })

  it('writes Chinese source / usage for core chips', () => {
    const save = createSave()
    const gold = hudChipDetail(save, 'gold')
    expect(gold.name).toBe('金币')
    expect(gold.amount).toBe(String(START_GOLD))
    expect(gold.source).toMatch(/craftGold/)
    expect(gold.source).toMatch(/战利品/)
    expect(gold.source).toMatch(/当铺/)
    expect(gold.usage).toMatch(/抽人/)
    expect(gold.usage).toMatch(/探索/)

    const inspiration = hudChipDetail(save, 'inspiration')
    expect(inspiration.name).toBe('灵感')
    expect(inspiration.source).toMatch(/20/)
    expect(inspiration.source).toMatch(/骑士/)
    expect(inspiration.usage).toMatch(/科技/)

    const diamonds = hudChipDetail(save, 'diamonds')
    expect(diamonds.name).toBe('钻石')
    expect(diamonds.source).toMatch(/暂无正规/)
    expect(diamonds.usage).toMatch(/占位|展示|预留/)

    const workers = hudChipDetail(save, 'workers')
    expect(workers.name).toBe('工人')
    expect(workers.source).toMatch(/抽人/)
    expect(workers.usage).toMatch(/派驻/)
    expect(workers.usage).toMatch(/出战|战斗/)

    const knight = hudChipDetail(save, 'knight')
    expect(knight.name).toBe('骑士等级')
    expect(knight.amount).toBe('Lv1')
    expect(knight.source).toMatch(/站等级/)
    expect(knight.usage).toMatch(/灵感/)
  })

  it('describes items from producer station and consume contexts', () => {
    expect(itemHudSource('ore')).toBe('采矿产出')
    expect(itemHudUsage('ore')).toMatch(/锻造消耗/)
    expect(itemHudSource('meal')).toBe('烹饪产出')
    expect(itemHudUsage('meal')).toMatch(/食物槽/)
    expect(itemHudSource('stim')).toBe('炼金产出')
    expect(itemHudUsage('stim')).toMatch(/药剂槽/)
    expect(itemHudSource('miningTool01')).toBe('锻造产出')
    expect(itemHudUsage('miningTool01')).toMatch(/采矿消耗/)
    expect(itemHudUsage('miningTool01')).toMatch(/站卡装备/)
    expect(itemHudSource('wood')).toMatch(/旧档/)
    expect(itemHudUsage('wood')).toMatch(/当铺/)
    const save = createSave()
    save.bank.ore = 12
    const ore = hudChipDetail(save, 'ore')
    expect(ore.name).toBe('铜矿')
    expect(ore.amount).toBe('12')
    expect(ore.source).toBe('采矿产出')
    expect(ore.usage).toMatch(/锻造/)
  })
})
