# 骑士工坊 · 生产定稿

字段名尽量稳定，供实现对照。第 1～5 期已按本文落地；与旧档不一致时以本文 + hydrate 为准。总览仍见 [main.md](main.md)，站点等级公式见 [stationProgress.md](stationProgress.md)，分阶段见 [todo.md](todo.md)。

---

## 0. 范围

- **本期做**：本文 + `main` / `todo`（及 README 指针）对齐。
- **本期不做**：第 1～5 期代码；不改生产公式、不换工坊表、不改工人存档形状。
- **定名**：七站英文 id 用下表；锻造只用 `forging`（`smithing` 是别称，不另开 id）。

---

## 1. 七工坊

`StationKind = 'gather' | 'craft'`。采集四站各有一条核心差异；制造三站走配方。

| 站 | `stationId` | `kind` | 核心差异 | 产出 → 去向 |
| --- | --- | --- | --- | --- |
| 挖矿 | `mining` | gather | 节点生命，挖空等恢复 | 矿石 → 锻造 |
| 锻造 | `forging` | craft | 配方 + 软失败 | 生产工具 → 工人 `toolSlot`（武器线搁置） |
| 狩猎 | `hunting` | gather | 遇险检定（非战斗） | 肉 → 烹饪；血 / 牙 / 眼 → 炼金 |
| 烹饪 | `cooking` | craft | 产出食物 | 食物 → 工人 `foodSlot` → 生产 Buff |
| 采药 | `herbalism` | gather | 无限稳采 | 草 → 炼金；香料 → 烹饪 |
| 炼金 | `alchemy` | craft | 一次性消耗草 / 猎副产（效果未定） | `potion` 占位，效果后补 |
| 钓鱼 | `fishing` | gather | 可空杆；期望更慢；随机；渔场品阶墙 | 鱼 → 烹饪；杂物低权 |

```ts
type StationId =
  | 'mining'
  | 'forging'
  | 'hunting'
  | 'cooking'
  | 'herbalism'
  | 'alchemy'
  | 'fishing'

/** 旧站。仍可能出现在旧档 / 现码，不当七站之一。 */
type DeprecatedStationId = 'woodcutting'
```

UI 主列七站。`woodcutting` 废弃或藏入口，见第 7 节。

---

## 2. 各站核心差异

迅雷堆人、`cycleS`、站点 XP / 品类骨架仍沿用现式（周期 ×4 且 ≥20s，升级曲线见 stationProgress）。下面只定**差异规则**；具体数值第 2 期表驱动。

### 2.1 挖矿 `mining`（采集）

节点有生命。每次成功吞吐扣 `nodeHp`；`nodeHp <= 0` 后写入 `recoverAt`（恢复完成时的 `elapsedS`），恢复完成前该节点不产矿（进度冻结，可换其它已解锁矿）。恢复满后 `nodeHp = nodeHpMax`，`recoverAt = null`。各矿品类节点存在 `miningNodes`，当前档镜像为 `miningNode`。

```ts
type MiningNodeState = {
  categoryId: CategoryId
  nodeHp: number
  nodeHpMax: number
  /** 挖空后恢复完成的 elapsedS；未空为 null */
  recoverAt: number | null
}
```

产出：`ore` / `ironOre` / `mithrilOre`（沿用现档），只进物资，去向锻造。

### 2.2 锻造 `forging`（制造）

表驱动 `costs`（及可选 `altCosts`）+ **软失败**：周期走完后做一次失败检定。成功按现规则扣光并出工具。失败扣部分原料（`FORGING_SOFT_FAIL_TAKE_RATIO` 0.5，不足 1 按 1；铜档 1 矿失败也扣 1），无成品，给少量 XP（`xpPerCycle * 0.5`，至少 1）。不炸炉、不停站、不额外扣工人。成功率见 `FORGING_SOFT_FAIL_CHANCE`。

产出是**生产工具**，进物资后再装进工人 `toolSlot`。武器线（`weapon` / `ironWeapon` / `mithrilWeapon`）搁置，本阶段不当锻造主产物。

```ts
type SoftFailRoll = {
  chance: number
  outcome: 'ok' | 'softFail'
}
```

工具建议 id（第 3 期落地，现码可暂不出现）：

