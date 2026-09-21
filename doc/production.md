# 骑士工坊 · 生产定稿

字段名尽量稳定，供实现对照。第 1～5 期已按本文落地；与旧档不一致时以本文 + hydrate 为准。总览仍见 [main.md](main.md)，站点等级公式见 [stationProgress.md](stationProgress.md)，分阶段见 [todo.md](todo.md)。

---

## 0. 范围

- **本期做**：本文 + `main` / `todo`（及 README 指针）对齐。
- **本期不做**：第 1～5 期代码；不改生产公式、不换工坊表、不改工人存档形状。
- **定名**：现玩法六站英文 id 用下表；铭刻只用 `inscription`（`forging` / `smithing` / `engraving` 是别称，不另开 id）。钓鱼已废弃。站工具玩法已撤。

---

## 1. 六工坊

`StationKind = 'gather' | 'craft'`。采集三站各有一条核心差异；制造三站走配方。

| 站 | `stationId` | `kind` | 核心差异 | 产出 → 去向 |
| --- | --- | --- | --- | --- |
| 挖矿 | `mining` | gather | 节点生命，挖空等恢复 | 矿石 → 订单 / 金币；荒晶 → 铭刻 |
| 铭刻 | `inscription` | craft | 配方 + 软失败 | 荒晶 → 一次性符文 → 开战装槽 |
| 狩猎 | `hunting` | gather | 遇险检定（非战斗） | 肉 / 鱼 → 烹饪；血 / 牙 / 眼 → 炼金；杂物低权 |
| 烹饪 | `cooking` | craft | 产出食物 | 食物 → 工人 `foodSlot` → 回血 |
| 采药 | `herbalism` | gather | 无限稳采 | 草 → 炼金；香料 → 烹饪 |
| 炼金 | `alchemy` | craft | 一次性消耗草 / 猎副产 | 7 种药剂随机批次 → 工人页 4 槽短按点用 |

```ts
type StationId =
  | 'mining'
  | 'inscription'
  | 'hunting'
  | 'cooking'
  | 'herbalism'
  | 'alchemy'

/** 旧站。仍可能出现在旧档，不当现玩法站。 */
type DeprecatedStationId = 'woodcutting' | 'fishing'
```

UI 主列六站。工坊页左侧三组竖签（药剂=采药+炼金，食物=狩猎+烹饪，符文=采矿+铭刻；组 id 仍是 `weapon`），切组同时显示该组两张站卡；工人页左栏仍按站分行，上→下与工坊组一致：采药→炼金→狩猎→烹饪→采矿→铭刻（`STATION_ORDER` 共用，派入空槽扫描同序）。工人左栏仍按 7 行均分，去掉钓鱼后不把剩余 6 站拉高。`woodcutting` / `fishing` 废弃或藏入口，见第 7 节。站卡底部撤出 / 派入同款大号（仅文案与点击不同，无人在岗时撤出置灰）；右上角「？」打开该站说明，文案表在 `src/ui/stationHelp.ts`，各站末尾附「在岗体力影响效率：正常 100%，残血 80%，空血 50%。残血会自动吃熟食；药剂点槽给在岗救急。」。进度行写「效率 N%」（空岗 100%，两人取更低乘区）。账号首次在岗效率跌破 100% 漂一次并记 `workshopHpEfficiencyTipShown`。

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

产出：`ore` / `ironOre` / `mithrilOre`（沿用现档）+ 同档双掉 `wildCrystal` 荒晶。矿石只进物资，去向订单 / 当铺金币（铜矿 `craftGold` 仍是 0，采矿金币中性）。荒晶是铭刻唯一原料，不进主线新单池。

### 2.2 铭刻 `inscription`（制造）

表驱动 `RUNE_DEF` + **软失败**：周期走完后做一次失败检定。成功从已解锁且付得起的配方里随机一种，扣荒晶并出一批符文（`batch` 区间 + 科技额外产出）。失败扣部分荒晶（`INSCRIPTION_SOFT_FAIL_TAKE_RATIO` 0.5，不足 1 按 1），无成品，给少量 XP（`xpPerCycle * 0.5`，至少 1）。不炸炉、不停站、不额外扣工人。成功率 `INSCRIPTION_SOFT_FAIL_CHANCE`（0.1）。旧名 `forging` / `completeForgingCycle` 只作文案与兼容导出。

