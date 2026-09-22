import { describe, expect, it } from 'vitest'
import source from './encounterPanel.vue?raw'

function sliceBetween(text: string, start: string, end: string): string {
  const from = text.indexOf(start)
  const to = text.indexOf(end, from + start.length)
  expect(from).toBeGreaterThanOrEqual(0)
  expect(to).toBeGreaterThan(from)
  return text.slice(from, to)
}

describe('affix chip layout', () => {
  const template = sliceBetween(source, '<template>', '</template>')
  const style = sliceBetween(source, '<style', '</style>')

  it('puts the enemy affix chip in the header tags', () => {
    const enemy = sliceBetween(template, "enc.kind === 'enemy'", '{{ enc.label }}')
    const tags = sliceBetween(enemy, 'class="tags"', '</span>')
    expect(tags).toContain('class="affix-chip"')
    expect(tags).toContain("onAffixHelp($event, enemyCardAffix(enc)!.id, 'battlefield')")
    expect(enemy).not.toContain('affix-row')
    expect(enemy).not.toContain('card-affix')
    const afterName = template.slice(template.indexOf('{{ enc.label }}'), template.indexOf('<EncounterDealLines'))
    expect(afterName).not.toContain('affix-chip')
  })

  it('keeps dungeon affixes and attempt count on one wrapping row', () => {
    const meta = sliceBetween(template, 'class="dungeon-meta"', 'class="board"')
    expect(meta).toContain('今日词缀：')
    expect(meta).toContain('dungeonAttemptLabel')
    expect(meta).toContain('class="affix-chip"')
    expect(meta).toContain("onAffixHelp($event, row.id, 'dungeon')")
    expect(meta).not.toContain('<p')
    expect(style).toMatch(/\.dungeon-meta\s*\{[^}]*flex-wrap:\s*wrap/)
  })

  it('shrinks shared affix chips toward the header tags', () => {
    const chip = sliceBetween(style, '.affix-chip {', '.affix-chip:hover')
    expect(chip).toMatch(/font-size:\s*12px/)
    expect(chip).toMatch(/padding:\s*1px 6px/)
    expect(chip).toMatch(/border:\s*1px solid/)
    expect(chip).toMatch(/min-height:\s*0/)
    expect(chip).toMatch(/line-height:\s*1\.25/)
  })
})
