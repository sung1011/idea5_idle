# 站点等级与品类

对照 [main.md](main.md)。七站定稿见 [production.md](production.md)。本文只记**已上线**的等级 / 品类公式；伐木 `woodcutting` 已废弃 / 藏入口。

第 2 期起 **采矿**、**锻造**、**钓鱼**、**狩猎** 做成多品类；第 4 期 **烹饪** 扩到烤鱼 / 烤肉 / 香料炖。采药 / 炼金仍单一品类兼容。

---

## 已定稿

- 每个生产站点独立等级 + XP。进度仍在站点上，不在工人身上。
- 站内多品类；开局每站只解锁 1 个品类。
- 完成一次生产周期给该站 XP；XP 满则升级。
- 每 5 级解锁 1 个新品类：Lv5 第 2 类，Lv10 第 3 类。
- 高阶产出用新 `itemId`（`ironOre`、`ironTool`、`mithrilOre`、`mithrilTool`），不是同一个 `ore` / `tool` 换皮。旧武器 id 仍可卖。
- 整站共用一个 `selectedCategory`；同站堆人只加速当前品类。迅雷公式不变；相邻站不再加成。
- 采矿 / 锻造 / 钓鱼 / 狩猎各 3 个品类（默认 / Lv5 / Lv10）。烹饪开局烤鱼+烤肉，Lv5 香料炖。采药无限稳采，不设节点。

---

## 存档

每站在原有 `progress / stallReason / completed / resonanceStreak` 上增加：

| 字段 | 含义 |
| --- | --- |
| `stationXp` | 当前等级内经验 |
| `stationLevel` | 站点等级，开局 1 |
| `selectedCategory` | 当前生产品类 |
| `unlockedCategories` | 已解锁品类 |
| `progressNotice` | 最近一次升级 / 解锁文案，存档字段；UI 不展示 |
| `miningNode` / `miningNodes` | 挖矿当前 / 各品类节点（`nodeHp` `recoverAt`） |
| `gatherNotice` | 最近一次采集文案（空杆 / 遇险 / 挖空） |
| `gatherPauseUntil` | 狩猎遇险停手结束的 `elapsedS` |

旧存档缺这些字段时，按新档默认补：Lv1、XP 0、只解锁第 1 档、选中第 1 档。非法 `selectedCategory` 回落到已解锁的第一档。

账号级骑士等级不写在站上：`knightLevel = 1 + sum(可玩站 stationLevel - 1)`（等价 `sum(level) - (站数 - 1)`）。站升级时用存档快照补发差额灵感，并写消息箱。旧档缺快照只按当前站等级写入，不把缺字段当成 1 去灌点。

---

## 表

品类：`cycleS`、`costs` / 可选 `altCosts`、产出、`xpPerCycle`、`unlockLevel`。`costs` 是 `[{ itemId, qty }, …]`，单料、n 个同料、多料同一套 `takeCosts`。

升级曲线以公式为准（已删扁平表）：

```
xpToNext(L) = Math.round(100 * Math.pow(1.45, L - 1) * 0.175)  // L >= 1
```

周期全部 ×4，仍不足 20s 提到 20s。XP 乘 0.175，使前期升到 Lv5 的墙钟比旧周期+旧 XP 大约快 30%。

| L | 本级所需 | 从 Lv1 累计到下一级 |
| --- | --- | --- |
| 1 | 18 | 18 |
| 2 | 25 | 43 |
| 3 | 37 | 80 |
| 4 | 53 | **133（到 Lv5）** |
| 5 | 77 | 210 |
| 6 | 112 | 322 |
| 7 | 163 | 485 |
| 8 | 236 | 721 |
| 9 | 342 | 1063（到 Lv10） |

品类每次 XP：铜 / 第 1 档 = 1，铁 / 第 2 档 = 2，秘银 / 第 3 档 = 3；烹饪烤鱼/烤肉 = 1、香料炖 = 2；采药 / 炼金单品类 = 1。