产出**只**是一次性战斗符文（`runeSharp` 锋锐 / `runeArmor` 厚甲 / `runeBlood` 血酬 / `runeBreak` 破障 / `runeSwift` 迅击 / `runeInsight` 洞悉）。解锁看铭刻站等级：Lv1 锋锐+厚甲（荒晶×2，批次 1–2，XP1）；Lv5 血酬+破障（荒晶×3，批次 1–2，XP2）；Lv10 迅击+洞悉（荒晶×4，批次 1，XP3）。周期 32s。没有 20 档工具下拉，不按吞吐耗工具，`selectedToolId` 恒空。武器线仍搁置。

```ts
type SoftFailRoll = {
  chance: number
  outcome: 'ok' | 'softFail'
}

type RuneItemId =
  | 'runeSharp'
  | 'runeArmor'
  | 'runeBlood'
  | 'runeBreak'
  | 'runeSwift'
  | 'runeInsight'
```

符文进 `bank` 堆叠。出战 / 增援每人 **1 空槽**：点槽出弹层列全部种类 + 库存 + 短效果；开战扣选中的符文，效果只打携带者、只本场。助战同一套槽。洞悉多名携带只揭示一次。战后清槽。旧档 `*ToolNN` / 通用 `tool` `ironTool` `mithrilTool` / `forgedTools` hydrate 转荒晶（专属/初级×2、中阶×3、秘银×4），每满 4 件再给起步锋锐，半额厚甲；清空 `selectedToolId` / `selectedForgeToolId` / `selectedToolType` / `forgedTools`。

| id | 名 | 本场效果 |
| --- | --- | --- |
| `runeSharp` | 锋锐 | 造成伤害 ×1.25 |
| `runeArmor` | 厚甲 | 受到伤害 ×0.75 |
| `runeBlood` | 血酬 | 战后该工人额外战斗 XP（胜负都发，`RUNE_BLOOD_XP`=8） |
| `runeBreak` | 破障 | 命中弱点额外扣 1 盾 |
| `runeSwift` | 迅击 | 出手间隔 ×0.85 |
| `runeInsight` | 洞悉 | 开战多揭示 1 条弱点（全场一次） |

### 2.3 狩猎 `hunting`（采集）

周期结束做 **遇险检定**，不是战斗：无回合、无死亡、不接 `classId` 成长。遇险：掉本周期产出、短暂停手 `HUNTING_HAZARD_PAUSE_S`（8s），库存有熟食则再耗 1 份；仍给站 XP；扣血接到劳损（轻债）。成功出货并记基准劳损。猎物按品类：野猪 / 狼 / 鹿（Lv1 / Lv5 / Lv10）。**狩猎真战斗 TODO，本轮不做。**

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
| `fish` | 烹饪（原钓鱼主产物并入） |
| `junk` | 物资低权（原钓鱼杂物并入） |
| `blood` | 炼金 |
| `tooth` | 炼金 |
| `eye` | 炼金 |

本版不做制皮，不出皮革，不设 `leatherworking`。

### 2.4 烹饪 `cooking`（制造）

配方消耗鱼 / 肉 / 香料等，产出食物。食物主去向是工人 `foodSlot`，主职是**回血**（meal 25% / roast 40% / stew 55% hpMax，向上取整，至少 HP>1）。生产加速压到很弱（熟食 ×1.02 / 炖 ×1.03，烤肉不再额外产），以免和药剂加速抢效率。残血（hp/hpMax ≤30%）自动吃 1：工坊在岗产出扣血后检查，主线战斗结算后也按残血检查，不要只用空血。偶遇补给另见第 8 节。

第 1 档 `meal` 烤鱼（耗鱼）；第 2 档 `roast` 烤肉（耗肉，开局可做）；第 3 档 `stew` 香料炖（肉+香料，或鱼+香料，Lv5）。不换皮。

### 2.5 采药 `herbalism`（采集）

无限稳采：无节点挖空、无空杆、无遇险。周期结束必出货（权重表可调草 / 香料比例，但不允许「什么都不出」）。

| `itemId` | 去向 |
| --- | --- |
| `herb` | 炼金 |
| `spice` | 烹饪 |

### 2.6 炼金 `alchemy`（制造）

