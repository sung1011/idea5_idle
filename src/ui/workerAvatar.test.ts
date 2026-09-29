import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WORKER_RACE_IDS } from '../sim/types'
import { raceFromWorkerId } from '../sim/workerRace'
import { WORKER_QUALITY_TABLE } from '../sim/tables'
import encounter from './encounterPanel.vue?raw'
import herb from './herbPvpPanel.vue?raw'
import pick from './combatPickSheet.vue?raw'
import player from './playerAvatar.vue?raw'
import workers from './workersPanelV2.vue?raw'
import face from './workerAvatar.vue?raw'
import { workerQualityFrameStyle } from './workerQuality'
import {
  WORKER_AVATAR_PX,
  workerAvatarBorderPx,
  workerAvatarPx,
  workerAvatarRace,
  workerRaceAvatarReady,
  workerRaceAvatarUrl,
} from './workerAvatar'

function ascii(buf: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...buf.subarray(start, end))
}

function webpSize(buf: Uint8Array): { width: number; height: number } {
  expect(ascii(buf, 0, 4)).toBe('RIFF')
  expect(ascii(buf, 8, 12)).toBe('WEBP')
  expect(ascii(buf, 12, 16)).toBe('VP8 ')
  const data = buf.subarray(20)
  expect(ascii(data, 3, 6)).toBe('\x9d\x01\x2a')
  const width = (data[6] ?? 0) | ((data[7] ?? 0) << 8)
  const height = (data[8] ?? 0) | ((data[9] ?? 0) << 8)
  return { width: width & 0x3fff, height: height & 0x3fff }
}

describe('worker race avatars', () => {
  it('ships a 128px webp for every race id', () => {
    expect(workerRaceAvatarReady()).toBe(true)
    const urls = new Set<string>()
    for (const id of WORKER_RACE_IDS) {
      const url = workerRaceAvatarUrl(id)
      expect(url.length).toBeGreaterThan(0)
      expect(urls.has(url)).toBe(false)
      urls.add(url)
      const buf = readFileSync(new URL(`../assets/workerRaces/${id}.webp`, import.meta.url))
      expect(buf.byteLength).toBeGreaterThan(400)
      expect(buf.byteLength).toBeLessThan(12_000)
      expect(webpSize(buf)).toEqual({ width: 128, height: 128 })
    }
  })

  it('falls back when the race field is missing or junk', () => {
    expect(workerAvatarRace(undefined)).toBe('orc')
    expect(workerAvatarRace(null)).toBe('orc')
    expect(workerAvatarRace('nope')).toBe('orc')
    expect(workerAvatarRace('goblin')).toBe('goblin')
    expect(workerAvatarRace(undefined, 'w-old')).toBe(raceFromWorkerId('w-old'))
    expect(workerAvatarRace('nope', '')).toBe('orc')
    expect(workerRaceAvatarUrl(undefined)).toBe(workerRaceAvatarUrl('orc'))
    expect(workerRaceAvatarUrl('not-a-race')).toBe(workerRaceAvatarUrl('orc'))
    expect(workerQualityFrameStyle(undefined).borderColor).toBe(WORKER_QUALITY_TABLE[1].color)
    expect(workerQualityFrameStyle(99).borderColor).toBe(WORKER_QUALITY_TABLE[1].color)
    expect(workerQualityFrameStyle(2).borderColor).toBe(WORKER_QUALITY_TABLE[2].color)
    expect(workerQualityFrameStyle('blue')).toEqual(workerQualityFrameStyle(1))
  })

  it('keeps three size steps and a thicker border only on the large face', () => {
    expect(WORKER_AVATAR_PX).toEqual({ sm: 24, md: 32, lg: 48 })
    expect(workerAvatarPx('sm')).toBe(24)
    expect(workerAvatarPx('md')).toBe(32)
    expect(workerAvatarPx('lg')).toBe(48)
    expect(workerAvatarBorderPx('sm')).toBe(2)
    expect(workerAvatarBorderPx('md')).toBe(2)
    expect(workerAvatarBorderPx('lg')).toBe(3)
    expect(face).toContain('workerAvatarPx')
    expect(face).toContain('workerAvatarBorderPx')
    expect(face).toContain('workerQualityFrameStyle')
    expect(face).toContain('object-fit: cover')
    expect(face).toContain('border-radius: 50%')
    expect(face).toContain('showNew')
    expect(face).toContain('新苦工')
    expect(face).not.toContain('ClassIcon')
  })

  it('uses the shared face on station, rosters, queue head, clash, battlefield and pick rows', () => {
    expect(workers).toContain('size="lg"')
    expect(workers).toContain(':show-new="!!w.isNew"')
    expect(workers).toContain(':size="rosterFaceSize"')
    expect(workers).toContain('class="queue-avatar"')
    expect(workers).toContain('size="md"')
    expect(workers).toContain('queueHead.worker.race')
    expect(herb).toContain('size="md"')
    expect(herb).toContain('clashView.player.race')
    expect(herb).toContain('clashView.player.qualityTier')
    expect(herb).not.toContain('ClassIcon')
    expect(herb).toContain('width: 20px')
    expect(encounter).toContain('<WorkerAvatar')
    expect(encounter).toContain('size="sm"')
    expect(pick).toContain('<WorkerAvatar')
    expect(pick).toContain('size="sm"')
    expect(player).toContain('width: 32px')
    expect(player).toContain('height: 32px')
    expect(player).not.toContain('width: 28px')
  })
})