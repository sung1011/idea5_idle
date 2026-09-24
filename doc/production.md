# 骑士工坊 · 生产定稿

字段名尽量稳定，供实现对照。第 1～5 期已按本文落地；与旧档不一致时以本文 + hydrate 为准。总览仍见 [main.md](main.md)，站点等级公式见 [stationProgress.md](stationProgress.md)，分阶段见 [todo.md](todo.md)。

---

## 0. 范围

- **本期做**：本文 + `main` / `todo`（及 README 指针）对齐。
- **本期不做**：第 1～5 期代码；不改生产公式、不换工坊表、不改工人存档形状。
- **定名**：现玩法六站英文 id 用下表；铭刻只用 `inscription`（`forging` / `smithing` / `engraving` 是别称，不另开 id）。钓鱼已废弃。站工具玩法已撤。
- **图标**：六站与底栏页签已换新彩色图并挂上。`stations.webp` 2×3（采药、炼金、狩猎、烹饪、采矿、铭刻），`tabs.webp` 2×2（工坊、PVE、PVP、科技）。

---

## 1. 六工坊

`StationKind = 'gather' | 'craft'`。采集三站各有一条核心差异；制造三站走配方。

| 站 | `stationId` | `kind` | 核心差异 | 产出 → 去向 |
| --- | --- | --- | --- | --- |
| 挖矿 | `mining` | gather | 节点生命，挖空等恢复 | 矿石 → 订单 / 金币；荒晶 → 铭刻 |
| 铭刻 | `inscription` | craft | 配方 + 软失败 | 荒晶 → 一次性符文 → 开战装槽 |
| 狩猎 | `hunting` | gather | 遇险检定（非战斗） | 肉 / 鱼 → 烹饪；血 / 牙 / 眼 → 炼金；杂物低权 |
| 烹饪 | `cooking` | craft | 产出食物 | 食物进物资 → 休息区 `restFoodId` → 入休息残血回血 |
| 采药 | `herbalism` | gather | 无限稳采 | 草 → 炼金；香料 → 烹饪 |
| 炼金 | `alchemy` | craft | 一次性消耗草 / 猎副产 | 7 种药剂随机批次 → 工坊页 4 槽短按点用 |

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

UI 主列六站，底栏「工坊」即原工坊页：左栏六站各 1 槽，站行最左侧竖排为站名、封闭、详情（两钮同宽同高，站名略大），工人槽下方同一行左侧下拉切换产出、右侧制造进度（`stationCraftPickOptions` 文案与 `stationCraftLabel` 相同：选中品类产出用「、」连接，无产出用品类名；选项值是品类，未解锁置灰不可选；只有一项时仍显示当前产出并禁用）。工作区站槽头像约 48、职业图标约 26、名字约 20、等级约 18，品质色点与头像描边一并放大；休息区、详情层和旧站卡不放大，点站打开详情层（消耗 / 速度 / 站经验 / 品类）。站序采药→炼金→狩猎→烹饪→采矿→铭刻（`STATION_ORDER` 共用）。底栏上沿按同一顺序常显六格细血条，有人按 `workerWearHp/hpMax`，空岗 0，满绿中金低红，约 5px，不挡页签、不跳站。旧组签双站大卡无底栏入口。`woodcutting` / `fishing` 废弃或藏入口，见第 7 节。站卡底部撤出 / 派入同款大号（仅文案与点击不同，无人在岗时撤出置灰）；右上角「？」打开该站说明，文案表在 `src/ui/stationHelp.ts`，弹层与资源栏同款分层字段：名称、怎么玩、产出、消耗，有特殊点再写注意，末行体力为「在岗体力影响效率：正常 100%，残血 80%，空血 50%。残血进入休息区才吃当前伙食；药剂点槽给在岗救急。」。详情层写「效率 N%」（空岗 100%，在岗按体力乘区）。在岗槽空血（`hp/hpMax ≤10%` 且未在战斗）加深红描边并轻闪（`crew-empty-hp`，对齐左栏空转）；残血不另闪，工人右栏不加。账号首次在岗效率跌破 100% 漂一次并记 `workshopHpEfficiencyTipShown`。