| `itemId` | 含义 |
| --- | --- |
| `tool` | 初级生产工具 |
| `ironTool` | 中阶 |
| `mithrilTool` | 高阶 |

每件工具带 `matchStationId`：派在匹配工坊才吃满增效与词条；空槽或不匹配 = 裸效率，仍可派。锻造站可选 `selectedToolType`（镐/锤/猎具/锅/镰/瓶架/竿），成品写入 `forgedTools` 队列并进物资；装备时按类型表匹配工坊。T1 可无词条只加速度；T2+ 至少接 `extraOutput`（额外产出）与 `cycleShorten`（缩短时间），常驻被动，不占食物 Buff 栏。

### 2.3 狩猎 `hunting`（采集）

周期结束做 **遇险检定**，不是战斗：无伤害、无回合、无死亡、不接 `classId` 成长。遇险：掉本周期产出、短暂停手 `HUNTING_HAZARD_PAUSE_S`（8s），库存有熟食则再耗 1 份；仍给站 XP。成功出货。猎物按品类：野猪 / 狼 / 鹿（Lv1 / Lv5 / Lv10）。

```ts
type HazardRoll = {
  /** 表驱动失败率 */
  chance: number
  outcome: 'ok' | 'hazard'
}
```

产出：

| `itemId` | 去向 |
| --- | --- |
| `meat` | 烹饪 |
| `blood` | 炼金 |
| `tooth` | 炼金 |
| `eye` | 炼金 |

本版不做制皮，不出皮革，不设 `leatherworking`。

### 2.4 烹饪 `cooking`（制造）

配方消耗鱼 / 肉 / 香料等，产出食物。食物主去向是工人 `foodSlot`，给**生产 Buff**（加速吞吐），不是战斗补给成品（偶遇补给另见第 8 节）。

第 1 档 `meal` 烤鱼（耗鱼）；第 2 档 `roast` 烤肉（耗肉，开局可做）；第 3 档 `stew` 香料炖（肉+香料，或鱼+香料，Lv5）。不换皮。

### 2.5 采药 `herbalism`（采集）

无限稳采：无节点挖空、无空杆、无遇险。周期结束必出货（权重表可调草 / 香料比例，但不允许「什么都不出」）。

| `itemId` | 去向 |
| --- | --- |
| `herb` | 炼金 |
| `spice` | 烹饪 |

### 2.6 炼金 `alchemy`（制造）

一次性消耗：做成即从配方扣光原料，产物进物资。效果（饮用 / 涂装 / 工坊一次性）**本阶段不定**，只留占位 `itemId`（现档 `potion` 可继续当标签）。不在本阶段写 `effectId` 数值。解析口是 `potionEffects` / `potionEffectValue`，恒为空 / 0；药剂不能装 `foodSlot`。

原料走 `ALCHEMY_COST_OPTIONS`：草或猎副产（`blood` / `tooth` / `eye`）任一 1 个即可，优先扣草。旧「耗木出药剂 + 渣滓」已废。

### 2.7 钓鱼 `fishing`（采集）

四条同时成立：

1. **可空杆**：周期仍走完、给站 XP，但本次 `outputs` 可以为空。
2. **期望更慢**：长期期望出货（非空杆次数 × 单次量）低于另外三采集（挖矿 / 狩猎 / 采药）。用更长 `cycleS`（初级 28s / 中级 32s / 高级 36s）加空杆率实现。
3. **随机**：出鱼 / 空杆 / 杂物走权重，不写死每次 1 鱼。空杆仍走完周期并给站 XP。
4. **渔场品阶墙**：`catchTier <= fisheryTier`。初级渔场只出初级，不出更高级。

```ts
type FisheryTier = 'beginner' | 'mid' | 'high' // 与 CategoryId copper / iron / mithril 对齐
type FishingCatch = {
  outcome: 'empty' | 'fish' | 'junk'
  /** 有货时不超过当前渔场品阶 */
  catchTier?: FisheryTier
}

type ItemId /* 钓鱼相关 */ = 'fish' | 'junk'
```

杂物 `junk` 低权，进物资，可在偶遇出手；不是烹饪主料。

---

## 3. 物流

站间仍共用 `save.bank`（字段名沿用，**无容量**，堆再多也不停产）。

