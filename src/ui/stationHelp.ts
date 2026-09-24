import { STATION_DEF, STATION_IDS } from '../sim/tables'
import type { StationId } from '../sim/types'

/** 弹层一行。注意可缺，缺则不渲染。 */
export type StationHelpRow = {
  label: string
  text: string
}

export type StationHelpCopy = {
  title: string
  rows: StationHelpRow[]
}

/** 各站说明字段。只重排原长句，不改规则数值。 */
export type StationHelpEntry = {
  play: string
  output: string
  cost: string
  note?: string
}

/**
 * 工坊站卡「？」说明。只写现有规则，不改吞吐公式。
 * 有特殊产出 / 检定的站把差异放进注意。
 */
export const STATION_HELP: Record<StationId, StationHelpEntry> = {
  mining: {
    play: '挖矿。挖空后该矿恢复中（进度冻结），可换其它已解锁矿；恢复满后继续挖。',
    output: '成功双掉对应矿石 + 荒晶：矿石走订单 / 金币，荒晶去铭刻。',
    cost: '无额外原料',
    note: '矿脉有节点生命，每次成功吞吐扣 1 点。',
  },
  inscription: {
    play: '只造一次性战斗符文：从已解锁且付得起的配方里随机一种并给一批。',
    output: '符文开战时装 1 槽，只打携带者、只本场。',
    cost: '耗荒晶',
    note: '周期结束有软失败——失败扣部分荒晶、无成品、给少量 XP，不停站。',
  },
  hunting: {
    play: '按猎物品类狩猎：野猪 / 狼 / 鹿。',
    output: '成功出肉 / 鱼（去烹饪），血 / 牙 / 眼（去炼金），并低权出杂物。',
    cost: '无额外原料',
    note: '周期结束做遇险检定（不是战斗）：遇险掉本次产出、短暂停手，库存有熟食再耗 1 份，仍给站 XP。',
  },
  cooking: {
    play: '按菜谱消耗鱼 / 肉 / 香料做食物。',
    output: '烤鱼出熟食、烤肉出烤肉（开局可做）。休息区点选伙食，残血回来再吃。',
    cost: '鱼 / 肉 / 香料。香料炖耗肉或鱼加香料（Lv5）。',
  },
  herbalism: {
    play: '无限稳采，每次必出草或香料，不会空手。',
    output: '草去炼金，香料去烹饪。',
    cost: '无额外原料',
    note: '无挖空、无空杆、无遇险。',
  },
  alchemy: {
    play: '每次成功从 7 种药剂里随机一种并给一批。',
    output: '药剂装进工人页 4 槽后点槽使用，点 i 看效果。',
    cost: '做成即扣光 1 个草或猎副产（血 / 牙 / 眼，优先扣草）。',
  },
}

export const STATION_HP_HELP =
  '在岗体力影响效率：正常 100%，残血 80%，空血 50%。残血进入休息区才吃当前伙食；药剂点槽给在岗救急。'

const FIELD_LABEL = {
  name: '名称',
  play: '怎么玩',
  output: '产出',
  cost: '消耗',
  note: '注意',
  hp: '体力',
} as const

export function stationHelpCopy(id: StationId): StationHelpCopy {
  const help = STATION_HELP[id]
  const name = STATION_DEF[id].label
  const rows: StationHelpRow[] = [
    { label: FIELD_LABEL.name, text: name },
    { label: FIELD_LABEL.play, text: help.play },
    { label: FIELD_LABEL.output, text: help.output },
    { label: FIELD_LABEL.cost, text: help.cost },
  ]
  if (help.note) rows.push({ label: FIELD_LABEL.note, text: help.note })
  rows.push({ label: FIELD_LABEL.hp, text: STATION_HP_HELP })
  return { title: name, rows }
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