---

## 2. 各站核心差异

迅雷堆人、`cycleS`、站点 XP / 品类骨架仍沿用现式（周期 ×4 且 ≥20s，升级曲线见 stationProgress）。下面只定**差异规则**；具体数值第 2 期表驱动。

### 2.1 挖矿 `mining`（采集）

节点有生命。每次成功吞吐扣 `nodeHp`；`nodeHp <= 0` 后写入 `recoverAt`（恢复完成时的 `elapsedS`），恢复完成前该节点不产矿（进度冻结，可换其它已解锁矿）。恢复满后 `nodeHp = nodeHpMax`，`recoverAt = null`。铜档 `recoverS = 50`，铁 / 秘银仍 90 / 120。各矿品类节点存在 `miningNodes`，当前档镜像为 `miningNode`。

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

产出**只**是一次性战斗符文（`runeSharp` 锋锐 / `runeArmor` 厚甲 / `runeBlood` 血酬 / `runeBreak` 破障 / `runeSwift` 迅击 / `runeInsight` 洞悉）。解锁看铭刻站等级：Lv1 锋锐+厚甲（荒晶×2，批次 1–2，XP1）；Lv5 血酬+破障（荒晶×2，批次 1–2，XP2）；Lv10 迅击+洞悉（荒晶×3，批次 1，XP3）。周期 32s。没有 20 档工具下拉，不按吞吐耗工具，`selectedToolId` 恒空。武器线仍搁置。

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

配方消耗鱼 / 肉 / 香料等，产出食物进物资。休息区在抽工人下方点选一种伙食（`save.restFoodId`，默认 null）。残血（hp/hpMax ≤30%）工人**进入休息**时，若已选且物资至少 1 份，扣 1 并回血（meal 25% / roast 40% / stew 55% hpMax，向上取整，至少 HP>1），并挂同样短的弱生产效果，不占个人槽。未选或没货不吃。已在休息不再续吃，休息回血仍走 `applyRestHeal`。在岗周期和战斗击中不吃。偶遇补给另见第 8 节。

第 1 档 `meal` 烤鱼（耗鱼）；第 2 档 `roast` 烤肉（耗肉，开局可做）；第 3 档 `stew` 香料炖（肉+香料，或鱼+香料，Lv5）。不换皮。

### 2.5 采药 `herbalism`（采集）

无限稳采：无节点挖空、无空杆、无遇险。周期结束必出货（权重表可调草 / 香料比例，但不允许「什么都不出」）。

| `itemId` | 去向 |
| --- | --- |
| `herb` | 炼金 |
| `spice` | 烹饪 |

### 2.6 炼金 `alchemy`（制造）

一次性消耗：做成即从配方扣光原料。每次成功从 7 种药剂池随机一种，按 `POTION_BATCH_RANGE` 给一批进物资（回春散 8–14、兴奋剂 4–8、续命汤 5–10、绝境膏 4–8、赶工粉 2–5、双份雾 3–6、醒神散 3–6）。工人、工具、站 XP 仍按原站规则。药剂不能当休息区伙食，必须装进账号 `potionSlots`（4 槽）后点槽使用，无 CD；只打六站在岗，战斗中 / 休息 / 助战不吃，无人在岗不扣瓶并漂「没有在岗工人可用药」。装配列表按提效、加血分组（空组整组隐藏），和已装槽都点 i 看效果，气泡里有药剂才显示「卸下」。`potionEffectValue` 仍恒 0；速度改走 `potionBuffs`（兴奋剂、赶工粉），下一批倍率走双份雾。旧档通用 `potion` hydrate 成 `salve`；旧档 `focusDraft` / `wardElixir` 库存与已装槽迁成 `doubleMist` / `rushPowder`；旧档 `warDrum` 槽清空。醒神散只奶在岗最残的 1～2 人（第 1 人 35% hpMax，第 2 人须 HP≤50%max 再回 20%），满血不选且不扣瓶。回春散全体在岗立刻回 10% hpMax。绝境膏：HP≤30%max 抬到 40%，否则立刻回 5%。

