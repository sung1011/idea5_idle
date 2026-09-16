# idea5_idle

抽工人、排流水线、同站堆人加速的生活挂机。第一期纯生活；偶遇敌人「出发」只做补给门闩，真战斗后做。

当前主玩：**采矿 → 锻造**、**钓鱼 → 烹饪**、**伐木**。界面按页签切：车间 / 银行 / 工人 / 偶遇。视觉是羊皮纸浅底、金框卡片的 Q 版背包风。顶栏资源条显示金币、钻石、工人数；钻石 `diamonds` 是高级代币占位，存档默认 0，本轮没有获得途径。采矿 / 锻造各站独立等级，完成周期给 XP，每 5 级解锁新品类（铜 / 铁 / 秘银）。高阶锻造 `costs` 带木头辅料；铜器仍只耗铜矿（或渣滓）。同站堆人加速当前品类，相邻站同时有人会共振。银行每格有相对容量的进度条。偶遇板固定 5 格：探索花金币只换可刷新格；敌人货够则一键出发行军，到期只领金币；黑心商人只买、路人只换货、当铺只典当。工人页用按钮选中态表示人所在站点。炼金仍是骨架。离线回来会弹出摘要。

玩法与字段见 [doc/main.md](doc/main.md)，分阶段见 [doc/todo.md](doc/todo.md)。切图在 `src/assets/icons/`：`resources.webp`、`tabs.webp`、`stations.webp`、`encounters.webp`。

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

开发页默认 http://localhost:5173/idea5_idle/ 。存档写在 `localStorage`，键名 **`idea5Idle`**。

测试也可以直接：

```bash
npx vitest run
```
