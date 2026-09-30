import { itemQty } from '../sim/bank'
import {
  ITEM_DEF,
  PLAYABLE_STATION_IDS,
  SELLABLE_GOODS,
  STATION_DEF,
  isBeastManualItem,
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
import { formatHudGrouped, formatHudQty } from './formatHud'

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
    name: '酋长等级',
    source: '酋长经验：站升级、引导、悬赏、集市、地牢和每日名次。',
    usage: '点开可看经验和下一开放目标。升级时发放 1 点灵感，用来点科技。',
  },
  gold: {
    name: '金币',
    source: '新档没有金币。工坊吞吐按产出 craftGold 给少量金币；主线战胜领战利品；地精当铺典当与收购换金。',
    usage: '探索、地精奸商购买及集市订单等生活开销。',
  },
  diamonds: {
    name: '钻石',
    source: '新档没有钻石。主线进阶任务、悬赏与集市部分订单掉落。',
    usage: '抽苦工。新档前 2 次免费，之后按费用扣钻。',
  },
  workers: {
    name: '苦工',
    source: '新档前 2 次免费抽取，之后花钻石；同档两人可合成升一档。',
    usage: '派驻工坊生产，或出战主线敌人。',
  },
  inspiration: {
    name: '灵感',
    source: '新档自带 20 点；酋长等级每升 1 级再给 1 点。',
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

export function hudChipCount(save: Save, id: HudChipId): number {
  if (id === 'knight') return Number.isFinite(save.knightLevel) ? save.knightLevel : 0
  if (id === 'gold') return save.gold
  if (id === 'diamonds') return save.diamonds
  if (id === 'workers') return save.workers.length
  if (id === 'inspiration') return save.techPoints
  return itemQty(save, id)
}

export function hudChipAmount(save: Save, id: HudChipId): string {
  if (id === 'knight') return `Lv${save.knightLevel}`
  return formatHudQty(hudChipCount(save, id))
}

/** 胶囊上的展示数字。等级徽章和经验条不用这个。 */
export function hudChipGrouped(save: Save, id: HudChipId): string {
  return formatHudGrouped(hudChipCount(save, id))
}

/** 胶囊描边。金币金、钻石珠宝紫、草类草绿，其余按种类配色。 */
export function hudChipTone(id: HudChipId): string {
  if (id === 'gold') return 'gold'
  if (id === 'diamonds') return 'gem'
  if (id === 'workers') return 'worker'
  if (id === 'herb' || id === 'spice') return 'grass'
  if (id === 'wood') return 'wood'
  if (id === 'wildCrystal') return 'crystal'
  if (id === 'blueprint') return 'paper'
  if (id === 'ore' || id === 'ironOre' || id === 'mithrilOre' || id === 'slag') return 'ore'
  if (id === 'blood' || id === 'tooth' || id === 'eye') return 'hunt'
  if (isFoodItemId(id)) return 'food'
  if (isPotionItemId(id) || id === 'potion') return 'potion'
  if (isRuneItemId(id) || id === 'anyRune') return 'rune'
  if (
    id === 'weapon' ||
    id === 'ironWeapon' ||
    id === 'mithrilWeapon' ||
    id === 'tool' ||
    id === 'ironTool' ||
    id === 'mithrilTool'
  ) {
    return 'steel'
  }
  if (typeof id === 'string' && id.startsWith('beast')) return 'beast'
  return 'misc'
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

function beastHudSource(itemId: ItemId): string {
  if (itemId === 'boneSoup' || itemId === 'hunterSkewer') return '烹饪站兽材料理'
  if (itemId === 'beastOil') return '炼金站兽材料理'
  return '困兽日结或跨线奖'
}

function beastHudUsage(itemId: ItemId): string {
  if (itemId === 'beastBone') return '烹饪站做骨汤：兽骨 1 + 肉 10 → 5 份'
  if (itemId === 'beastSinew') return '烹饪站做猎人肉串：兽筋 1 + 香料 10 → 5 份'
  if (itemId === 'beastFat') return '炼金站做狂兽油：困兽油脂 1 + 草 10 → 3 瓶'
  if (itemId === 'beastHeart') return '烹饪站摆酋长宴：野兽心脏 1 + 肉 20 + 香料 10，全工坊产量 ×1.2 持续 1 小时'
  if (itemId === 'beastCore') return '工坊页选一座已开放的站点，直接升 1 级'
  if (itemId === 'boneSoup') return '营地伙食：回 70% 最大生命，生产速度 ×1.05 持续 10 分钟'
  if (itemId === 'hunterSkewer') return '营地伙食：回满血，之后 30 分钟在岗不掉血、不记劳损'
  if (itemId === 'beastOil') return '装进营地药剂槽：随机 3 名营地苦工效率 ×2，持续 3 分钟'
  return '困兽兽材'
}

export function itemHudSource(itemId: ItemId): string {
  const station = itemProducerStation(itemId)
  if (station) return `${STATION_DEF[station].label}产出`
  if (isBeastManualItem(itemId)) return beastHudSource(itemId)
  if (leftoverStockItems().includes(itemId)) return '旧档遗留 / 已撤玩法，现工坊不再产出'
  return '偶遇补给或旧档遗留'
}

export function itemHudUsage(itemId: ItemId): string {
  const consume = PLAYABLE_STATION_IDS.filter((id) => stationRelatedItems(id).costs.includes(itemId)).map(
    (id) => STATION_DEF[id].label,
  )
  const extras: string[] = []
  if (isBeastManualItem(itemId)) extras.push(beastHudUsage(itemId))
  if (isFoodItemId(itemId)) extras.push('营地伙食，残血入休息回血')
  if (isPotionItemId(itemId) || itemId === 'potion') extras.push('营地药剂槽短按使用')
  if (itemId === 'anyPotion') extras.push('主线订单通配：扣库存最多的一种药剂')
  if (isRuneItemId(itemId)) extras.push('开战选人一槽装备，本场消耗')
  if (itemId === 'anyRune') extras.push('主线订单通配：扣库存最多的一种符文')
  if (itemId === 'wildCrystal') extras.push('铭刻符文的主原料')
  if (isStationToolId(itemId) || isToolItemId(itemId)) extras.push('旧档工具，读档会转成荒晶')
  if (itemId === 'blueprint') extras.push('只进物资，不再兑换灵感')
  if (itemId === 'slag') extras.push('点亮渣滓回炉后可替代铜矿')

  const bits: string[] = []
  if (consume.length) bits.push(`${consume.join('、')}消耗`)
  bits.push(...extras)
  if (SELLABLE_GOODS.includes(itemId) || leftoverStockItems().includes(itemId)) {
    bits.push(bits.length ? '也可地精当铺典当 / 收购换金' : '库存暂无常规消耗，可地精当铺典当 / 收购换金')
  } else if (!bits.length) {
    bits.push('库存暂无常规消耗')
  }
  return bits.join('；')
}