原料走 `ALCHEMY_COST_OPTIONS`：草或猎副产（`blood` / `tooth` / `eye`）任一 1 个即可，优先扣草。旧「耗木出药剂 + 渣滓」已废。

### 2.7 钓鱼 `fishing`（已废）

钓鱼站已撤。旧档已派钓鱼的工人 hydrate 撤到休息，站状态丢弃。`fish` / `junk` 改由狩猎产出。工具类型 `rod` 与钓鱼专属工具不再产出。

---

## 3. 物流

站间仍共用 `save.bank`（字段名沿用，**无容量**，堆再多也不停产）。

```
挖矿 ──矿石──► 订单 / 金币
挖矿 ──荒晶──► 铭刻 ──符文──► 开战 1 槽（消耗；铭刻未开则槽置灰，点出骑士门槛）
狩猎 ──肉/鱼──► 烹饪 ──食物──► 物资 ──► 休息区伙食 ──► 入休息残血回血
狩猎 ──血/牙/眼──► 炼金（药剂）
狩猎 ──杂物──► 物资（低权，可在偶遇出手）
采药 ──草────► 炼金（药剂）
采药 ──香料──► 烹饪
工坊页 `potionSlots[4]` ──装配后点槽使用（无 CD；点 i 看效果，气泡内卸下）
```

制造站缺料 → `stallReason: 'emptyInput'`，现规则不变：先看齐再扣，缺任一不扣。采集站不因库存数量停工。

---

## 4. 共振（已废）

相邻站同时有人不再加速、也不额外掉主产物。`STATION_DEF.neighbors` 已清空，结算不读。旧档 `resonanceStreak` 仍 hydrate，不参与吞吐。不要加回。

---

## 4.1 一站一人（冲突已废）

每站最多 1 人（`STATION_WORKER_CAP = 1`）。在岗正好 1 人时，速度再乘 `SOLO_STAFF_MUL = 1.5`。0 人速度为 0，不乘 1.5。`stationConflictMul` 恒返回 1，站上不再显示冲突提示。

| 科技 | 效果 |
| --- | --- |
| `workshopRules` 工坊规章 | 全站周期 ×0.95（叠在 `stationCycleS`） |
| `artisanArchive` 工匠密录 | 成功吞吐时在岗工人经验 ×1.25 |
| `workshopCrest` 轮值章程 | 同组两站都有人时，该组速度 ×1.08 |

不做随机吵架、拆队。工坊劳损 / 残血 / 药剂时效 / 休息回血见 [main.md](main.md) 第 2.2 / 3 / 6.2 节。主线敌人出手可打在岗工人（与出战共用 `hp`，工坊可扣到 0 并立刻回休息；休息中不进池），选目标规则见 main 6.2。不做跨站 combo。

### 4.2 劳损与药剂

成功产出才加劳损：`fatigueDebt += (hpMax * 0.0015 + nearFullPip) * stationMul * comboMul`。`nearFullPip` 仅近满血（`hp >= hpMax-1`）加 `0.18`。`debt≥1` 扣 `floor` 血并减债，可以到 0。到 0 立刻回休息，绷带 + 自动吃饭，不行军；残血不撤岗。满血（`hp === hpMax` 且 `fatigueDebt === 0`）才能上岗。休息区队首未满血挡住自动填岗。回休息进队尾。工坊休息列表按这个顺序标号，满血标「队首」，堵住时第 1 行标「堵队」并压暗后面。站 `closed` 只挡自动填岗。`stationMul` 约 0.4（铭刻成功 0.55）。血线三档（`hp/hpMax`）：≤10% 空血 ×0.5，≤30% 残血 ×0.8，＞30% 正常 ×1。详情层写「效率 N%」。工坊页底色读 `hp - fatigueDebt`。已删除站狂暴、战鼓药与站工具。工坊页 4 槽短按点用 7 种药剂（兴奋剂加速、回春散全体 10%、醒神散奶最残、绝境膏抬残血、双份雾下一批倍率、赶工粉缩短一周期），兴奋剂与续命汤时效按 `elapsedS`。连招只站内，见 [main.md](main.md) 2.2。