一次性消耗：做成即从配方扣光原料。每次成功从 7 种药剂池随机一种，按 `POTION_BATCH_RANGE` 给一批进物资（初级药膏 8–14、兴奋剂 4–8、续命汤 5–10、绝境膏 4–8、护命符药 2–5、凝神剂 3–6、醒神散 3–6）。工人、工具、站 XP 仍按原站规则。药剂不能装 `foodSlot`，必须装进账号 `potionSlots`（4 槽）后点槽使用，无 CD；只打六站在岗，战斗中 / 休息 / 助战不吃，无人在岗不扣瓶并漂「没有在岗工人可用药」。装配面板只写名字和数量，右上角「？」看效果。`potionEffectValue` 仍恒 0；效率 / 额外产出改走 `potionBuffs`（兴奋剂、凝神剂）。旧档通用 `potion` hydrate 成 `salve`；旧档 `warDrum` 槽清空。醒神散：在岗残血抬到 40% hpMax，非残血立刻 +10% hpMax，不清劳损。

原料走 `ALCHEMY_COST_OPTIONS`：草或猎副产（`blood` / `tooth` / `eye`）任一 1 个即可，优先扣草。旧「耗木出药剂 + 渣滓」已废。

### 2.7 钓鱼 `fishing`（已废）

钓鱼站已撤。旧档已派钓鱼的工人 hydrate 撤到休息，站状态丢弃。`fish` / `junk` 改由狩猎产出。工具类型 `rod` 与钓鱼专属工具不再产出。

---

## 3. 物流

站间仍共用 `save.bank`（字段名沿用，**无容量**，堆再多也不停产）。

```
挖矿 ──矿石──► 订单 / 金币
挖矿 ──荒晶──► 铭刻 ──符文──► 开战 1 槽（消耗；铭刻未开则槽置灰，点出骑士门槛）
狩猎 ──肉/鱼──► 烹饪 ──食物──► 工人 foodSlot ──► 回血
狩猎 ──血/牙/眼──► 炼金（药剂）
狩猎 ──杂物──► 物资（低权，可在偶遇出手）
采药 ──草────► 炼金（药剂）
采药 ──香料──► 烹饪
工人页 `potionSlots[4]` ──装配后点槽使用（无 CD；点？看效果）
```

制造站缺料 → `stallReason: 'emptyInput'`，现规则不变：先看齐再扣，缺任一不扣。采集站不因库存数量停工。

---

## 4. 共振（已废）

相邻站同时有人不再加速、也不额外掉主产物。`STATION_DEF.neighbors` 已清空，结算不读。旧档 `resonanceStreak` 仍 hydrate，不参与吞吐。不要加回。

---

## 4.1 同站两人冲突

某站 `assignment` 正好 2 人 → 该站生产速度在人数 / 食物等之后再乘 `stationConflictMul(save, stationId)`：

| 科技 | 倍率 |
| --- | --- |
| 未研究 | ×0.7 |
| 解锁「工坊规章」`workshopRules` | ×0.85 |
| 再解锁「工匠密录」`artisanArchive` | ×1.0（消除冲突） |

1 人或 0 人无冲突。站卡满 2 人且倍率小于 1 时显示「冲突：效率 −30% / −15%」；倍率 = 1 不显示。不做随机吵架、拆队；冲突本身不掉血。工坊劳损 / 残血 / 药剂时效 / 休息回血见 [main.md](main.md) 第 2.2 / 3 / 6.2 节。主线敌人出手可打在岗工人（与出战共用 `hp`，工坊锁 1；休息中不进池），选目标规则见 main 6.2。不做跨站 combo。

### 4.2 劳损与药剂

成功产出才加劳损：`fatigueDebt += (hpMax * 0.0015 + nearFullPip) * stationMul * comboMul`。`nearFullPip` 仅近满血（`hp >= hpMax-1`）加 `0.18`。`debt≥1` 扣 `floor` 血并减债。HP 锁 1。`stationMul` 约 0.4（铭刻成功 0.55）。血线三档（`hp/hpMax`）：≤1% 空血 ×0.5，≤30% 残血 ×0.8，＞30% 正常 ×1。站卡进度行写「效率 N%」（两人取更低）。工人界面底色读 `hp - fatigueDebt`。已删除站狂暴、战鼓药与站工具。工人页 4 槽短按点用 7 种药剂（兴奋剂加速、护命挡劳损/战斗伤、凝神下一次 +1 等），时效按 `elapsedS`。连招只站内，见 [main.md](main.md) 2.2。

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
  fatigueDebt: number
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

