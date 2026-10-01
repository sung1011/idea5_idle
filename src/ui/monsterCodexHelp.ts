import {
  MONSTER_FIRST_LIGHT_DIAMONDS,
  MONSTER_PROGRESS,
  MONSTER_SHARD_EXCHANGE_COST,
  MONSTER_TITLE_MASTER,
  MONSTER_TITLE_WIDE,
} from '../sim/monsterCodex'
import type { ModeHelpRow } from './modeHelp'

export const MONSTER_CODEX_HELP_TITLE = '怪物图鉴'

const t5 = MONSTER_PROGRESS.find((row) => row.id === 't5')
const t10 = MONSTER_PROGRESS.find((row) => row.id === 't10')
const tall = MONSTER_PROGRESS.find((row) => row.id === 'all')

/** 怪物图鉴顶栏「？」的短说明。怎么点亮、兑换干什么、进度奖概要。 */
export const MONSTER_CODEX_HELP_ROWS: ModeHelpRow[] = [
  {
    label: '怎么玩',
    text: '点 PVE 上头的图鉴。板上见到这单，或交掉这单，就点亮那种。悬赏去探索刷，集市去逛刷，地牢每天两单。采矿开了之后，集市第一格会出地精铜矿当。本章交满 10 单出首领。',
  },
  {
    label: '规则要点',
    text: `点亮不改订单给的金币钻石。每种第一次点亮给 ${MONSTER_FIRST_LIGHT_DIAMONDS} 钻。交单时另掷碎片：前半牙饰、中后兽纹布、首领和地牢出外观或头像框。碎片凑 ${MONSTER_SHARD_EXCHANGE_COST} 能兑营地旗、帘或头像框。`,
  },
  {
    label: '注意',
    text: `点亮 ${t5?.need ?? 5} 种领钻和称号「${t5?.title ?? MONSTER_TITLE_WIDE}」，${t10?.need ?? 10} 种再领一笔钻，全点亮再领一笔钻和「${tall?.title ?? MONSTER_TITLE_MASTER}」。每档只领一次。兑换在另一个页签，兑过的不能再兑。`,
  },
]