```
挖矿 ──矿石──► 锻造 ──工具──► 工人 toolSlot
狩猎 ──肉────► 烹饪 ──食物──► 工人 foodSlot ──► 生产 Buff
狩猎 ──血/牙/眼──► 炼金（占位）
采药 ──草────► 炼金（占位）
采药 ──香料──► 烹饪
钓鱼 ──鱼────► 烹饪
钓鱼 ──杂物──► 物资（低权，可在偶遇出手）
```

制造站缺料 → `stallReason: 'emptyInput'`，现规则不变：先看齐再扣，缺任一不扣。采集站不因库存数量停工。

---

## 4. 共振

`STATION_DEF.neighbors` 两端同时有人即共振。现公式保留：速度 × `RESONANCE_SPEED_MUL`（1.2），每 `RESONANCE_BONUS_EVERY`（4）次吞吐主产物 +1。

定稿邻接（建议，第 1 期改表）：

| 站 | `neighbors` |
| --- | --- |
| `mining` | `forging` |
| `forging` | `mining` |
| `fishing` | `cooking` |
| `hunting` | `cooking` |
| `cooking` | `fishing`, `hunting` |
| `herbalism` | `alchemy` |
| `alchemy` | `herbalism` |

旧邻接作废：`woodcutting` ↔ `alchemy`，`forging` ↔ `alchemy`。

---

## 5. 工人双槽

```ts
type Worker = {
  id: string
  name?: string
  classId?: ClassId
  qualityTier: QualityTier // 1～10
  assignment: StationId | null
  toolSlot: ToolSlot | null
  foodSlot: FoodSlot | null
}

type EffectSource = 'tool' | 'food'
type EffectId = string

type EffectInstance = {
  effectId: EffectId
  value: number
  source: EffectSource
}

type ToolSlot = {
  itemId: ItemId
  /** 匹配此站才吃满增效 / 高阶词条 */
  matchStationId: StationId
  affixes: Affix[]
  effects: EffectInstance[]
}

type Affix = {
  affixId: string
  effectId: EffectId
  value: number
}

type FoodSlot = {
  itemId: ItemId
  /** 槽内未吃完的份数（不含当前正在生效的那一份） */
  qty: number
  /** 同时仅 1 个生产 Buff */
  buff: ProductionBuff
  /** 到期墙钟；到期若 qty>=1 则吃 1 份刷新，否则清空 */
  expiresAt: number
  effects: EffectInstance[]
}

type ProductionBuff = {
  effectId: EffectId
  mul: number
  durationS: number
}
```

品质 `qualityTier` 1～10，色表 `WORKER_QUALITY_TABLE`。抽人默认 1；同档两人合成升一档（消耗两人产出 1 人），满档不可；不同档不允许。合成卸槽回物资、新人休息。职业按新档池随机。品质不改吞吐。

### 5.1 工具槽

- 常驻增效（速度等），不靠倒计时维持。
- 高阶工具可带 `affixes`。
- `matchStationId === assignment` 才吃满；空槽或不匹配 = 裸效率，**仍可派**。
- 卸下回物资；没有工具也能干活。

### 5.2 食物槽

- 只装烹饪产物。UI 选食物与数量，从 `bank` 扣进槽。
- 同时仅 1 个生产 Buff；换食立即覆盖（未吃完的旧食退回 `bank`，按新食物重计 `expiresAt`）。
- 装入时立刻吃 1 份开 Buff，`qty` 是槽内剩余份数。到期若 `qty >= 1`：再吃 1 份刷新同一 Buff；否则槽清空、Buff 消失，工人继续裸效率。
- 同种食物再装是加 `qty`，不重计当前 Buff。

### 5.3 特效叠加

- 特效可来自工具或食物。
- 同 `effectId` 取最强（`value` 较大者），不叠乘。
- 不同 `effectId` 并存。
- 工具词条、食物 Buff、炼金共用同一套 `effectId` 解析；炼金解析口已挂上，本阶段不填数值。

工匠委托留下的整坊 `workshopBuff` 仍是账号级临时乘区，与工人双槽分开；是否并入 `effectId` 后补。

---

## 6. 明确不做