品质 `qualityTier` 1～10，色表 `WORKER_QUALITY_TABLE`（白绿蓝青紫橙粉红金彩，无灰）。抽人默认白档 1；**同一工坊**同档两人可在工坊站卡合并升一档（消耗两人产出 1 人），满档不可；不同档 / 不同站 / 不满 2 人不允许。工人页也可把休息或在岗工人拖到同品质有人槽直接合成。未合过且当前可拖合时工作区顶出「拖到同品质工人上可合成」，成功合成一次后记 `fuseDragTipDone` 不再出。合并时工人食物回物资、新人留在原站。职业按新档池随机。品质不改吞吐。克制属性随品质开槽，合成保留已有、只补新槽。旧灰表存档靠 `workerQualityRev` 迁一次。每站最多 2 人（`STATION_WORKER_CAP`）。偶遇敌人弱点、揭示与破防盾见 [main.md](main.md) 6.2。

### 5.1 站工具（已撤）

不再有 20 档工具下拉、不按吞吐耗工具、不按工具加速。`selectStationTool` / 列表 API 失败「工具系统已撤」；速度乘区恒 1。旧档 `selectedToolId` / `toolSlot` / `*ToolNN` / 通用工具 hydrate 转荒晶（及起步符文），不回装。工人页没有工具装配。战斗一次性符文见 2.2，不占工人存档槽。

### 5.2 食物槽

- 只装烹饪产物。UI 选食物与数量，从 `bank` 扣进槽。
- 同时仅 1 个生产 Buff；换食立即覆盖（未吃完的旧食退回 `bank`，按新食物重计 `expiresAt`）。
- 装入时立刻吃 1 份开很弱的生产 Buff，`qty` 是槽内剩余份数。到期若 `qty >= 1`：再吃 1 份刷新同一 Buff；否则槽清空。工人页只留装槽 / 换食 / 卸下，**不提供**「吃 1 / 手动喂」。回血只靠残血自动吃。
- 同种食物再装是加 `qty`，不重计当前 Buff。
- 残血（`hp/hpMax ≤30%`）且 `qty>=1` 自动吃 1 回血：① 工坊在岗产出扣血后检查；② 主线等战斗结算后（含工坊在岗被打到残血）。空血（≤1%）也算残血。

### 5.3 特效叠加

- 站工具已撤，不再占速度乘区或 `effectId`。
- 食物特效同 `effectId` 取最强（`value` 较大者），不叠乘。
- 不同 `effectId` 并存。
- 食物 Buff、炼金共用同一套 `effectId` 解析；药剂 `potionEffectValue` 仍为 0，效率改走 `potionBuffs`。

工匠委托留下的整坊 `workshopBuff` 仍是账号级临时乘区，与工人双槽分开；是否并入 `effectId` 后补。

---

## 6. 明确不做

| 项 | 说明 |
| --- | --- |
| 银行与容量停产 | 已去掉；物资无容量，不满仓停产。不恢复。 |
| 锻造武器 | 暂搁置。`weapon` / `ironWeapon` / `mithrilWeapon` 不当新主产物。 |
| 站工具玩法 | 已撤。不再造 / 选 / 耗 `*ToolNN`，不恢复 20 档下拉。 |
| 狩猎真战斗 | 只有遇险检定。现遇险扣血接到劳损。真战斗 TODO 本轮不做。 |
| 跨站 combo | 劳损连招只站内。 |
| 制皮 | 本版不做。无 `leatherworking`，狩猎不出皮。 |

沿用第一期不做：战斗成长树、后端账号、医院那套房间 / 污染 / 病人。偶遇敌人已有时间轴战斗（见 [main.md](main.md) 6.2），狩猎仍只做遇险检定（真战斗 TODO）。

---

## 7. 旧站

`woodcutting`、`fishing` 已废弃：不在 `STATION_DEF` / `PLAYABLE_CHAINS`，工人派站按钮没有这两站。旧档已派伐木 / 钓鱼的工人 hydrate 撤到休息。

- **`wood`**：旧档数量保留，可在偶遇出手；不再产出。
- **炼金**：耗草或猎副产，不再以木头为原料。
- **制皮**：不做。无 `leatherworking`。
- **银行容量**：不恢复。`hydrateBank` 忽略 `capacity`。

---

## 8. 偶遇补给

