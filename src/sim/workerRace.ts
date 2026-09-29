import { hashString } from './combatAttrs'
import { roll01 } from './rng'
import { WORKER_RACE_IDS, type WorkerRaceId } from './types'
import type { Save } from './types'

/** 界面全称。id 不进文案。详情标题用这个。 */
export const WORKER_RACE_LABEL: Record<WorkerRaceId, string> = {
  orc: '兽人',
  troll: '巨魔',
  tauren: '牛头人',
  bloodElf: '血精灵',
  goblin: '地精',
  forsaken: '被遗忘者',
  pandaren: '熊猫人',
  nightborne: '夜之子',
  highmountainTauren: '至高岭牛头人',
  magharOrc: '玛格汉兽人',
  zandalariTroll: '赞达拉巨魔',
  vulpera: '狐人',
  voidElf: '虚空精灵',
  earthen: '土灵',
  dracthyr: '龙希尔',
  ogre: '食人魔',
  centaur: '半人马',
  naga: '纳迦',
  murloc: '鱼人',
  kobold: '狗头人',
}

/** 站点槽、休息区、行军行用的短标签。其余与全称相同。 */
export const WORKER_RACE_SHORT_LABEL: Record<WorkerRaceId, string> = {
  orc: '兽人',
  troll: '巨魔',
  tauren: '牛头人',
  bloodElf: '血精灵',
  goblin: '地精',
  forsaken: '被遗忘者',
  pandaren: '熊猫人',
  nightborne: '夜之子',
  highmountainTauren: '至高岭',
  magharOrc: '玛格汉',
  zandalariTroll: '赞达拉',
  vulpera: '狐人',
  voidElf: '虚空精灵',
  earthen: '土灵',
  dracthyr: '龙希尔',
  ogre: '食人魔',
  centaur: '半人马',
  naga: '纳迦',
  murloc: '鱼人',
  kobold: '狗头人',
}

/**
 * 各种族名字池。招募 / 合成 / 助战按种族取名。
 * 不用魔兽官方角色名。
 */
export const WORKER_RACE_NAMES: Record<WorkerRaceId, readonly string[]> = {
  orc: ['格鲁克', '卡兹莫', '裂颚', '乌洛克', '玛戈', '杜沙', '戈尔坎', '纳祖克', '血喉', '萨戈'],
  troll: ['赞达', '金索', '祖巴', '玛金', '托卡', '希拉', '鲁祖', '卡金', '沃扎', '金巴'],
  tauren: ['蓝蹄', '塔胡', '石角', '穆拉', '灰鬃', '托尔卡', '温图', '霍恩', '鲁哈', '岩蹄'],
  bloodElf: ['瑟兰', '艾洛娜', '瓦里斯', '珊德拉', '洛瑟玛', '伊琳', '泰洛斯', '米拉', '萨洛', '维恩'],
  goblin: ['铜牙', '尖帽', '爆筒', '钱袋', '齿轮', '油污', '碎钉', '黄牙', '撬锁', '小账'],
  forsaken: ['灰喉', '骨针', '暮语', '冷烬', '朽冠', '暗缝', '残焰', '无面', '夜棺', '枯藤'],
  pandaren: ['圆肚', '竹影', '云步', '蜜酿', '石钵', '暖风', '厚掌', '茶烟', '松涛', '慢蹄'],
  nightborne: ['夜纱', '星茧', '紫雾', '月纹', '寂塔', '幻丝', '暮铃', '奥纹', '沉星', '夜露'],
  highmountainTauren: ['高角', '鹰巢', '雪脊', '河歌', '崖啸', '白峰', '雷蹄', '云角', '石瀑', '风岭'],
  magharOrc: ['褐肤', '荒斧', '红土', '烈日', '平原', '未腐', '骨哨', '热风', '沙喉', '原誓'],
  zandalariTroll: ['金鳞', '古庙', '日冠', '厚鳞', '神殿', '金羽', '潮吼', '皇骨', '沙金', '古鳞'],
  vulpera: ['沙尾', '快耳', '驼铃', '旱爪', '细嗅', '红沙', '篷影', '短靴', '热鼻', '风袋'],
  voidElf: ['虚语', '裂空', '紫瞳', '低语', '暗星', '触须', '空洞', '星蚀', '夜隙', '无光'],
  earthen: ['岩芯', '晶须', '石脉', '铜纹', '深铸', '鸣石', '灰须', '矿鸣', '稳步', '岩钟'],
  dracthyr: ['鳞翼', '短吼', '风膜', '赤鳞', '巢风', '龙息', '折翼', '青膜', '高啼', '焰脊'],
  ogre: ['双颅', '巨棒', '厚肚', '笨步', '石牙', '高吼', '重拳', '粗颈', '大脚', '闷锤'],
  centaur: ['奔蹄', '长鬃', '尘鬃', '快蹄', '草海', '缰风', '野奔', '蹄雷', '弓风', '原鞭'],
  naga: ['蛇鳞', '潮鳍', '深歌', '盐矛', '海鬃', '冷潮', '碧鳞', '漩尾', '潮语', '暗湾'],
  murloc: ['咕噜', '泡泡', '湿爪', '鱼跃', '泥咕', '亮鳞', '潮咕', '圆眼', '蛙跳', '水花'],
  kobold: ['烛火', '亮鼻', '隧道', '蜡滴', '尖耳', '矿蜡', '小烛', '暗洞', '偷光', '蜡芯'],
}

export function isWorkerRaceId(value: unknown): value is WorkerRaceId {
  return typeof value === 'string' && (WORKER_RACE_IDS as readonly string[]).includes(value)
}

/** 旧档缺种族时按 id 落到固定一种，重复读档不换。 */
export function raceFromWorkerId(id: string): WorkerRaceId {
  return WORKER_RACE_IDS[hashString(id) % WORKER_RACE_IDS.length] ?? 'orc'
}

export function nameFromWorkerId(id: string, race: WorkerRaceId = raceFromWorkerId(id)): string {
  const pool = WORKER_RACE_NAMES[race]
  return pool[hashString(`${id}:name`) % pool.length] ?? pool[0]
}

export function identityFromWorkerId(id: string): { race: WorkerRaceId; name: string } {
  const race = raceFromWorkerId(id)
  return { race, name: nameFromWorkerId(id, race) }
}

export function rollWorkerRace(save: Save): WorkerRaceId {
  const index = Math.min(
    WORKER_RACE_IDS.length - 1,
    Math.max(0, Math.floor(roll01(save) * WORKER_RACE_IDS.length)),
  )
  return WORKER_RACE_IDS[index] ?? 'orc'
}

export function rollWorkerName(save: Save, race: WorkerRaceId): string {
  const pool = WORKER_RACE_NAMES[race]
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(roll01(save) * pool.length)))
  return pool[index] ?? pool[0]
}

export function workerRaceLabel(race: unknown): string {
  return isWorkerRaceId(race) ? WORKER_RACE_LABEL[race] : ''
}

export function workerRaceShortLabel(race: unknown): string {
  return isWorkerRaceId(race) ? WORKER_RACE_SHORT_LABEL[race] : ''
}
