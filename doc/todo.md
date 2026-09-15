# 双线闲置 · 分阶段落地

对照 [main.md](main.md)。

技术：Vue 3 + TypeScript + Vite + Pinia + Vitest。`src/sim/` 纯逻辑，`src/ui/` 只读状态、发操作。在线与离线共用 `applyTick`。按 worker 并行结算各自 `assignment`。

每档先写 `sim` 和测试，再挂一层薄 UI。

后做（不挡脚手架）：采矿完整玩法、装备、多敌人、微信适配。

---

## 0. 脚手架

- [x] Vite + Vue 3 + TypeScript + Pinia + Vitest
- [x] 目录：`src/sim/`、`src/ui/`
- [x] 职业表、战斗技能表、战斗等级表（到 Lv5）
- [x] `learnSkill`：职业 / 等级 / 金币 / 未拥有；扣的是账号 gold
- [x] Save = `{ gold, bank, workers: Worker[], ... }`
- [x] Worker 派遣骨架：生活挂机或战斗
- [x] 伐木连续砍、炼金批次釜、采矿目录占位
- [x] `bank` / `tick` / `offline` / 存档键 `idea5Idle`
- [x] 最小页：boot、显示时间、无 worker 提示

过关：`npx vitest run` 能过 learnSkill 测试；`npm run dev` 能出最小页。

---

## 1. 选职 + 学战斗技能 + 木桩 XP

- [ ] 创建 worker 时选职业（战士 / 游侠 / 术士）
- [ ] UI：给指定 worker 用账号金币学战斗技能
- [ ] 派遣 worker 打木桩，涨该 worker 的 `combatXp` / `combatLevel`
- [ ] 学会的技能写入该 worker 的 `knownCombatSkills`

过关：两名不同职业的 worker 能分别学到各自的 1 级战斗技能；木桩只加战斗 XP。

不做：生活操作台、离线摘要。

---

## 2. 伐木独立挂机

- [ ] 派遣 worker 去伐木（连续砍）
- [ ] 货进账号银行
- [ ] 账号伐木等级 / XP
- [ ] 卖木头换金币

过关：worker A 在砍树时，worker B 仍可打木桩。

---

## 3. 炼金批次挂机

- [ ] 派遣 worker 看批次釜
- [ ] 投料、整批计时、一次出货
- [ ] 证明循环与伐木不同

过关：同一存档里，一人炼金、一人战斗，银行和金币共用。

---

## 4. 离线

- [ ] 关页后按秒数连跑 `applyTick`，上限 8 小时
- [ ] 各 worker 的派遣一起追
- [ ] 上线摘要：各派遣产了什么 / 木桩 XP

过关：一人采矿（或伐木）一人战斗，离线回来两边都有进度。

---

## 后做

- [ ] 采矿完整玩法（表与 idle 骨架已占位）
- [ ] 战斗真正出招、装备
- [ ] 更多生活线
