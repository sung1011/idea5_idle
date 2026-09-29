/** 底栏不含血条时的外高：上边框 3 + 上下内边距 6+6 + 页签 52。 */
export const DOCK_BOX_WITHOUT_HP = 3 + 6 + 52 + 6

/** 非工坊页血条 5px，和页签间距 4px。任务条的底边距不含这段。 */
export const DOCK_HP_EXTRA = 5 + 4

/** 没有血条时，营地圆钮高出底栏上沿。 */
export const CAMP_STICK_OUT = 7

/**
 * 工坊药剂槽上沿到导航底栏上沿（没有时效行）。
 * 页底内边距 6 + 药剂坞下外边距 4 + 下边框 3 + 下内边距 6 + 槽高 78。
 */
export const POTION_SLOT_TOP_ABOVE_DOCK = 6 + 4 + 3 + 6 + 78

/** 时效行最多两行：上外边距 4 + 每行约 14。槽会跟着往上长。 */
export const POTION_BUFF_BLOCK = 4 + 14 * 2

/** 任务条下沿和药剂槽上沿之间留出的空隙。 */
export const QUEST_SLOT_GAP = 12

/** 非工坊页：底栏上沿再往上，避开底栏和凸起的营地钮。 */
export const QUEST_FLOAT_ABOVE_DOCK = 64

/** 工坊页：抬到药剂槽（含两行时效）上方。 */
export const QUEST_FLOAT_ABOVE_POTION = POTION_SLOT_TOP_ABOVE_DOCK + POTION_BUFF_BLOCK + QUEST_SLOT_GAP

export type QuestFloatPlace = 'workshop' | 'dock'

export function questFloatLiftPx(place: QuestFloatPlace): number {
  return place === 'workshop' ? QUEST_FLOAT_ABOVE_POTION : QUEST_FLOAT_ABOVE_DOCK
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
