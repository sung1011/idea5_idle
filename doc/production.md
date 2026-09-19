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
| 锻造 | `forging` | craft | 配方 + 软失败 | 各站专属工具 → 工坊下拉（武器线搁置） |
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

UI 主列七站，工坊页左侧七站竖签（采矿 / 锻造 / 狩猎 / 烹饪 / 采药 / 炼金 / 钓鱼），切签只显示该站一张卡。`woodcutting` 废弃或藏入口，见第 7 节。

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

产出**只**是各站专属工具（`STATION_TOOL_DEF` 的 tool01–20）。已删除铜/铁/秘银通用 `tool` / `ironTool` / `mithrilTool` 配方。先选 `selectedToolType`（对应目标站），再选 `selectedForgeToolId`；造的解锁看锻造站 `min(20, forgeStation.level)`，未解锁不能造。目标站等级不挡造。工坊站卡用下拉选 `selectedToolId` 来用（使用解锁仍按目标站每 5 级）。武器线搁置，本阶段不当锻造主产物。旧通用工具 id 仍可存在于旧档 / 偶遇，不再产出。

```ts
type SoftFailRoll = {
  chance: number
  outcome: 'ok' | 'softFail'
}
```

锻造制造列表来自 `STATION_TOOL_DEF`（采矿 / 锻造 / 狩猎 / 烹饪 / 采药 / 炼金 / 钓鱼各 20 种，名称可占位）。造的解锁 `min(20, 锻造站 stationLevel)`：锻造 Lv1 可造各站工具1，Lv5 可造到工具5。目标站等级不挡造。下拉只列出已解锁 + 下一档预览置灰。占位配方：1–5 铜矿 32s / XP1 / 软失败 10%（第 1 种可用渣滓）；6–10 铁矿 36s / XP2 / 15%；11–20 秘银矿 40s / XP3 / 20%。

