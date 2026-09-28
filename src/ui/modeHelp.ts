export type ModeHelpId = 'treasure' | 'herb' | 'banner' | 'battlefield' | 'dungeon' | 'market'

export type ModeHelpRow = {
  label: string
  text: string
}

export type ModeHelp = {
  id: ModeHelpId
  title: string
  rows: ModeHelpRow[]
}

/** 夺宝 / 战旗 / 战场 / 地牢 / 商场的玩法说明。文案按现行规则写死。战旗从夺宝顶部栏打开。 */
export const MODE_HELP: Record<ModeHelpId, ModeHelp> = {
  treasure: {
    id: 'treasure',
    title: '夺宝',
    rows: [
      {
        label: '怎么玩',
        text: '无人矿不押军费。每名守军押 40 砂金，胜退败扣。放弃不重置。',
      },
      {
        label: '规则要点',
        text: '一半没有守军。抢夺先行军再交战。开采不装符文，抢夺可以装。开采快 1 秒。挖出矿石，悬赏可双倍。',
      },
      {
        label: '注意',
        text: '不能再开。侦察 20 砂金揭弱点。刷新 100 砂金或 10 钻，保留战斗中与我方开采。洞被袭可花 60 珠宝增援一次，也可花 60 珠宝加固一层。顶部战旗栏花古玉升级，最高 5 级。',
      },
    ],
  },
  herb: {
    id: 'herb',
    title: '割草',
    rows: [
      {
        label: '怎么玩',
        text: '8×8 全是杂草。从休息区派满血苦工，一块 3 分钟，同时最多 3 块。体力 10，除草花 1，30 分钟回 1。',
      },
      {
        label: '规则要点',
        text: '地下是荒芜、草药、珍贵草药或侦测。珍贵草药立刻记分。北京时间 0 点按名次发砂金、珠宝、古玉和侦测。开局三种侦测各 1 个。',
      },
      {
        label: '注意',
        text: '撞上正在除的人，双方各打一下。一击打倒就接着除，没打倒就回休息，体力不退。体力为 0 仍可用侦测。',
      },
    ],
  },
  banner: {
    id: 'banner',
    title: '战旗',
    rows: [
      {
        label: '怎么玩',
        text: '夺宝顶部战旗栏点开。花古玉升级，最高 5 级。不够时按钮变灰，并写还差多少。',
      },
      {
        label: '规则要点',
        text: '每级让之后新刷的洞储量 +10%，守军等级 +1。已经在的洞不变。',
      },
      {
        label: '注意',
        text: '2 级和 4 级各让开采上限 +1，最多 5 人。抢夺出战仍是 3 人。1 级铜框、3 级银框、5 级金框。',
      },
    ],
  },
  battlefield: {
    id: 'battlefield',
    title: '战场',
    rows: [
      {
        label: '怎么玩',
        text: '点开战，从满血休息苦工里选 1～3 人。场上不满 3 人可以增援。',
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