| 项 | 说明 |
| --- | --- |
| 银行与容量停产 | 已去掉；物资无容量，不满仓停产。不恢复。 |
| 锻造武器 | 暂搁置。`weapon` / `ironWeapon` / `mithrilWeapon` 不当新主产物。 |
| 狩猎真战斗 | 只有遇险检定。无伤害、回合、死亡。 |
| 制皮 | 本版不做。无 `leatherworking`，狩猎不出皮。 |

沿用第一期不做：真战斗成长、后端账号、医院那套房间 / 污染 / 病人。

---

## 7. 旧站

`woodcutting` 已废弃：不在 `STATION_DEF` / `PLAYABLE_CHAINS`，工人派站按钮没有伐木。旧档已派伐木的工人 hydrate 撤到休息。

- **`wood`**：旧档数量保留，可在偶遇出手；不再产出。
- **炼金**：耗草或猎副产，不再以木头为原料。
- **制皮**：不做。无 `leatherworking`。
- **银行容量**：不恢复。`hydrateBank` 忽略 `capacity`。

---

## 8. 偶遇补给

敌人「出发」仍是补给门闩，不做战斗。补给**暂改**为食物 / 工具 / 矿等已有物；武器搁置，不再作为新单主需求。具体货单第 3～4 期随工具、食物落地再改表。

---

## 9. 字段速查

给后续 sim 对照，避免另起一套名字。

| 概念 | 稳定名 |
| --- | --- |
| 站类型 | `kind: 'gather' \| 'craft'` |
| 七站 id | `mining` `forging` `hunting` `cooking` `herbalism` `alchemy` `fishing` |
| 锻造别称 | `smithing` 只作文案，不是 id |
| 旧站 | `woodcutting`（废弃） |
| 不做的站 | `leatherworking` |
| 矿 | `ore` `ironOre` `mithrilOre` |
| 渔 | `fish` `junk` |
| 猎 | `meat` `blood` `tooth` `eye` |
| 药 | `herb` `spice` |
| 食 | `meal` `roast` `stew` |
| 工具 | `tool` `ironTool` `mithrilTool` |
| 炼金占位 | `potion` |
| 搁置武器 | `weapon` `ironWeapon` `mithrilWeapon` |
| 旧木 | `wood` |
| 矿节点 | `nodeHp` `nodeHpMax` `recoverAt` |
| 锻失败 | `softFail` |
| 猎遇险 | `hazard` |
| 渔场墙 | `fisheryTier` `catchTier` 空杆 `empty` |
| 工人槽 | `toolSlot` `foodSlot` |
| 工人品质 | `qualityTier` 1～10；表 `WORKER_QUALITY_TABLE` |
| 工人合成 | 同档两人 → 高一档 1 人；满档不可；职业按新档池随机 |
| 工具匹配 | `matchStationId` |
| 工具类型 | `pick` `hammer` `spear` `pot` `sickle` `rack` `rod` |
| 锻造队列 | `forgedTools` `selectedToolType` `craftNotice` |
| 词条 | `affixes[]` `affixId` |
| 特效 | `effectId` `value` `source`；`prodSpeed` `extraOutput` `cycleShorten` |
| 食物 Buff | `buff` `expiresAt` `durationS` `mul` `qty` |
| 停产 | 只留 `emptyInput`；无满仓 |

---

## 10. 与现码差距（第 5 期后）

| 现码 | 仍后补 |
| --- | --- |
| 七站主列；伐木藏入口 / 撤派 | — |
| 挖矿挖空等恢复；可换其它已解锁矿 | — |
| 钓鱼空杆 / 更慢期望 / 渔场品阶墙 | — |
| 狩猎遇险检定（停手 / 减产 / 可耗熟食） | — |
| 采药无限稳采，必出草 / 香料 | — |
| 锻造出工具；软失败掷骰；工具槽匹配才加速 | — |
| 烹饪烤鱼 / 烤肉 / 香料炖；`foodSlot` 续期 / 换食覆盖 | — |
| 工具词条与食物 Buff 同 `effectId` 取最强 | — |
| 炼金耗草 / 猎副产出 `potion`；`potionEffectValue` 恒 0 | 药剂效果数值（饮用 / 涂装 / 工坊一次性） |
| 主界面不再卖货；数量改到各站卡片；`sellFromBank` / `sellAllGoods` 仅调试 / 单测 | — |
| 偶遇货单含烤肉 / 香料炖 / 药剂 | 炼金效果后再调 |
