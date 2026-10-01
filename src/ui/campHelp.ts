import {
  FUSE_JACKPOT_RATE_HIGH,
  FUSE_JACKPOT_RATE_LOW,
  FUSE_JACKPOT_RATE_MID,
} from '../sim/fuse'
import type { ModeHelpRow } from './modeHelp'

export const CAMP_HELP_TITLE = '营地'

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/** 营地面板「？」的短说明。百分比跟合成大成功表走。 */
export const CAMP_HELP_ROWS: ModeHelpRow[] = [
  {
    label: '怎么玩',
    text: '点营地看这排苦工。最前头满血是队首，可以派去干活或出征。队首没满血会标成堵队，后面的人先等着。干完、打完回来的人排到队尾。',
  },
  {
    label: '规则要点',
    text: '在营地里把两名同品质苦工拖到一起。两人合成一人，一定升一阶。合出来的人很虚弱，只剩一点血，排到队尾，回满才能派。品质不同，拖不到一起。',
  },
  {
    label: '注意',
    text: `合成时偶尔会大成功，再跳一阶。白、绿大约 ${pct(FUSE_JACKPOT_RATE_LOW)}（八九次里碰上一次），蓝、青、紫、橙大约 ${pct(FUSE_JACKPOT_RATE_MID)}（十来次里碰上一次），粉、红大约 ${pct(FUSE_JACKPOT_RATE_HIGH)}（三十次里碰上一次）。金合出来已是彩，不再跳。彩不能再合。大成功合出来的人同样虚弱。`,
  },
]
