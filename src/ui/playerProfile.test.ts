import { describe, expect, it } from 'vitest'
import { PLAYER_AVATAR_IDS } from '../sim/createSave'
import app from './app.vue?raw'
import { PLAYER_AVATAR_FACES, playerAvatarList } from './playerAvatar'
import sheet from './playerProfileSheet.vue?raw'

describe('player profile hud', () => {
  it('pins the avatar and name on the left of the resource bar', () => {
    const hud = app.slice(app.indexOf('<header class="hud"'), app.indexOf('class="hud-actions"'))
    expect(hud).toContain('class="player"')
    expect(hud).toContain('<PlayerAvatar')
    expect(hud).toContain('player-name')
    expect(hud).toContain('class="hud-stack"')
    expect(hud).toContain('class="xp-meter"')
    expect(hud).not.toContain('class="xp-num"')
    expect(hud).toContain('knightXpLabel')
    expect(hud).toContain('knightOpen = true')
    expect(hud).toContain('profileOpen = true')
    expect(app).toContain('ref="settingsBtn"')
    expect(hud.indexOf('class="player"')).toBeLessThan(hud.indexOf('<div class="resources">'))
    expect(hud.indexOf('<div class="resources">')).toBeLessThan(hud.indexOf('class="xp-meter"'))
    expect(app.indexOf('class="player"')).toBeLessThan(app.indexOf('<div class="resources">'))
    expect(app).toContain('v-for="chip in resourceChips"')
    expect(app).toContain('<PlayerProfileSheet')
    expect(app).toContain('game.setPlayerProfile')
    expect(app).toContain('game.save.playerAvatarId')
    expect(app).toContain(':frame="bannerFrame"')
  })

  it('edits name and avatar in a small sheet, not a full page', () => {
    expect(sheet).toContain('class="mask"')
    expect(sheet).toContain('role="dialog"')
    expect(sheet).toContain('aria-label="玩家名字"')
    expect(sheet).toContain('确认')
    expect(sheet).toContain('playerDisplayName(draftName')
    expect(sheet).not.toContain('class="page"')
    expect(playerAvatarList().map((face) => face.id)).toEqual([...PLAYER_AVATAR_IDS])
    for (const face of playerAvatarList()) {
      expect(face.paths.length).toBeGreaterThan(0)
      expect(face.label.length).toBeGreaterThan(0)
      expect(PLAYER_AVATAR_FACES[face.id]).toBe(face)
    }
  })
})