敌人开战仍是补给门闩。新刷出的交物单（敌人补给 / 委托 / 收购 / 路人消耗 / 当铺）只要求 1 种已解锁工位的产物，种类跟骑士开站表（1 采药草/香料 → 2 炼金七药 → 5 狩猎 → 6 烹饪 → 9 采矿矿石 → 10 铭刻符文），不跟章节号；数量仍随品质与章节递增；Boss 只加数量。只开采药时只要草/香料；开局商场「铜矿当」仍是 `ore` ×2 特例（采矿要骑士 9 才开）。荒晶不进新单池。铭刻已开后订单可要 6 种符文（`MAIN_NEED_TOOL_POOL` = `RUNE_ITEM_IDS`）；旧档 `tool` / `*ToolNN` 读档 remap 成符文。裸 `potion` → `salve`。`itemProducerStation` 对旧通用工具回落铭刻以便跳转。市集新报价不再发裸 `tool`。武器搁置，不再作为新单主需求。地牢开战另耗一套苛刻补给（草 ×12、香料 ×6、熟食 ×4、初级药膏 ×3），不走战场格、不被探索刷新；游戏日切强制刷新、按当前主线章锁定缩放并先自动发未领宝箱。详见 [main.md](main.md) 6.5。

---

## 9. 字段速查

给后续 sim 对照，避免另起一套名字。

| 概念 | 稳定名 |
| --- | --- |
| 站类型 | `kind: 'gather' \| 'craft'` |
| 六站 id | `mining` `inscription` `hunting` `cooking` `herbalism` `alchemy` |
| 铭刻别称 | `forging` / `smithing` / `engraving` 只作文案 / hydrate，不是独立 id |
| 旧站 | `woodcutting` `fishing`（废弃） |
| 工人药剂槽 | `potionSlots` 长度 4，hydrate `[null,null,null,null]` |
| 不做的站 | `leatherworking` |
| 矿 | `ore` `ironOre` `mithrilOre` |
| 渔 | `fish` `junk` |
| 猎 | `meat` `blood` `tooth` `eye` |
| 药 | `herb` `spice` |
| 食 | `meal` `roast` `stew` |
| 荒晶 | `wildCrystal`：采矿双掉，铭刻原料；不进主线新单池 |
| 符文 | `runeSharp` `runeArmor` `runeBlood` `runeBreak` `runeSwift` `runeInsight`；开战 1 槽消耗 |
| 旧工具 | 专属 `*ToolNN` / 通用 `tool` `ironTool` `mithrilTool` 不再产出或新刷要；读档转荒晶 + 起步符文，订单 remap 成符文 |
| 炼金药剂 | `stim` `salve` `renewSoup` `brinkSalve` `wardElixir` `focusDraft` `clearMind`；旧 `potion` hydrate→`salve`；旧 `warDrum` 槽清空 |
| 工人劳损 | `Worker.fatigueDebt` |
| 药剂槽 / 时效 | `potionSlots` `potionBuffs`（`elapsedS`） |
| 站连招 | `fatigueCombo`（streak / key / frustration / fog） |
| 搁置武器 | `weapon` `ironWeapon` `mithrilWeapon` |
| 旧木 | `wood` |
| 矿节点 | `nodeHp` `nodeHpMax` `recoverAt` |
| 铭刻失败 | `softFail` |
| 猎遇险 | `hazard` |
| 渔场墙 | 已废；鱼/杂物走狩猎 |
| 工人槽 | `foodSlot`（站工具已撤） |
| 站工具 | 已撤；旧 `selectedToolId` hydrate 清空 |
| 派驻上限 | `STATION_WORKER_CAP = 2` |
| 工人品质 | `qualityTier` 1～10；表 `WORKER_QUALITY_TABLE`（白绿蓝青紫橙粉红金彩）；`workerQualityRev` |
| 工人合成 | 同档两人 → 高一档 1 人；满档不可；职业按新档池随机；战斗 XP 相加后按曲线连升 |
| 工具匹配 | 已废；旧 `matchStationId` 只 hydrate |
| 工具类型 | 已废；旧 `pick` `hammer`… 只 hydrate |
| 铭刻提示 | `craftNotice`；旧 `forgedTools` / `selectedToolType` 读档清空 |
| 词条 | `affixes[]` `affixId` |
| 特效 | `effectId` `value` `source`；`prodSpeed` `extraOutput` `cycleShorten` |
| 食物 Buff | `buff` `expiresAt` `durationS` `mul` `qty` |
| 停产 | 只留 `emptyInput`；无满仓 |
| 骑士等级 | `knightLevel`：`1 + sum(可玩站 stationLevel - 1)`，初始 1；每升 1 级 +1 灵感。站入口门槛：采药 1、炼金 2、狩猎 5、烹饪 6、采矿 9、铭刻 10 |
| 灵感 | `techPoints`（界面称灵感；别名 `inspiration` 仅 hydrate）。新档 20；骑士升级 +1；周期完成不加；图纸不当来源。旧档不改写成 20 |
| 工坊金币 | 吞吐按产出 `craftGold × 数量`；成品约 1～3，采集原材 0 或 1。当铺 / 收购仍用 `sellGold`。敌人 / 商场一单只发金币或钻石；商场新刷约 30% 限时（5/10/15 分），时限内奖励 ×2，超时下架留空。金币单绿档基准 `LOOT_GOLD_BASE = 6`，钻石约为该额的 1/5～1/10 |
| 钻石 | 新档 100；抽工人花 `RECRUIT_COST`（15）钻。旧档缺字段补 100，已有余额不重灌。无内购。地牢每日宝箱另发钻石（铜/银/金） |
| 地牢 | `dungeon`：日词缀 3 条（10 选 3，可点看完整效果；旧档 2 条日切再补）、`attemptsUsed`、独立 `encounter`、日切锁定 `chapter`。场上最多 5 人，破防硬直 3s（急醒 −1s），三阶段盾 5/7/9（铁盾 +2，第 3 章起基线 +1）。日切硬刷按当前主线章缩放（HP ×1.12/章、间隔 ×0.97、攻击 ×1.06），当日实例不中途重算（先自动发未领宝箱 / 日切判败） |
| 战场词缀 | 战场敌人格 `affixId` 1 条（与地牢共用词缀池，可点看效果）；商场无。探索刷新该格重掷；旧档缺字段且非进行中战斗 hydrate 补 1 条 |
| 工人攻速抖动 | 出手间隔按工人 id 哈希 ±8%～12%，夹 1～12s；战斗结算与 `Ns` 显示同一值 |
| 科技树 | `unlockedTechIds` + `techLevels`：三页签行选，每层同行同价；节点有 `maxLevel`，未满级可再点。该层任一点 `level≥1` 开上一层。已实装先 `maxLevel=1`，占位 `5`。战场格初始 2、科技 +1 封顶 4；商场格初始 2、科技 +1 封顶 4；不新开冲突多级线。旧未知 id 丢掉。`techEffectValue(save, effectId)` 按等级 × 表值叠乘（渣滓 / 站 XP / 采矿 / 铭刻耗时 / 离线 / 工人三围 / 弱点 / 揭示 / 助战下限 / 当铺收购金 / 探索费 / 战利品金；旧 `toolUpkeep` 额外产出仍可读；旧 `rematchSupply` 余粮整备为 noop）。订单格走 `battlefieldSlotCount` / `marketSlotCount`。抽人费与站速度乘区仍不受科技影响 |

