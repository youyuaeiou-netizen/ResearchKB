# TabModal V2 功能 QA

日期：2026-08-25

## 自动化

- `pnpm test`：通过，8 个测试文件，25/25。
- `pnpm run build`：通过，TypeScript 检查和 Vite 构建均完成。
- `git diff --check`：通过；Git 仅报告工作区已有的 LF/CRLF 提示，没有差异错误。

## 浏览器

- 视口：1920×1080；另检查默认 1280×720、DPR 1.25，以及 2560×1440。
- 五个 Tab 顺序：目标 → 本机 → 仓库 → 文献 → H.D.D。
- 1920×1080 几何基线：共享外框 `1662×818`，Tab 轨道 `1010×75`；切换五个 Tab 后外框坐标保持 `x=129,y=151`。
- 变体映射：`target/goal-grid`、`local/daily-rail`、`storage/training-rail`、`literature/combat-list`、`hdd/tactics-rail`。
- 只有 `local` 生成橙色左栏，其他四页使用各自灰色左栏素材；V2 DOM 中不存在自定义顶部 HUD 和整套 `game-shell`。
- 本机轨道实测：`scrollLeft` 从 `0` 变为 `418.4`；右箭头初始可用，滚动后左箭头可用。
- 关闭后重新从首页“状态监控”按钮打开，默认仍为“本机”；关闭后焦点恢复到“状态监控”按钮。
- 浏览器控制台：未发现 error/warn。

## 功能状态

结论：功能回归通过。视觉验收单独记录，尚未由用户确认。