---

## 5. 工人双槽

```ts
type Worker = {
  id: string
  name?: string
  classId?: ClassId
  qualityTier: QualityTier // 1～10
  assignment: StationId | null // 每站最多 1 人
  foodSlot: FoodSlot | null   // 旧档；余粮 hydrate 退回物资后恒为 null
  foodBuff?                    // 入休息进食挂的短时效果
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

品质 `qualityTier` 1～10，色表 `WORKER_QUALITY_TABLE`（白绿蓝青紫橙粉红金彩，无灰）。抽人默认白档 1；同档未满档可合成：休息区两人互合，新人回休息；拖到站上同档的人，新人留在该站。不同档或满档放不下，不换人。空槽不能拖上岗，空岗也不能点派入，只靠队首自动填岗；拖回休息区空白不能撤岗。新手引导第一阶段五步：抽工人 2 次、等队首自动上采药（闪队首和采药站，不闪空岗）、合成、选好 `restFoodId`、PVE 弹层开战；之后仍是炼金、装槽、点槽、点开符文槽。休息区同品质可合，休息工人拖到站上已有同品质的人仍可合成。未合过且当前能拖合时，工作区顶出「休息区同品质可合；拖到站上同品质也可合」，成功合成一次后记 `fuseDragTipDone` 不再出。前期（骑士低于 5 且引导未领完）工人头像旁另轮播小教程，同屏 1 条，过了门槛不再出。合并时工人食物回物资。职业按新档池随机。品质不改吞吐。克制属性随品质开槽，合成保留已有、只补新槽。旧灰表存档靠 `workerQualityRev` 迁一次。每站最多 1 人（`STATION_WORKER_CAP`）。偶遇敌人弱点、揭示与破防盾见 [main.md](main.md) 6.2。

工人战斗经验两处发放，升级都走 `grantWorkerCombatXp`（连升后按比例重算 `hpMax`）。战胜领战利品：杂兵 12 / 精英 20 / 首领 32，每章 +1，领取逻辑不变。工坊**成功吞吐**（有产出）给该站在岗工人各发 `max(1, round(该次 xpPerCycle × 0.35))`；已点「工匠密录」再 ×1.25。软失败 / 空杆 / 冻结无产出、助战和非在岗不发。站 XP 仍按原站规则另记，不把工人这份算进站。升级时全局漂「短名 升至 LvN」，该人在工坊页在岗槽 / 右栏短暂闪边。合成仍是双方总经验相加。

### 5.1 站工具（已撤）

不再有 20 档工具下拉、不按吞吐耗工具、不按工具加速。`selectStationTool` / 列表 API 失败「工具系统已撤」；速度乘区恒 1。旧档 `selectedToolId` / `toolSlot` / `*ToolNN` / 通用工具 hydrate 转荒晶（及起步符文），不回装。工坊页没有工具装配。战斗一次性符文见 2.2，不占工人存档槽。

### 5.2 休息区伙食

- 不再给工人装 `foodSlot`。存档 `restFoodId`：`meal` / `roast` / `stew` 或 null。休息区抽工人正下方一个按钮：已选显示名字和库存，未选写「未选伙食」；库存 0 变淡仍可点开。小层里点熟食 / 烤肉 / 香料炖即选中并关闭，「不选」清空。
- 工人变为休息（`assignment` 空，且不在战斗 / 夺宝）时若残血（`hp/hpMax ≤30%`，含空血）且已选、物资 ≥1：扣 1，按 `FOOD_HEAL_RATIO` 回血，并给该工人挂同等时长的弱生产效果（`foodBuff`，不占槽）。
- 未选或没货不吃。人已经在休息区之后不再续吃。`applyRestHeal` 照旧。
- 吃到时休息行约 0.7 秒淡绿回血光晕、血条亮一下，头像旁和全局各漂一次成功句（如「吃了熟食 +N」）。未选、无货、非残血不播。
- 在岗周期、工坊被打、战斗刚结算都不吃，避免和入休息吃两口。
- 旧档每人 `foodSlot.qty` 退回对应物资，然后槽清空。

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

敌人开战仍是补给门闩。新刷出的交物单（敌人补给 / 委托 / 收购 / 路人消耗 / 当铺）只要求 1 种已解锁工位的产物，种类跟骑士开站表（1 采药草/香料与炼金七药+任意药剂 → 5 狩猎 → 6 烹饪 → 9 采矿矿石 → 10 铭刻符文+任意符文），不跟章节号；药类 / 符类订单约 35%～40% 为通配 `anyPotion` / `anyRune`，交单扣库存最多的那一种。数量仍随品质与章节递增；Boss 只加数量。骑士 1 就要草/香料和药剂；开局商场「铜矿当」仍是 `ore` ×2 特例（采矿要骑士 9 才开）。荒晶不进主线新单池。铭刻已开后订单可要 6 种符文（`MAIN_NEED_TOOL_POOL` = `RUNE_ITEM_IDS`）或通配；旧档 `tool` / `*ToolNN` 读档 remap 成符文。裸 `potion` → `salve`。`itemProducerStation` 对旧通用工具回落铭刻、通配跳炼金/铭刻。市集新报价不再发裸 `tool`。武器搁置，不再作为新单主需求。战场交战中增援与战败后再增援都不扣补给；只有首次开战扣一整套。地牢开战另耗一套苛刻补给（草 ×12、香料 ×6、熟食 ×4、回春散 `salve` ×3），不走战场格、不被探索刷新；游戏日切仍强制刷新，可清掉进行中或战败的地牢战（与战场探索保留交战单分开），并按当前主线章锁定缩放、先自动发未领宝箱。详见 [main.md](main.md) 6.5。

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
| 炼金药剂 | `stim` `salve`（回春散）`renewSoup` `brinkSalve` `rushPowder` `doubleMist` `clearMind`；旧 `potion` hydrate→`salve`；旧 `focusDraft`→`doubleMist`、`wardElixir`→`rushPowder`；旧 `warDrum` 槽清空 |
| 工人劳损 | `Worker.fatigueDebt` |
| 药剂槽 / 时效 | `potionSlots` `potionBuffs`（`elapsedS`） |
| 站连招 | `fatigueCombo`（streak / key / frustration / fog） |
| 搁置武器 | `weapon` `ironWeapon` `mithrilWeapon` |
| 旧木 | `wood` |
| 矿节点 | `nodeHp` `nodeHpMax` `recoverAt` |
| 铭刻失败 | `softFail` |
| 猎遇险 | `hazard` |
| 渔场墙 | 已废；鱼/杂物走狩猎 |
| 休息区伙食 | `restFoodId`；旧 `foodSlot` 只作读档退粮 |
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
| 钻石 | 新档 150；抽工人花 `RECRUIT_COST`（12）钻，点亮「募兵折」后 7。旧档缺字段补 150，已有余额不重灌。无内购。地牢钻单宝箱另发钻石（铜 12 / 银 22 / 金 40）；金单宝箱发金币、不发钻 |
| 地牢 | `dungeon.encounters` 固定 2 单（`dungeonJailer` 深渊狱卒 / `dungeonBroker` 黑市掮客），`attemptsUsedById` 每单 1 次开战。每单 `affixIds` 2 条（10 选 2，卡头 tags，不再有全局词缀）。补给仍草 12 / 香料 6 / 熟食 4 / 回春散 3，两单各扣一套。场上最多 5 人，破防硬直 3s（急醒 −1s）。狱卒盾 7/9/12、偏砸场；掮客盾 4/6/8、偏横扫与残血。铁盾 +2，第 3 章起基线 +1。日切硬刷两单，按当前主线章缩放（HP ×1.12/章、间隔 ×0.97、攻击 ×1.06），当日实例不中途重算（两单都先自动发未领宝箱 / 日切判败）。钻单宝箱只发钻，金单只发金币（金箱底 100，每章约 +8%） |
| 战场词缀 | 战场敌人格 `affixId` 1 条（与地牢共用词缀池，可点看效果）；商场无。探索刷新该格重掷；旧档缺字段且非进行中战斗 hydrate 补 1 条 |
| 工人攻速抖动 | 出手间隔按工人 id 哈希 ±8%～12%，夹 1～12s；战斗结算与 `Ns` 显示同一值 |
| 科技树 | `unlockedTechIds` + `techLevels`：三页签行选，每层同行同价；节点有 `maxLevel`，未满级可再点。该层任一点 `level≥1` 开上一层。现表节点除「快马驿路」（`marchCutS`，每级 −5 秒，行军/凯旋/溃退共用，下限 8 秒，`maxLevel=3`）外均已实装 `maxLevel=1`；旧档 2–5 级 hydrate 夹到 1。科技页不再显示「已实装 / 未实装」标记。战场格初始 2、科技 +1 封顶 4；商场格初始 2、市集摊位 / 货栈扩容各 +1 封顶 4。「限时加急章」改时限 +50%，不再加格。同站冲突已废（`stationConflictMul` 恒 1）。工坊规章全站周期 −5%；工匠密录在岗经验 ×1.25；轮值章程在同组两站都有人时该组速度 ×1.08。在岗 1 人另乘 `SOLO_STAFF_MUL` 1.5。`techEffectValue(save, effectId)` 按等级 × 表值（渣滓 / 站 XP / 采矿 / 铭刻耗时 / 离线 / 工人三围 / 弱点 / 揭示 / 助战下限 / 当铺收购金叠乘 / 探索费叠乘下限 0.6 / 战利品金 / 荒晶双掉 / 炼金 +1 瓶 / 狩猎遇险 / 首刀 −0.5s / 符文 ATK / 残血减伤 / 破防余韵 / 限时单概率与时限 / 抽人费 / 商场钻石单 / 回营绷带 10% HP / 符文边角料 50% 退 1 荒晶 / 增援第一击 +20% / 匠师印章周期）。`toolUpkeep` 成功铭刻 +1 符文；`rematchSupply` 现为回营绷带（倒地溃退归来到点后回 10% HP，向上取整至少 1）。「匠师印章」走 `stationCycleS`：周期 × `1 - 0.01*floor(knightLevel/5)`，软上限 ×0.92；`stationTechSpeedMul` 仍为 1。订单格走 `battlefieldSlotCount` / `marketSlotCount` |

---

## 10. 与现码差距（第 5 期后）

| 现码 | 仍后补 |
| --- | --- |
| 六站主列；伐木 / 钓鱼藏入口 / 撤派；竖签仍按 7 行高度 | — |
| 挖矿挖空等恢复；可换其它已解锁矿 | — |
| 工坊页 4 药剂技能槽（点槽只打在岗，点 i 看效果，气泡内卸下，无 CD） | — |
| 狩猎遇险检定（停手 / 减产 / 可耗熟食）；成功出肉/鱼，低权杂物 | 狩猎真战斗 |
| 采药无限稳采，必出草 / 香料 | — |
| 铭刻出符文；软失败掷骰；开战 1 槽消耗；站工具已撤 | — |
| 烹饪烤鱼 / 烤肉 / 香料炖；休息区共用 `restFoodId`；入休息残血扣 1 回血 | — |
| 工具词条与食物 Buff 同 `effectId` 取最强；食物加速已弱化 | — |
| 炼金耗草 / 猎副产，随机 7 种药剂批次；工坊页 4 槽短按点用 | — |
| 劳损累计 + 血线三档（空血 ×0.5 / 残血 ×0.8 / 正常 ×1）；已删狂暴 | 狩猎真战斗；跨站 combo |
| PVP「夺宝矿洞」：本地 4 洞，守军是其他玩家快照（不是 NPC），新刷守军 50% 0 人（直接无人矿）、20% 1 人、20% 2 人、10% 3 人（已有洞不重掷），连环 1v1 抢夺后存活工人长采；按洞锁定，进行中禁止再开与增援；开采/抢夺与订单开战、增援共用选人面板，开采不显示符文槽；选中槽位按入队顺序标号，增援从已占槽的下一号起；占领后不能补采，一键撤出即放弃成无人矿，储量、倒计时和弱点不重置，可再选 1～3 人开采；无人矿没有守军，不能抢；PVP 页签只有「夺宝」，矿洞卡对齐战场订单卡，弱点单独一行用属性图标，初始问号，开采或开战揭开命中项，储量是进度条，剩余和上限写在条旁，有人在采时其下是开采进度，再往下写消失倒计时，不再列守军名单，我方也不写开采名单（人只留在守方血条和槽上），真实弱点命中开采 −1 秒（不看是否已揭开）；抢夺中当前攻守复用战场血条与出手条，血条为开战编制合计（死者当前计 0，上限仍是开局总和），血条下 3 格标有人/空/亡；我方开采与敌人驻守卡面同一套（弱点、储量条、开采进度、倒计时、守方条），只差徽章、守方名和按钮（撤出 / 抢夺）。未开战只画守方 HUD，开战后守方在上、攻方在下，不画空攻方；任一洞行军、凯旋、溃退和交战中的个人溃退都在该矿卡显示读条，进度跟帧走，凯旋守军已空时攻方条和读条仍留着；放弃开采的撤出仍立刻回休息；无人矿不画；弱点揭开后留到该洞消失，放弃不清，洞没了新洞重新问号；攻方名字行是玩家显示名（默认见习勇者，已有自定义名保留）加当前出战者，新刷守方随机玩家名，旧洞名字保留，不称影矿卫；敌人驻守血条名字左侧是整洞共用的假玩家头像（新洞用矿洞骰随机一个，旧档缺字段按洞 id 稳定），我方开采和攻方用玩家头像，凯旋守军已空仍用该洞头像；血条下 1/2/3 槽可点，有人看信息，空槽和已阵亡只漂字；夺宝、战场、地牢、商场页签行右上角「？」打开玩法说明（问号只写玩法规则，含开采不装符文、抢夺可装，不解释守军快照或假玩家；矿洞面板不再铺导语）；宝库与工坊材料分开。洞分砂金洞 / 珠宝洞 / 古玉洞，新刷约各 1/3，旧档缺 kind 按 id 稳定补种；掉落权重砂金洞 70/25/5、珠宝洞 20/70/10、古玉洞 15/25/60。每洞一条储量进度条，数字留在条旁。有人在采时其下再画整洞开采进度，速度是各人 1/间隔 之和，满一次只 −1 储量、进宝库 1 件，文案最快约 Ns/次跟这个整洞周期；敌人驻守同样画，抢夺中只算仍在挖的守军；无人矿不画开采条。获得提示只挂在该矿卡上，人在 PVP 夺宝页才飘，切走不飘，后台照常入库，可叠多条。影子挖不进宝库、不漂字。花 10 钻刷新时保留战斗中与我方开采，无人矿和敌人驻守且没在抢的洞换掉；四洞都在保留里或钻石不足不扣钻。底栏工坊｜PVE｜PVP｜科技；PVE 内页签战场｜地牢｜商场 | 真联机同洞对撞、聊天、公会 |
| 主界面不再卖货；制造站卡片只列当前消耗库存；产出用工坊站卡本地「获得」漂字（带 `stationId`，不走全局 `floatTips`）；`sellFromBank` / `sellAllGoods` 仅调试 / 单测 | — |
| 偶遇货单含烤肉 / 香料炖 / 药剂 | 炼金效果后再调 |
