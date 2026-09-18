import { describe, expect, it } from 'vitest'
import {
  clientBoxToShell,
  clipBoxToClips,
  holeFromClient,
  holeRadius,
  intersectBoxes,
  padBox,
} from './guideQuestSpotlight'

describe('guideQuestSpotlight', () => {
  it('maps a client rect into shell space and pads a hole', () => {
    const shell = { left: 40, top: 20, width: 360, height: 640 }
    const hole = holeFromClient({ left: 100, top: 180, width: 80, height: 36 }, shell)
    expect(hole).toEqual({
      x: 52,
      y: 152,
      w: 96,
      h: 52,
      r: 16,
    })
  })

  it('clips holes that sit outside the shell', () => {
    const shell = { left: 0, top: 0, width: 200, height: 200 }
    expect(holeFromClient({ left: 240, top: 40, width: 80, height: 40 }, shell)).toBeNull()
    const clipped = holeFromClient({ left: 180, top: 20, width: 80, height: 40 }, shell, [], 0)
    expect(clipped).toEqual({ x: 180, y: 20, w: 20, h: 40, r: 10 })
  })

  it('clips to overflow ancestors so scrolled-off targets vanish', () => {
    const shell = { left: 0, top: 0, width: 300, height: 500 }
    const page = { left: 0, top: 60, width: 300, height: 360 }
    expect(
      holeFromClient({ left: 20, top: 440, width: 120, height: 40 }, shell, [page]),
    ).toBeNull()
    const hole = holeFromClient({ left: 24, top: 200, width: 100, height: 32 }, shell, [page], 0)
    expect(hole).toMatchObject({ x: 24, y: 200, w: 100, h: 32 })
  })

  it('intersects, pads and rounds helper boxes', () => {
    expect(intersectBoxes({ x: 0, y: 0, w: 10, h: 10 }, { x: 8, y: 8, w: 10, h: 10 })).toBeNull()
    expect(clientBoxToShell({ left: 15, top: 25, width: 10, height: 8 }, { left: 5, top: 5 })).toEqual({
      x: 10,
      y: 20,
      w: 10,
      h: 8,
    })
    expect(padBox({ x: 10, y: 10, w: 20, h: 12 }, 4)).toEqual({ x: 6, y: 6, w: 28, h: 20 })
    expect(holeRadius({ x: 0, y: 0, w: 40, h: 20 })).toBe(10)
    expect(clipBoxToClips({ x: 0, y: 0, w: 50, h: 50 }, [{ x: 10, y: 10, w: 10, h: 10 }])).toEqual({
      x: 10,
      y: 10,
      w: 10,
      h: 10,
    })
  })
})
