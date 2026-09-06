# TabModalV2 功能 QA — 2026-08-25

## 范围

- V2 入口：`http://127.0.0.1:5173/?ui=tab-v2`。
- 旧版默认入口仍保留；本报告只记录 TabModalV2。
- 业务数据、IndexedDB、指标、网络、H.D.D 会话和首页上下文入口继续由既有适配层提供。

## 自动化结果

- `pnpm test`：8 个测试文件，22/22 通过。
- `pnpm run build`：通过，TypeScript 检查和 Vite 生产构建均通过。
- `git diff --check`：通过；仅有工作区既有的 LF→CRLF 提示，没有 whitespace error。

## 浏览器结果

- 当前 Codex 内置浏览器实际 CSS 视口为 `1280×720`，`devicePixelRatio=1.25`。
- 首次进入默认选中“本机”。
- 五个 Tab 顺序和映射为：目标 / 本机 / 仓库 / 文献 / H.D.D；逐一切换后均保持唯一激活项。
- 五个状态的几何基线一致：外框约 `x=49.76, y=40, w=1180.47, h=640`；Tab 轨道约 `x=289.39, y=47.04, w=690.58, h=78.08`；关闭按钮约 `x=1125.19, y=147.51, w=102.70, h=67.20`。
- 本机卡片轨道真实滚动：起点 `scrollLeft=0`、`scrollWidth=1298`、`clientWidth=823`；点击右箭头后 `scrollLeft=475.2`，左箭头启用、右箭头禁用。
- 关闭 V2 后返回总览，关闭时弹窗节点消失、总览节点存在。
- 控制台 error/warn：空。

## 证据

- [五状态几何记录](../geometry-current.json)
- [卡片轨道记录](../rail-current.json)
- [关闭行为记录](../close-current.json)
- [本机截图](../visual/local-1280x720.png)

功能验收已完成；视觉验收单独记录，不因功能通过而自动通过。

final result: passed