| 站点 | 品类 | 解锁 | 周期 | 消耗 | 产出 | 每次 XP |
| --- | --- | --- | --- | --- | --- | --- |
| 采矿 | 铜矿 `copper` | 1 | 20s | — | `ore` 铜矿 | 1 |
| 采矿 | 铁矿 `iron` | 5 | 24s | — | `ironOre` | 2 |
| 采矿 | 秘银矿 `mithril` | 10 | 28s | — | `mithrilOre` | 3 |
| 锻造 | 初级工具 `copper` | 1 | 32s | `[{ ore, 1 }]`；没有则 `altCosts` 渣滓；软失败扣部分矿、无成品、少量 XP | `tool` | 1 |
| 锻造 | 中阶工具 `iron` | 5 | 36s | `[{ ironOre, 1 }]` | `ironTool` | 2 |
| 锻造 | 高阶工具 `mithril` | 10 | 40s | `[{ mithrilOre, 1 }]` | `mithrilTool` | 3 |
| 钓鱼 | 初级渔场 `copper` | 1 | 28s | — | 掉落表：空杆 / 鱼 / 杂物（墙：只出初级） | 1 |
| 钓鱼 | 中级渔场 `iron` | 5 | 32s | — | 掉落表：初级～中级 | 2 |
| 钓鱼 | 高级渔场 `mithril` | 10 | 36s | — | 掉落表：初级～高级 | 3 |
| 狩猎 | 野猪 `copper` | 1 | 24s | — | `meat`（遇险则无） | 1 |
| 狩猎 | 狼 `iron` | 5 | 24s | — | `meat` `tooth` | 2 |
| 狩猎 | 鹿 `mithril` | 10 | 24s | — | `meat` `blood` `eye` | 3 |
| 烹饪 | 烤鱼 `copper` | 1 | 28s | `[{ fish, 1 }]` | `meal` | 1 |
| 烹饪 | 烤肉 `iron` | 1 | 28s | `[{ meat, 1 }]` | `roast` | 1 |
| 烹饪 | 香料炖 `mithril` | 5 | 32s | `[{ meat, 1 }, { spice, 1 }]`（或鱼+香料） | `stew` | 2 |
| 采药 | `default` | 1 | 20s | — | 权重：草 / 香料（必出） | 1 |
| 炼金 | `default` | 1 | 40s | `ALCHEMY_COST_OPTIONS`：草 / 血 / 牙 / 眼任一 | `potion`（效果不填） | 1 |

### 验算手感

铜档 1 XP / 次，到 Lv5 要 133 次吞吐。

- 采矿 20s：1 人约 44 分钟；3 人约 15 分钟。
- 锻造 32s：1 人约 71 分钟；3 人约 24 分钟。
- 比旧 5s 周期 + 760 XP，前期升到 Lv5 大约快 30%。

铁档解锁后 2 XP / 次。采矿 Lv5→Lv6 要 77 XP ≈ 39 次，24s 周期单人约 16 分钟。秘银档 3 XP / 次，用来对冲更长周期和更高升级门槛。

锻造高阶档只吃对应矿，不再耗木。选了中阶工具但物资里只有铜矿 → 空转，提示缺「铁矿」。铜档基础链不耗木，可用渣滓。产出不受库存数量限制。

---

## 结算

`stepStation` / `completeCycle` 读当前品类的周期、消耗、产出。堆人（玩法 n≤2；站上工具另乘增效）：

```
speed = (1 / 当前品类 cycleS) * n
```

完成周期后 `grantStationXp`。升级时把 `unlockLevel <= 新等级` 的品类写入 `unlockedCategories`，并写 `progressNotice`（如「采矿升到 Lv5，解锁铁矿」）。UI 不展示该升级文案；停产只靠卡片红框。

`selectStationCategory`：未解锁返回失败（文案含 Lv 需求），不改选中。切换成功则进度清零。挖矿切换会换 `miningNode`，其它矿的恢复倒计时留在 `miningNodes`。

采集结算（第 2 期）：挖矿每次吞吐扣 1 `nodeHp`，挖空后按 `recoverS` 冻结该矿；钓鱼按 `FISHING_DROP_TABLE` 掷骰，空杆也给 XP；采药按 `HERBALISM_DROP_TABLE` 必出货；狩猎先 `hazard` 检定，遇险掉本周期产出并短暂停手。

炼金结算（第 5 期）：按 `ALCHEMY_COST_OPTIONS` 先草后猎副产扣 1，出 `potion`。`potionEffects` 为空，不能生效。缺四料则 `stallReason: emptyInput`，卡面写堵点句。

---

## 物资 / 偶遇

新物品进 `ITEM_DEF`。各站卡片就近显示该站产出 / 消耗数量；主界面不再卖货。换金走偶遇当铺 / 收购。没有容量上限，也不因「满」停产。不做制皮。

偶遇敌人新单改收食物 / 工具 / 矿。旧档武器需求仍可成交。偶遇板 6 格，每格灰绿蓝紫橙品质（探索不刷灰），高品质需求与产出更高且更赚。

---

## UI

站点卡：等级、生产进度条、XP 条、当前 `costs`、该站相关物资数量、多品类站用下拉选当前生产目标。下拉列出全部已解锁，另加 1 个下一档未解锁（置灰不可选），不列更后面的未解锁。当前品类为选中态；切已解锁即换整站生产目标。生产条用显示用进度：权威仍是每秒 `applyTick`，UI 按 `stationSpeed` 在两拍之间插值，停产不假跑；XP 条用短 CSS transition。无独立物资区、无卖货按钮、无容量条。主界面页签：工坊 / 工人 / 偶遇。
