export type ModeHelpId = 'treasure' | 'armory' | 'banner' | 'battlefield' | 'dungeon' | 'market'

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
        text: '无人矿不押军费。每名守军押 40 砂金，胜退败扣。放弃不重置。',
      },
      {
        label: '规则要点',
        text: '一半没有守军。抢夺先行军再交战。开采不装符文，抢夺可以装。开采快 1 秒。洞种不同，掉落偏重不同。',
      },
      {
        label: '注意',
        text: '不能再开。60 珠宝增援一次。未满员 80 珠宝补 1 人。侦察 20 砂金揭弱点。刷新 100 砂金或 10 钻，保留战斗中与我方开采。开采中可能被袭，60 珠宝可加固一层。',
      },
    ],
  },
  armory: {
    id: 'armory',
    title: '军械铺',
    rows: [
      {
        label: '怎么玩',
        text: '花珠宝换锋锐、厚甲、迅击，进符文背包。夺宝抢夺可以装上。',
      },
      {
        label: '规则要点',
        text: '每种 40 珠宝一枚。珠宝不够时按钮变灰，并提示还差多少。',
      },
      {
        label: '注意',
        text: '战斗中 60 珠宝可增援 1 名满血工人，每仗 1 次。开采未满员可花 80 珠宝再补 1 人。人数上限看战旗。',
      },
    ],
  },
  banner: {
    id: 'banner',
    title: '战旗',
    rows: [
      {
        label: '怎么玩',
        text: '花古玉升级战旗，最高 5 级。不够时按钮变灰，并提示还差多少。',
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
