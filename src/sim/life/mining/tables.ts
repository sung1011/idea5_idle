import type { ItemId, MineNodeId } from '../../types'

export type MineNodeDef = {
  id: MineNodeId
  label: string
  itemId: ItemId
  mineS: number
  needMineLevel: number
  xp: number
}

/** 采矿自己的矿点表。禁止 goldCost / unlockLevel，也不读 combatLevel。玩法后做。 */
export const MINE_NODE_DEF: Record<MineNodeId, MineNodeDef> = {
  copperNode: {
    id: 'copperNode',
    label: '铜矿',
    itemId: 'copperOre',
    mineS: 4,
    needMineLevel: 1,
    xp: 6,
  },
}

export const MINE_NODE_IDS: MineNodeId[] = ['copperNode']
