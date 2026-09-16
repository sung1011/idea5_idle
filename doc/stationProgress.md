# 站点等级与品类

对照 [main.md](main.md)。第一期只把 **采矿**、**锻造** 做成多品类；钓鱼 / 烹饪 / 伐木 / 炼金仍单一品类兼容。

---

## 已定稿

- 每个生产站点独立等级 + XP。进度仍在站点上，不在工人身上。
- 站内多品类；开局每站只解锁 1 个品类。
- 完成一次生产周期给该站 XP；XP 满则升级。
- 每 5 级解锁 1 个新品类：Lv5 第 2 类，Lv10 第 3 类。
- 高阶产出用新 `itemId`（`ironOre`、`ironWeapon`、`mithrilOre`、`mithrilWeapon`），不是同一个 `ore` / `weapon` 换皮。
- 整站共用一个 `selectedCategory`；同站堆人只加速当前品类。迅雷公式与共振不变。
- 第一期采矿 + 锻造各 3 个品类（默认 / Lv5 / Lv10）。

---

## 存档

每站在原有 `progress / stallReason / completed / resonanceStreak` 上增加：

| 字段 | 含义 |
| --- | --- |
| `stationXp` | 当前等级内经验 |
| `stationLevel` | 站点等级，开局 1 |
| `selectedCategory` | 当前生产品类 |
| `unlockedCategories` | 已解锁品类 |
| `progressNotice` | 最近一次升级 / 解锁文案，给 query 当 progress 提示 |

旧存档缺这些字段时，按新档默认补：Lv1、XP 0、只解锁第 1 档、选中第 1 档。非法 `selectedCategory` 回落到已解锁的第一档。

---

## 表

品类：`cycleS`、`costs` / 可选 `altCosts`、产出、`xpPerCycle`、`unlockLevel`。`costs` 是 `[{ itemId, qty }, …]`，单料、n 个同料、多料同一套 `takeCosts`。

升级曲线：`STATION_LEVEL_XP`（下标 = 当前等级所需 XP）。超出表长按末档递推。

| 站点 | 品类 | 解锁 | 周期 | 消耗 | 产出 | 每次 XP |
| --- | --- | --- | --- | --- | --- | --- |
| 采矿 | 铜矿 `copper` | 1 | 5s | — | `ore` 铜矿 | 10 |
| 采矿 | 铁矿 `iron` | 5 | 6s | — | `ironOre` | 12 |
| 采矿 | 秘银矿 `mithril` | 10 | 7s | — | `mithrilOre` | 15 |
| 锻造 | 铜器 `copper` | 1 | 8s | `[{ ore, 1 }]`；没有则 `altCosts` 渣滓 | `weapon` 铜器 | 10 |
| 锻造 | 铁器 `iron` | 5 | 9s | `[{ ironOre, 1 }, { wood, 1 }]` | `ironWeapon` | 12 |
| 锻造 | 秘银器 `mithril` | 10 | 10s | `[{ mithrilOre, 1 }, { wood, 2 }]` | `mithrilWeapon` | 15 |

钓鱼 / 烹饪 / 伐木 / 炼金：单一 `default` 品类，数值与改前一致。

锻造高阶档吃对应矿 + 木头辅料。选了铁器但银行只有铜矿 → 空转，提示缺「铁矿」（木头也缺则一并列出）。缺木不扣已有铁矿。铜器基础链不耗木。

---

## 结算

`stepStation` / `completeCycle` 读当前品类的周期、消耗、产出。堆人：

```
speed = (1 / 当前品类 cycleS) * n * (共振 ? 1.2 : 1)
```

完成周期后 `grantStationXp`。升级时把 `unlockLevel <= 新等级` 的品类写入 `unlockedCategories`，并写 `progressNotice`（如「采矿升到 Lv5，解锁铁矿」）。`collectHints` 带 `kind: 'progress'`。

`selectStationCategory`：未解锁返回失败（文案含 Lv 需求），不改选中。切换成功则进度清零。

---

## 银行 / 订单

新物品进 `ITEM_DEF`，可单件卖出；「卖货」整批收铜器 / 铁器 / 秘银器 / 熟食。

出发订单第一期仍收基础 `weapon` / `meal`（及木头、鱼）。高阶铁器订单后做，避免开局卡在未解锁品类。

---

## UI

站点卡：等级、生产进度条、XP 条、当前 `costs`、品类按钮。未解锁按钮禁用并标 `LvN`。银行页每个物品有相对 cap 的进度条（≥80% 警告，100% 满仓）。主界面页签：车间 / 银行 / 工人 / 订单。
