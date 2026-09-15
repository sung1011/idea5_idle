import type { ItemId, TreeId } from '../../types'

export type TreeDef = {
  id: TreeId
  label: string
  itemId: ItemId
  chopS: number
  needWoodcutLevel: number
  xp: number
}

/** 伐木自己的树表。禁止 goldCost / unlockLevel，也不读 combatLevel。 */
export const TREE_DEF: Record<TreeId, TreeDef> = {
  normalTree: {
    id: 'normalTree',
    label: '普通树',
    itemId: 'log',
    chopS: 3,
    needWoodcutLevel: 1,
    xp: 8,
  },
  oakTree: {
    id: 'oakTree',
    label: '橡树',
    itemId: 'oakLog',
    chopS: 6,
    needWoodcutLevel: 3,
    xp: 18,
  },
}

export const TREE_IDS: TreeId[] = ['normalTree', 'oakTree']
