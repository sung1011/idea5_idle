import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import { WORKER_RACE_IDS } from '../sim/types'
import { raceCodexEntries, raceUnlockHint } from '../sim/workerRaceUnlock'
import campSource from './campSheet.vue?raw'
import sheetSource from './raceCodexSheet.vue?raw'

describe('race codex sheet', () => {
  it('opens from camp, not from the dock, and lists all twenty races', () => {
    expect(campSource).toContain('aria-label="苦工图鉴"')
    expect(campSource).toContain('RaceCodexSheet')
    expect(campSource).toContain('>鉴</button>')
    expect(campSource.indexOf('class="camp-codex"')).toBeGreaterThan(0)
    expect(campSource.indexOf('class="camp-codex"')).toBeLessThan(campSource.indexOf('class="camp-help"'))
    expect(sheetSource).toContain('苦工图鉴')
    expect(sheetSource).toContain('raceCodexEntries')
    expect(sheetSource).toContain('row.hint')
    expect(sheetSource).toContain('已解锁')
    expect(sheetSource).toContain('locked')
    expect(sheetSource).not.toContain('fuse')
    expect(sheetSource).not.toContain('qualityTier')
  })

  it('keeps locked races grey with a fuse condition', () => {
    const rows = raceCodexEntries(createSave())
    expect(rows).toHaveLength(WORKER_RACE_IDS.length)
    expect(rows[0]).toMatchObject({ id: 'orc', unlocked: true })
    const bloodElf = rows.find((row) => row.id === 'bloodElf')
    expect(bloodElf).toMatchObject({ unlocked: false, hint: '合出橙色兽人解锁' })
    expect(raceUnlockHint('kobold')).toBe('第5次合出金色苦工解锁')
  })
})
