# idea5_idle

抽工人、排流水线、同站堆人加速的生活挂机。第一期纯生活；「出发」只做订单门闩，真战斗后做。

当前主玩：**采矿 → 锻造**、**钓鱼 → 烹饪**、**伐木**（产木可卖；弱接锻造辅料 / 炼金后做）。同站堆人加速，相邻站同时有人会共振。武器 / 熟食等交给出发订单，交单后才能出发。炼金仍是骨架。离线回来会弹出摘要。

玩法与字段见 [doc/main.md](doc/main.md)，分阶段见 [doc/todo.md](doc/todo.md)。

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
