export type ModeHelpId = 'treasure' | 'battlefield' | 'dungeon' | 'market'

export type ModeHelpRow = {
  label: string
  text: string
}

export type ModeHelp = {
  id: ModeHelpId
  title: string
  rows: ModeHelpRow[]
}

/** 夺宝 / 战场 / 地牢 / 商场的玩法说明。文案按现行规则写死。 */
export const MODE_HELP: Record<ModeHelpId, ModeHelp> = {
  treasure: {
    id: 'treasure',
    title: '夺宝',
    rows: [
      {
        label: '怎么玩',
        text: '点抢夺，从休息工人里选最多 3 人。胜后存活的人留下开采。放弃后变无人矿，可再开采，不能补人，也不能抢。',
      },
      {
        label: '规则要点',
        text: '新洞大约一半没有守军，可以直接开采。抢夺先行军再交战。开采不装符文，抢夺可以装。命中弱点开采快 1 秒。洞种不同，掉落偏重不同。',
      },
      {
        label: '注意',
        text: '同一洞抢夺中不能再开，也不能增援。一键撤出是放弃，储量、倒计时和弱点都不重置。花 10 钻刷新时保留战斗中与我方开采。',
      },
    ],
  },
  battlefield: {
    id: 'battlefield',
    title: '战场',
    rows: [
      {
        label: '怎么玩',
        text: '点开战，从满血休息工人里选 1～3 人。场上不满 3 人可以增援。',
      },
      {
        label: '规则要点',
        text: '确认后先行军，到点才交战。开战扣补给和已装符文；增援不扣补给，但扣该人的符文。探索花金币，换掉还能换的格子，交战中的留下。',
      },
      {
        label: '注意',
        text: '战败后不再出开战，只出增援。同一张单再开战不扣补给。胜可领，不用等凯旋。',
      },
    ],
  },
  dungeon: {
    id: 'dungeon',
    title: '地牢',
    rows: [
      {
        label: '怎么玩',
        text: '地牢按游戏日刷新，不占战场格子，也不被探索换掉。每天两单并排：深渊狱卒给钻石，黑市掮客给金币。每单卡头 2 条词缀，点词缀看效果。',
      },
      {
        label: '规则要点',
        text: '顶栏写今日两单，开战后加上已开战次数。选人和战场一样，但一单最多 5 人，每单当天只能开战 1 次。战斗分 3 个阶段。日切会强制刷新，先自动发还没领的宝箱，打到一半也会被清掉。',
      },
      {
        label: '注意',
        text: '这一页没有探索。刷新行是到下一次日切的倒计时。词缀和章节强度按当天锁定。',
      },
    ],
  },
  market: {
    id: 'market',
    title: '商场',
    rows: [
      {
        label: '怎么玩',
        text: '商场只放交易单：当铺、路人、黑心商人、工匠委托、收购。货够就成交，不进战斗。探索和战场一起刷新可换的格子。',
      },
      {
        label: '规则要点',
        text: '开局 2 格，科技最多 4 格。一部分新单带限时，卡上写倒计时，限时内奖励 ×2，超时该格留空，等下次探索再补。工匠委托给整座工坊一段产量加成。',
      },
      {
        label: '注意',
        text: '开局第一格是铜矿当，采矿还没开也照样要铜矿。限时只在商场。右侧简/详和战场、地牢共用。',
      },
    ],
  },
}

export function modeHelpOf(id: ModeHelpId): ModeHelp {
  return MODE_HELP[id]
}

/** 主线页签对到说明。旧值 mine 和未知页都算战场。 */
export function modeHelpIdForMainline(tab: string): ModeHelpId {
  if (tab === 'dungeon' || tab === 'market') return tab
  return 'battlefield'
}
