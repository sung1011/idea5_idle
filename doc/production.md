# 骑士工坊 · 生产定稿

第 0 期只落策划，不改 `src/sim` 玩法。字段名尽量稳定，供第 1～5 期对照实现。已上线骨架（伐木、锻造武器、银行无容量等）与本文不一致时，**以本文为准**；迁移步骤见 [todo.md](todo.md)。总览仍见 [main.md](main.md)，站点等级公式见 [stationProgress.md](stationProgress.md)。

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
| 炼金 | `alchemy` | craft | 一次性消耗（效果未定） | 占位，效果后补 |
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

节点有生命。每次成功吞吐扣 `nodeHp`；`nodeHp <= 0` 后写入 `recoverAt`，恢复完成前该节点不产矿（进度冻结或空转，文案后补）。恢复满后 `nodeHp = nodeHpMax`，`recoverAt = null`。

```ts
type MiningNodeState = {
  categoryId: CategoryId
  nodeHp: number
  nodeHpMax: number
  /** 挖空后恢复完成的墙钟；未空为 null */
  recoverAt: number | null
}
```

产出：`ore` / `ironOre` / `mithrilOre`（沿用现档），只进物资，去向锻造。

### 2.2 锻造 `forging`（制造）

表驱动 `costs`（及可选 `altCosts`）+ **软失败**：周期走完、原料按现规则扣光后做一次失败检定；失败不产出工具（残次物是否入库后补），不炸炉、不停站、不额外扣工人。成功率 / 软失败权重第 3 期再填。

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

每件工具带 `matchStationId`：派在匹配工坊才吃满增效与词条；空槽或不匹配 = 裸效率，仍可派。

### 2.3 狩猎 `hunting`（采集）

周期结束做 **遇险检定**，不是战斗：无伤害、无回合、无死亡、不接 `classId` 成长。失败惩罚（短空转 / 掉本周期产出 / 轻伤后补）第 2 期定；成功出货。

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

沿用 `meal` 作第 1 档食物 id；后续扩档用新 `itemId`，不换皮。

### 2.5 采药 `herbalism`（采集）

无限稳采：无节点挖空、无空杆、无遇险。周期结束必出货（权重表可调草 / 香料比例，但不允许「什么都不出」）。

| `itemId` | 去向 |
| --- | --- |
| `herb` | 炼金 |
| `spice` | 烹饪 |

### 2.6 炼金 `alchemy`（制造）

一次性消耗：做成即从配方扣光原料，产物进物资。效果（饮用 / 涂装 / 工坊一次性）**本阶段不定**，只留占位 `itemId`（现档 `potion` 可继续当标签）。不在本阶段写 `effectId` 数值。

旧「耗木出药剂 + 渣滓」随伐木废弃一并改掉：新原料走草 / 狩猎副产。

### 2.7 钓鱼 `fishing`（采集）

四条同时成立：

1. **可空杆**：周期仍走完、给站 XP，但本次 `outputs` 可以为空。
2. **期望更慢**：长期期望出货（非空杆次数 × 单次量）低于另外三采集（挖矿 / 狩猎 / 采药）。用更长 `cycleS` 和 / 或空杆率实现，第 2 期填表。
3. **随机**：出鱼 / 空杆 / 杂物走权重，不写死每次 1 鱼。
4. **渔场品阶墙**：`catchTier <= fisheryTier`。初级渔场只出初级，不出更高级。

```ts
type FisheryTier = 'beginner' | 'mid' | 'high' // 档名第 2 期可与 CategoryId 对齐
type FishingCatch = {
  outcome: 'empty' | 'fish' | 'junk'
  /** 有货时不超过当前渔场品阶 */
  catchTier?: FisheryTier
}

type ItemId /* 钓鱼相关 */ = 'fish' | 'junk'
```

杂物 `junk` 低权，进物资，可卖；不是烹饪主料。

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
钓鱼 ──杂物──► 物资（低权，可卖）
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
  /** 同时仅 1 个生产 Buff */
  buff: ProductionBuff
  /** 到期墙钟；到期自动从 bank 扣 1 份同 itemId 刷新 */
  expiresAt: number
  effects: EffectInstance[]
}

type ProductionBuff = {
  effectId: EffectId
  mul: number
  durationS: number
}
```

### 5.1 工具槽

- 常驻增效（速度等），不靠倒计时维持。
- 高阶工具可带 `affixes`。
- `matchStationId === assignment` 才吃满；空槽或不匹配 = 裸效率，**仍可派**。
- 卸下回物资；没有工具也能干活。

### 5.2 食物槽

- 只装烹饪产物。
- 同时仅 1 个生产 Buff；换食立即覆盖（旧 Buff 丢掉，按新食物重计 `expiresAt`）。
- 到期且 `bank[itemId] >= 1`：自动扣 1 份，刷新同一 Buff；库存不够则槽清空、Buff 消失，工人继续裸效率。

### 5.3 特效叠加

- 特效可来自工具或食物。
- 同 `effectId` 取最强（`value` 较大者），不叠乘。
- 不同 `effectId` 并存。
- 工具词条、食物 Buff、（后补）炼金共用同一套 `effectId` 解析；炼金效果本阶段不定，只预留解析口。

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

现码仍有 `woodcutting`（伐木产 `wood`，主界面可玩，邻接炼金；铁 / 秘银锻 `costs` 带木；炼金耗木）。

定稿：

- **废弃**：不当七站，新档不作为可玩目标。
- **藏入口**：落地时移出 `PLAYABLE_CHAINS` / 工人派站按钮；旧档已派伐木的工人 hydrate 撤到休息。
- **`wood`**：旧档数量保留，可卖；不再产出。高阶锻木辅料随武器线搁置，工具配方后补。
- **炼金**：不再以木头为原料。

迁移步骤只写在 [todo.md](todo.md) 第 1 期，本期不改代码。

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
| 食 | `meal`（第 1 档） |
| 工具 | `tool` `ironTool` `mithrilTool` |
| 炼金占位 | `potion` |
| 搁置武器 | `weapon` `ironWeapon` `mithrilWeapon` |
| 旧木 | `wood` |
| 矿节点 | `nodeHp` `nodeHpMax` `recoverAt` |
| 锻失败 | `softFail` |
| 猎遇险 | `hazard` |
| 渔场墙 | `fisheryTier` `catchTier` 空杆 `empty` |
| 工人槽 | `toolSlot` `foodSlot` |
| 工具匹配 | `matchStationId` |
| 词条 | `affixes[]` `affixId` |
| 特效 | `effectId` `value` `source` |
| 食物 Buff | `buff` `expiresAt` `durationS` `mul` |
| 停产 | 只留 `emptyInput`；无满仓 |

---

## 10. 与现码差距（第 1 期后）

| 现码（第 1 期） | 定稿仍待 2～4 期 |
| --- | --- |
| 七站已入表；伐木藏入口 / 撤派 | — |
| 矿节点 `nodeHp` 字段已占位 | 挖空等恢复 |
| 渔场掉落表含空杆权重 | 空杆结算 + 更慢期望 + 品阶墙 |
| 猎物遇险率表已占位 | 遇险检定 |
| 锻造出工具；软失败权重占位 | 软失败掷骰；工具槽生效 |
| 烹饪仍只耗鱼出 `meal` | `meal` 进 `foodSlot` 给生产 Buff |
| Worker 有 `toolSlot` / `foodSlot`（默认空） | 装槽 / 续期 / 取最强 |
| 炼金耗草出 `potion` 占位 | 效果解析 |
| 偶遇新单改食物 / 工具 / 矿 | 随工具产量再调货单 |
