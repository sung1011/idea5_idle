# idea5_idle · 骑士工坊

抽工人、排流水线、同站堆人加速的生活挂机。游戏定名 **骑士工坊**（仓库名仍为 `idea5_idle`）。第一期纯生活；偶遇敌人「出发」只做补给门闩，真战斗后做。

当前主玩：**采矿 → 锻造**、**钓鱼 → 烹饪**、**伐木**。界面按底栏页签切：工坊 / 工人 / 偶遇。视觉是羊皮纸浅底、金框卡片的 Q 版背包风。顶栏资源条显示金币、钻石、工人数，以及消息与设置；游戏日等统计在设置里。钻石 `diamonds` 是高级代币占位，存档默认 0，本轮没有获得途径。离线收益写入消息箱（最多 50 条），顶栏「消息」有未读红点，不再强弹大摘要。采矿 / 锻造各站独立等级，完成周期给 XP，每 5 级解锁新品类（铜 / 铁 / 秘银）。高阶锻造 `costs` 带木头辅料；铜器仍只耗铜矿（或渣滓）。同站堆人加速当前品类，相邻站同时有人会共振。物资没有容量上限，堆再多也不停产；工坊顶部可看数量并卖出。偶遇板固定 6 格，各带绿蓝紫橙品质（探索不刷灰）；探索花金币只换可刷新格；敌人货够则一键出发行军，到期只领金币；成交/已领盖章。失败提示用点击附近漂字。工坊周期 ×4 且至少 20s，前期升级门槛按约 30% 加速下调。工人页用按钮选中态表示人所在站点。炼金仍是骨架。离线回来看消息箱。

玩法与字段见 [doc/main.md](doc/main.md)，**生产定稿（七工坊 / 双槽）**见 [doc/production.md](doc/production.md)，分阶段见 [doc/todo.md](doc/todo.md)。切图在 `src/assets/icons/`：`resources.webp`、`tabs.webp`、`stations.webp`、`encounters.webp`（640×360 真透明 webp）。品牌图标在 `public/favicon*.png` / `public/favicon*.webp`。

## 在线预览（GitHub Pages）

地址：https://sung1011.github.io/idea5_idle/

推到 `main` 后，GitHub Actions 会自动构建并发布。

## 安装

```bash
npm install
```

## 命令

```bash
npm run dev
npm run build
npm test
```

开发页默认 http://localhost:5173/idea5_idle/ 。存档写在 `localStorage`，键名 **`idea5Idle`**。设置里的 **GM** 仅调试用：可初始化存档、加金币/钻石、加工人、站点满级、加基础物资。音乐/音效开关记在 **`idea5IdleSettings`**。

测试也可以直接：

```bash
npx vitest run
```