---

## 10. 与现码差距（第 5 期后）

| 现码 | 仍后补 |
| --- | --- |
| 六站主列；伐木 / 钓鱼藏入口 / 撤派；竖签仍按 7 行高度 | — |
| 挖矿挖空等恢复；可换其它已解锁矿 | — |
| 工人页 4 药剂技能槽（点槽只打在岗，点？看效果，无 CD） | — |
| 狩猎遇险检定（停手 / 减产 / 可耗熟食）；成功出肉/鱼，低权杂物 | 狩猎真战斗 |
| 采药无限稳采，必出草 / 香料 | — |
| 铭刻出符文；软失败掷骰；开战 1 槽消耗；站工具已撤 | — |
| 烹饪烤鱼 / 烤肉 / 香料炖；`foodSlot` 续期 / 换食覆盖；残血（≤30%）自动吃 1，无手动喂 | — |
| 工具词条与食物 Buff 同 `effectId` 取最强；食物加速已弱化 | — |
| 炼金耗草 / 猎副产，随机 7 种药剂批次；工人页 4 槽短按点用 | — |
| 劳损累计 + 血线三档（空血 ×0.5 / 残血 ×0.8 / 正常 ×1）；已删狂暴 | 狩猎真战斗；跨站 combo |
| 主界面不再卖货；制造站卡片只列当前消耗库存；产出用工坊站卡本地「获得」漂字（带 `stationId`，不走全局 `floatTips`）；`sellFromBank` / `sellAllGoods` 仅调试 / 单测 | — |
| 偶遇货单含烤肉 / 香料炖 / 药剂 | 炼金效果后再调 |
