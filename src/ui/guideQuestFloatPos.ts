/** 底栏不含血条时的外高：上边框 3 + 上下内边距 6+6 + 页签 52。 */
export const DOCK_BOX_WITHOUT_HP = 3 + 6 + 52 + 6

/** 非工坊页血条 5px，和页签间距 4px。任务条的底边距不含这段。 */
export const DOCK_HP_EXTRA = 5 + 4

/** 没有血条时，营地圆钮高出底栏上沿。 */
export const CAMP_STICK_OUT = 7

/** 药剂槽已搬进营地，工坊页不再为槽位抬高任务条。 */
export const POTION_SLOT_TOP_ABOVE_DOCK = 0

/** 工坊页不再显示药剂时效行。 */
export const POTION_BUFF_BLOCK = 0

/** 任务条和底栏之间留出的空隙。 */
export const QUEST_SLOT_GAP = 12

/** 底栏上沿再往上，避开底栏和凸起的营地钮。工坊页同样用这份高度。 */
export const QUEST_FLOAT_ABOVE_DOCK = 64

/** 药剂槽不在工坊页，任务条不再额外抬高。 */
export const QUEST_FLOAT_ABOVE_POTION = QUEST_FLOAT_ABOVE_DOCK

export type QuestFloatPlace = 'workshop' | 'dock'

export function questFloatLiftPx(place: QuestFloatPlace): number {
  void place
  return QUEST_FLOAT_ABOVE_DOCK
}

export function questFloatBottomCss(place: QuestFloatPlace): string {
  return `calc(var(--dock-height) + ${questFloatLiftPx(place)}px)`
}

/** 正数表示任务条下沿还在目标上沿之上，两者不重叠。 */
export function questFloatClearance(input: {
  place: QuestFloatPlace
  safeBottom?: number
  buffBlock?: number
}): { aboveSlots: number; aboveDock: number; aboveCamp: number } {
  const safe = input.safeBottom ?? 0
  const buff = input.buffBlock ?? 0
  const showHp = input.place !== 'workshop'
  const dockCss = DOCK_BOX_WITHOUT_HP + safe
  const dockVisual = dockCss + (showHp ? DOCK_HP_EXTRA : 0)
  const lift = questFloatLiftPx(input.place)
  const aboveDock = dockCss + lift - dockVisual
  return {
    aboveSlots: aboveDock - (POTION_SLOT_TOP_ABOVE_DOCK + buff),
    aboveDock,
    aboveCamp: aboveDock - (showHp ? 0 : CAMP_STICK_OUT),
  }
}
