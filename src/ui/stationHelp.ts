import { STATION_DEF, STATION_IDS } from '../sim/tables'
import type { StationId } from '../sim/types'

export type StationHelpCopy = {
  title: string
  body: string
}

/**
 * 工坊站卡「？」说明。只写现有规则，不改吞吐公式。
 * 有特殊产出 / 检定的站写清差异，其余给短通用说明。
 */
export const STATION_HELP: Record<StationId, string> = {
  mining:
    '矿脉有节点生命，每次成功吞吐扣 1 点。挖空后该矿恢复中（进度冻结），可换其它已解锁矿；恢复满后继续挖。成功双掉对应矿石 + 荒晶：矿石走订单 / 金币，荒晶去铭刻。',
  inscription:
    '只造一次性战斗符文：耗荒晶，从已解锁且付得起的配方里随机一种并给一批。周期结束有软失败——失败扣部分荒晶、无成品、给少量 XP，不停站。符文开战时装 1 槽，只打携带者、只本场。',
  hunting:
    '周期结束做遇险检定（不是战斗）：遇险掉本次产出、短暂停手，库存有熟食再耗 1 份，仍给站 XP。成功出肉 / 鱼（去烹饪），血 / 牙 / 眼（去炼金），并低权出杂物。猎物按品类：野猪 / 狼 / 鹿。',
  cooking:
    '按菜谱消耗鱼 / 肉 / 香料做食物。烤鱼出熟食、烤肉出烤肉（开局可做），香料炖耗肉或鱼加香料（Lv5）。食物装工人食物槽，主职回血。',
  herbalism:
    '无限稳采：无挖空、无空杆、无遇险。每次必出草或香料，不会空手。草去炼金，香料去烹饪。',
  alchemy:
    '做成即扣光 1 个草或猎副产（血 / 牙 / 眼，优先扣草）。每次成功从 7 种药剂里随机一种并给一批。药剂装进工人页 4 槽后点槽使用，点？看效果。',
}

export function stationHelpCopy(id: StationId): StationHelpCopy {
  return {
    title: STATION_DEF[id].label,
    body: STATION_HELP[id],
  }
}

/** 再点同一站「？」关闭；换一站则打开该站说明。 */
export function nextStationHelp(current: StationId | null, next: StationId): StationId | null {
  return current === next ? null : next
}

export function isStationHelpOpen(current: StationId | null, id: StationId): boolean {
  return current === id
}

export function stationHelpIds(): readonly StationId[] {
  return STATION_IDS
}
