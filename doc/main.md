# 双线闲置 · 主体

纯前端挂机。气质接近 Melvor Idle：战斗一条线，生活一条线，各自升级、各自挂机。工程对齐同作者 idea3_hospital：Vue3 + TypeScript + Vite + Pinia + Vitest，`src/sim` 纯逻辑，`src/ui` 薄门面，在线与离线都走同一个 `applyTick`。不复制医院的房间 / 污染 / 病人。

另见：[分阶段落地](todo.md)

---

## 1. 定位

一存档是一个账号，下面有多名 **worker**。账号共用银行和金币；每个 worker 自带职业、战斗进度和当前派遣。

两套进度：

- 战斗：创建 worker 时选职业 → 该 worker 战斗等级升级 → 扣账号金币，把战斗技能写入该 worker 的 `knownCombatSkills`。
- 生活：伐木、采矿、炼金等各自独立玩法、独立挂机。派遣某个 worker 去做，不花金币学，也不叫「技能」。

可同时派遣：例如 worker A 采矿（生活挂机），worker B 战斗。只要分属不同 worker，生活 idle 与战斗 idle 在同一次 `applyTick` 里并行结算。

两条线只在银行 / 金币汇合：生活产货进账号 `bank` → 卖出变成账号 `gold` → 拿金币给某个 worker 买战斗技能。生活玩法自己转。

本阶段是脚手架：目录、表、学战斗技能规则、worker roster、伐木/炼金挂机骨架、采矿目录占位、存档键、最小页。可玩闭环留给后续阶段。

---

## 2. 两套系统（术语勿混）

### 2.1 「技能」= 战斗技能

只属于某个 worker 的已选职业。解锁看 **该 worker 的战斗等级**，花费是 **账号金币**。

流程：创建 worker 时选职业（战士 / 游侠 / 术士）→ 该 worker 战斗等级升级 → 用账号金币学习该职业的战斗技能，写入 `knownCombatSkills`。

表：

- `src/sim/tables/classDef.ts`
- `src/sim/tables/combatSkillDef.ts`（`unlockLevel` + `goldCost`）
- `src/sim/tables/combatLevelDef.ts`

规则在 `src/sim/combat/learnSkill.ts`：职业匹配、该 worker 战斗等级够、账号金币够、该 worker 尚未拥有。失败不扣金。

### 2.2 伐木 / 采矿 / 炼金 = 生活技能

各自一张表、一套 idle、一条账号级生活等级。**不走「金币学技能」**，也 **不和战斗技能共用一张万能表**。

生活表禁止出现指向 `combatLevel` 的 `goldCost` / `unlockLevel`。门槛字段必须写明是哪条生活线（如 `needWoodcutLevel`、`needAlchemyLevel`、`needMineLevel`）。

当前骨架：

- 伐木：`src/sim/life/woodcutting/` — 连续砍。派遣 worker 后，每 `chopS` 出 1 件进账号银行，进度清零后继续砍。
- 炼金：`src/sim/life/alchemy/` — 批次釜。派遣 worker 后一次投料，整批倒计时，到期一次出货。用来证明和伐木不是同一套循环。
- 采矿：`src/sim/life/mining/` 表 + idle 骨架已占位，完整玩法后做。

生活等级 / XP 记在账号 `save.life`，不跟某个 worker 绑定。worker 只带着当前 `assignment`。

### 2.3 汇合点

只有账号银行和金币：

1. 被派遣的 worker 把货推进 `save.bank`
2. `sellFromBank` 把货变成 `save.gold`
3. `learnSkill(save, workerId, skillId)` 扣 `save.gold`，写入该 worker 的 `knownCombatSkills`

生活 XP、生活等级、各 worker 的战斗 XP / 战斗等级互不读写。

---

## 3. Worker 与派遣

主术语是 **worker / Worker**，不要写成 character / 角色。

- 一存档多个 worker；每个 worker 可有不同 `classId`。
- 创建 worker 时必须选职业。
- 默认：账号级共用 `bank` + `gold`；worker 级各自 `combatLevel` / `combatXp` / `knownCombatSkills` / 当前 `assignment`。
- 派遣 worker 去生活挂机或战斗。同一 worker 同时只能有一份 `assignment`。
- `applyTick` 按 roster 并行结算每个 worker 的 assignment。

`assignment` 形状：

```ts
{ type: 'life', lifeId: 'mining' | 'woodcutting' | 'alchemy', ... }
| { type: 'combat', target: 'dummy', ... }
| null
```

空闲 worker 的 `assignment` 为 `null`。

---

## 4. 日循环

- 1 tick = 1 秒。
- 1 游戏日 = 1440 秒（24 分钟现实时间；1 秒 ≈ 1 游戏分钟）。
- 游戏日与「今日已过」只做显示和日后日计刷新。不改战斗公式，也不改生活公式。
- 在线每秒 `applyTick` 一次；离线按秒数连跑同一个 `applyTick`。各 worker 的派遣一起走。

---

## 5. 存档字段概要

`localStorage` 键名：`idea5Idle`。整份 `Save` JSON。

```ts
Save = {
  gold,
  bank,
  workers: Worker[],
  life: { woodcutting, alchemy, mining },
  lastTick,
  elapsedS,
  nextWorkerId,
}

Worker = {
  id,
  name?,
  classId,
  combatLevel,
  combatXp,
  knownCombatSkills,
  assignment,
}
```

| 字段 | 层级 | 含义 |
| --- | --- | --- |
| `gold` | 账号 | 金币。学战斗技能、卖货的交汇处 |
| `bank` | 账号 | 物品堆叠 |
| `life.*` | 账号 | 各生活线等级 / XP |
| `workers` | 账号 | worker 花名册 |
| `Worker.classId` | worker | 创建时选定：战士 / 游侠 / 术士 |
| `Worker.combatLevel` / `combatXp` | worker | 该 worker 的战斗等级 |
| `Worker.knownCombatSkills` | worker | 该 worker 已学会的战斗技能 |
| `Worker.assignment` | worker | 当前派遣；空闲为 `null` |
| `lastTick` | 账号 | 上次 tick 的墙钟，离线追赶用 |
| `elapsedS` | 账号 | 累计游戏秒，日循环用 |

---

## 6. 离线上限建议

建议离线追 tick 上限 **8 小时**（`OFFLINE_CAP_S = 28800`）。超过的部分丢掉，不把离线做成无上限印钞。

骨架已按这个上限切秒数并连跑 `applyTick`。离线摘要 UI、木桩离线 XP、生活离线产量展示留给阶段 4。

---

## 7. 明确不做

- 不把伐木 / 采矿 / 炼金叫做「技能」，也不用金币学习它们。
- 不把战斗技能和生活技能塞进一张万能表。
- 生活表不出现指向战斗等级的 `goldCost` / `unlockLevel`。
- 不用 `characters` / `Character` 当主术语；花名册是 `workers` / `Worker`。
- 不复制 idea3_hospital 的房间、污染、病人、员工、地块技能。
- 本阶段不做可玩闭环：创建 worker UI、木桩、卖货按钮、伐木/炼金操作台都留给后续阶段。
- 采矿完整玩法、战斗真正出招、装备、多敌人，后做。
- 不做后端、不做登录账号。这里的「账号」只指一份本地存档。
