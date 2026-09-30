import { describe, expect, it } from 'vitest'
import {
  QUEST_FLOAT_ABOVE_DOCK,
  QUEST_SLOT_GAP,
  POTION_BUFF_BLOCK,
  questFloatBottomCss,
  questFloatClearance,
  questFloatLiftPx,
} from './guideQuestFloatPos'

const PHONES = [
  { w: 375, h: 667, safe: 0 },
  { w: 390, h: 844, safe: 0 },
  { w: 390, h: 844, safe: 34 },
]

describe('guide quest float position', () => {
  it('keeps the quest bar above the dock on every page after potions left the workshop', () => {
    expect(questFloatLiftPx('workshop')).toBe(questFloatLiftPx('dock'))
    expect(questFloatBottomCss('workshop')).toBe(
      `calc(var(--dock-height) + ${questFloatLiftPx('workshop')}px)`,
    )
    expect(questFloatBottomCss('dock')).toBe(`calc(var(--dock-height) + ${QUEST_FLOAT_ABOVE_DOCK}px)`)

    for (const phone of PHONES) {
      for (const buffBlock of [0, POTION_BUFF_BLOCK]) {
        const workshop = questFloatClearance({
          place: 'workshop',
          safeBottom: phone.safe,
          buffBlock,
        })
        expect(workshop.aboveSlots, `${phone.w}x${phone.h} safe ${phone.safe} buff ${buffBlock}`).toBeGreaterThanOrEqual(
          QUEST_SLOT_GAP,
        )
        expect(workshop.aboveDock).toBeGreaterThanOrEqual(workshop.aboveSlots)
        expect(workshop.aboveCamp).toBeGreaterThan(0)
      }

      const other = questFloatClearance({ place: 'dock', safeBottom: phone.safe })
      expect(other.aboveDock, `${phone.w}x${phone.h}`).toBeGreaterThanOrEqual(8)
      expect(other.aboveCamp).toBeGreaterThanOrEqual(8)
    }
  })
})