用具下拉首项「无」。已解锁全列可选，未开启只留下一档置灰预览，更后面的未开档不列出。未解锁即使有库存也不可选。选中那一把：`speed × (1 + 序号 × 0.03)`，只生效一把；每次成功吞吐耗 1，「无」不耗，耗尽回「无」。没选 = 裸效率，仍可派。旧档 `tool` / `ironTool` / `mithrilTool` 与工人 / 站上 `toolSlot` / `toolId` hydrate：一律回物资，不自动选中。

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
挖矿 ──矿石──► 锻造 ──各站专属工具──► 工坊 selectedToolId
狩猎 ──肉────► 烹饪 ──食物──► 工人 foodSlot ──► 生产 Buff
狩猎 ──血/牙/眼──► 炼金（占位）
采药 ──草────► 炼金（占位）
采药 ──香料──► 烹饪
钓鱼 ──鱼────► 烹饪
钓鱼 ──杂物──► 物资（低权，可在偶遇出手）
```

制造站缺料 → `stallReason: 'emptyInput'`，现规则不变：先看齐再扣，缺任一不扣。采集站不因库存数量停工。

---

## 4. 共振（已废）

相邻站同时有人不再加速、也不额外掉主产物。`STATION_DEF.neighbors` 已清空，结算不读。旧档 `resonanceStreak` 仍 hydrate，不参与吞吐。不要加回。

---

## 4.1 同站两人冲突

某站 `assignment` 正好 2 人 → 该站生产速度在人数 / 工具 / 食物等之后再乘 `stationConflictMul(save, stationId)`：

| 科技 | 倍率 |
| --- | --- |
| 未研究 | ×0.5 |
| 解锁「工坊规章」`workshopRules` | ×0.75 |
| 再解锁「工匠密录」`artisanArchive` | ×1.0（消除冲突） |

1 人或 0 人无冲突。站卡满 2 人且倍率小于 1 时显示「冲突：效率 −50% / −25%」；倍率 = 1 不显示。不做随机吵架、拆队；冲突本身不掉血。工坊成功产出掉血与休息回血见 [main.md](main.md) 第 2.2 / 3 / 6.2 节，不影响战斗出手。

---

## 5. 工人双槽

```ts
type Worker = {
  id: string
  name?: string
  classId?: ClassId
  qualityTier: QualityTier // 1～10
  assignment: StationId | null // 每站最多 2 人
  foodSlot: FoodSlot | null
  combatAttrs: CombatAttrId[] // 白 0 / 绿蓝青 1 / 紫+ 2；同人不重复
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

品质 `qualityTier` 1～10，色表 `WORKER_QUALITY_TABLE`（白绿蓝青紫橙粉红金彩，无灰）。抽人默认白档 1；**同一工坊**同档两人可在工坊站卡合并升一档（消耗两人产出 1 人），满档不可；不同档 / 不同站 / 不满 2 人不允许。合并时工人食物回物资、站上工具留下、新人留在原站。职业按新档池随机。品质不改吞吐。克制属性随品质开槽，合成保留已有、只补新槽。旧灰表存档靠 `workerQualityRev` 迁一次。每站最多 2 人（`STATION_WORKER_CAP`）。偶遇敌人弱点与揭示见 [main.md](main.md) 6.2。

### 5.1 工坊工具下拉

- 记在 `StationState.selectedToolId`，工坊站卡自定义下拉 `src/ui/uiSelect.vue`（首项「无」），不跟工人走，没有装备/换装/卸下。
- 每站 20 种专属工具，表驱动；解锁 `floor(stationLevel/5)`，上限 20。
- 选项：已解锁全列 + 下一档置灰预览，更后面的未开档不列出。
- 选中那一把：`1 + 序号 × 3%` 速度乘区，只生效一把。每次成功吞吐耗 1；「无」不耗；耗尽回「无」。
- 未解锁即使有库存也不可选。没选 = 裸效率，**仍可派**。
- 旧档工人 / 站上 `toolSlot` / `toolId`：一律回物资。工人页没有工具装配。

### 5.2 食物槽

- 只装烹饪产物。UI 选食物与数量，从 `bank` 扣进槽。
- 同时仅 1 个生产 Buff；换食立即覆盖（未吃完的旧食退回 `bank`，按新食物重计 `expiresAt`）。
- 装入时立刻吃 1 份开 Buff，`qty` 是槽内剩余份数。到期若 `qty >= 1`：再吃 1 份刷新同一 Buff；否则槽清空、Buff 消失，工人继续裸效率。工人页可手动吃 1：槽内 `qty >= 1` 时扣 1 份，立刻按当前食物重计 `expiresAt` / 刷新同一 Buff，不回血。
- 同种食物再装是加 `qty`，不重计当前 Buff。

### 5.3 特效叠加

- 站工具只走速度乘区，不占 `effectId`。
- 食物特效同 `effectId` 取最强（`value` 较大者），不叠乘。
- 不同 `effectId` 并存。
- 食物 Buff、炼金共用同一套 `effectId` 解析；炼金解析口已挂上，本阶段不填数值。

工匠委托留下的整坊 `workshopBuff` 仍是账号级临时乘区，与工人双槽分开；是否并入 `effectId` 后补。

---

## 6. 明确不做

| 项 | 说明 |
| --- | --- |
| 银行与容量停产 | 已去掉；物资无容量，不满仓停产。不恢复。 |
| 锻造武器 | 暂搁置。`weapon` / `ironWeapon` / `mithrilWeapon` 不当新主产物。 |
| 狩猎真战斗 | 只有遇险检定。无伤害、回合、死亡。 |
| 制皮 | 本版不做。无 `leatherworking`，狩猎不出皮。 |

沿用第一期不做：战斗成长树、后端账号、医院那套房间 / 污染 / 病人。偶遇敌人已有时间轴战斗（见 [main.md](main.md) 6.2），狩猎仍只做遇险检定。

---

## 7. 旧站

`woodcutting` 已废弃：不在 `STATION_DEF` / `PLAYABLE_CHAINS`，工人派站按钮没有伐木。旧档已派伐木的工人 hydrate 撤到休息。

- **`wood`**：旧档数量保留，可在偶遇出手；不再产出。
- **炼金**：耗草或猎副产，不再以木头为原料。
- **制皮**：不做。无 `leatherworking`。
- **银行容量**：不恢复。`hydrateBank` 忽略 `capacity`。

---

## 8. 偶遇补给

敌人开战仍是补给门闩。新刷出的交物单（敌人 / 委托 / 收购 / 路人消耗 / 当铺 / 黑心购买）只要求 1 种已有产物，数量随品质与章节递增；Boss 只加数量。要工具时从锻造可造的各站专属工具（`STATION_TOOL_DEF` 的 tool01–20）抽取，档位随章节 / 订单品质抬高（低章偏低档，如第 1 章常见采矿工具1）。新刷不再要 `tool` / `ironTool` / `mithrilTool`。旧档通用工具库存可留。武器搁置，不再作为新单主需求。

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
| 工具 | 锻造 / 新订单用专属 `miningTool01`… 每站 20 种；旧档通用 `tool` `ironTool` `mithrilTool` 可留、不再产出或新刷要 |
| 炼金占位 | `potion` |
| 搁置武器 | `weapon` `ironWeapon` `mithrilWeapon` |
| 旧木 | `wood` |
| 矿节点 | `nodeHp` `nodeHpMax` `recoverAt` |
| 锻失败 | `softFail` |
| 猎遇险 | `hazard` |
| 渔场墙 | `fisheryTier` `catchTier` 空杆 `empty` |
| 工人槽 | `foodSlot`（工具已改挂站） |
| 站工具 | `StationState.selectedToolId` |
| 派驻上限 | `STATION_WORKER_CAP = 2` |
| 工人品质 | `qualityTier` 1～10；表 `WORKER_QUALITY_TABLE`（白绿蓝青紫橙粉红金彩）；`workerQualityRev` |
| 工人合成 | 同档两人 → 高一档 1 人；满档不可；职业按新档池随机 |
| 工具匹配 | `matchStationId` |
| 工具类型 | `pick` `hammer` `spear` `pot` `sickle` `rack` `rod` |
| 锻造队列 | `forgedTools` `selectedToolType` `craftNotice` |
| 词条 | `affixes[]` `affixId` |
| 特效 | `effectId` `value` `source`；`prodSpeed` `extraOutput` `cycleShorten` |
| 食物 Buff | `buff` `expiresAt` `durationS` `mul` `qty` |
| 停产 | 只留 `emptyInput`；无满仓 |
| 骑士等级 | `knightLevel`：`1 + sum(可玩站 stationLevel - 1)`，初始 1；每升 1 级 +1 灵感 |
| 灵感 | `techPoints`（界面称灵感；别名 `inspiration` 仅 hydrate）。新档 20；骑士升级 +1；周期完成不加；图纸不当来源。旧档不改写成 20 |
| 工坊金币 | 吞吐按产出 `craftGold × 数量`；成品约 1～3，采集原材 0 或 1。当铺 / 收购仍用 `sellGold`。敌人战利品绿档基准 `LOOT_GOLD_BASE = 6` |
| 科技树 | `unlockedTechIds` + `techLevels`：三页签行选，每层同行同价；节点有 `maxLevel`，未满级可再点。该层任一点 `level≥1` 开上一层。已实装先 `maxLevel=1`，占位 `5`。订单格按等级 +1 封顶 6；不新开冲突多级线。旧未知 id 丢掉。`techEffectValue(save, effectId)` 按等级 × 表值叠乘（渣滓 / 站 XP / 采矿 / 工具 / 锻造耗时 / 离线 / 工人三围 / 弱点 / 揭示 / 再战补给 / 助战下限 / 当铺收购金 / 探索费 / 战利品金）。抽人费与站速度乘区仍不受科技影响 |

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
| 烹饪烤鱼 / 烤肉 / 香料炖；`foodSlot` 续期 / 换食覆盖 / 可手动吃 1 | — |
| 工具词条与食物 Buff 同 `effectId` 取最强 | — |
| 炼金耗草 / 猎副产出 `potion`；`potionEffectValue` 恒 0 | 药剂效果数值（饮用 / 涂装 / 工坊一次性） |
| 主界面不再卖货；制造站卡片只列当前消耗库存；产出用工坊站卡本地「获得」漂字（带 `stationId`，不走全局 `floatTips`）；`sellFromBank` / `sellAllGoods` 仅调试 / 单测 | — |
| 偶遇货单含烤肉 / 香料炖 / 药剂 | 炼金效果后再调 |
