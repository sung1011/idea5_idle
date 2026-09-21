import { itemQty } from '../sim/bank'
import {
  ITEM_DEF,
  PLAYABLE_STATION_IDS,
  SELLABLE_GOODS,
  STATION_DEF,
  isFoodItemId,
  isPotionItemId,
  isRuneItemId,
  isStationToolId,
  isToolItemId,
  itemProducerStation,
  leftoverStockItems,
  stationRelatedItems,
} from '../sim/tables'
import type { ItemId, Save } from '../sim/types'
import { leftoverStockRows } from '../sim/query'
import { formatHudQty } from './formatHud'

/** 顶栏核心芯片从左到右：骑士等级最先。灵感只在科技页。 */
export const HUD_CORE_IDS = ['knight', 'gold', 'diamonds', 'workers'] as const
export type HudCoreId = (typeof HUD_CORE_IDS)[number]
export type HudResourceId = HudCoreId | 'inspiration'
export type HudChipId = HudResourceId | ItemId

export type HudChip = {
  id: HudChipId
  kind: 'core' | 'item'
  name: string
}

export type HudChipDetail = {
  id: HudChipId
  name: string
  amount: string
  source: string
  usage: string
}

const CORE_COPY: Record<HudResourceId, { name: string; source: string; usage: string }> = {
  knight: {
    name: '骑士等级',
    source: '各可玩工坊站等级汇总：每站升 1 级，骑士等级 +1。',
    usage: '升级时发放 1 点灵感，用来点科技。',
  },
  gold: {
    name: '金币',
    source: '工坊吞吐按产出 craftGold 给少量金币；主线战胜领战利品；当铺典当与收购换金。',
    usage: '探索、黑心商人购买及商场订单等生活开销。',
  },
  diamonds: {
    name: '钻石',
    source: '新档自带 100；主线战场与商场部分订单掉落。',
    usage: '抽工人。',
  },
  workers: {
    name: '工人',
    source: '花钻石抽人获得；同档两人可合成升一档。',
    usage: '派驻工坊生产，或出战主线敌人。',
  },
  inspiration: {
    name: '灵感',
    source: '新档自带 20 点；骑士等级每升 1 级再给 1 点。',
    usage: '点亮科技树节点。',
  },
}

export function isHudResourceId(id: string): id is HudResourceId {
  return id === 'inspiration' || (HUD_CORE_IDS as readonly string[]).includes(id)
}

/** 核心芯片 + 有货的旧档遗留物资（滑进顶栏右侧）。 */
export function listHudChips(save: Save): HudChip[] {
  const chips: HudChip[] = HUD_CORE_IDS.map((id) => ({
    id,
    kind: 'core',
    name: CORE_COPY[id].name,
  }))
  for (const row of leftoverStockRows(save)) {
    chips.push({ id: row.itemId, kind: 'item', name: row.label })
  }
  return chips
}

export function hudChipAmount(save: Save, id: HudChipId): string {
  if (id === 'knight') return `Lv${save.knightLevel}`
  if (id === 'gold') return formatHudQty(save.gold)
  if (id === 'diamonds') return formatHudQty(save.diamonds)
  if (id === 'workers') return formatHudQty(save.workers.length)
  if (id === 'inspiration') return formatHudQty(save.techPoints)
  return formatHudQty(itemQty(save, id))
}

export function hudChipAriaLabel(save: Save, chip: HudChip): string {
  return `${chip.name} ${hudChipAmount(save, chip.id)}`
}

export function hudChipDetail(save: Save, id: HudChipId): HudChipDetail {
  if (isHudResourceId(id)) {
    const copy = CORE_COPY[id]
    return {
      id,
      name: copy.name,
      amount: hudChipAmount(save, id),
      source: copy.source,
      usage: copy.usage,
    }
  }
  return {
    id,
    name: ITEM_DEF[id]?.label ?? id,
    amount: hudChipAmount(save, id),
    source: itemHudSource(id),
    usage: itemHudUsage(id),
  }
}

export function itemHudSource(itemId: ItemId): string {
  const station = itemProducerStation(itemId)
  if (station) return `${STATION_DEF[station].label}产出`
  if (leftoverStockItems().includes(itemId)) return '旧档遗留 / 已撤玩法，现工坊不再产出'
  return '偶遇补给或旧档遗留'
}

export function itemHudUsage(itemId: ItemId): string {
  const consume = PLAYABLE_STATION_IDS.filter((id) => stationRelatedItems(id).costs.includes(itemId)).map(
    (id) => STATION_DEF[id].label,
  )
  const extras: string[] = []
  if (isFoodItemId(itemId)) extras.push('工人食物槽回血')
  if (isPotionItemId(itemId) || itemId === 'potion') extras.push('工人页药剂槽短按使用')
  if (isRuneItemId(itemId)) extras.push('开战选人一槽装备，本场消耗')
  if (itemId === 'wildCrystal') extras.push('铭刻符文的主原料')
  if (isStationToolId(itemId) || isToolItemId(itemId)) extras.push('旧档工具，读档会转成荒晶')
  if (itemId === 'blueprint') extras.push('只进物资，不再兑换灵感')
  if (itemId === 'slag') extras.push('点亮渣滓回炉后可替代铜矿')

  const bits: string[] = []
  if (consume.length) bits.push(`${consume.join('、')}消耗`)
  bits.push(...extras)
  if (SELLABLE_GOODS.includes(itemId) || leftoverStockItems().includes(itemId)) {
    bits.push(bits.length ? '也可当铺典当 / 收购换金' : '库存暂无常规消耗，可当铺典当 / 收购换金')
  } else if (!bits.length) {
    bits.push('库存暂无常规消耗')
  }
  return bits.join('；')
}
