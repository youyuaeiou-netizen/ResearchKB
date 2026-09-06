# TabModalV2 游戏 UI 拼图重建：功能证据

日期：2026-08-25

## 结果

final result: passed

## 自动化验证

- `pnpm test -- --run`：8 个测试文件，24/24 通过。
- `pnpm run build`：TypeScript 检查和 Vite 构建通过。
- `git diff --check`：无 whitespace error；仅报告仓库既有 CRLF 转换提示。
- 浏览器控制台：error/warn 均为空。

## 浏览器行为证据

- `?ui=tab-v2` 默认进入“本机”；旧版 `/` 入口未改动。
- 五个 Tab 映射和视觉变体：`target/goal-grid`、`local/daily-rail`、`storage/training-rail`、`literature/combat-list`、`hdd/tactics-rail`。
- 五个状态的外框、Tab 轨道、关闭按钮和内容 viewport 坐标稳定；1280×720 CSS 视口实测 dialog `1216×597.75`，Tab 轨道 `670.0125×54.9875`，关闭按钮 `85.1125×65.75`。
- 只有 `local` 渲染 `.tab-modal-v2__local-orange-strip`；其他四个状态计数为 0。
- 五个状态均没有 `.tab-modal-v2__game-hud` 或 `.tab-modal-v2__game-shell`。
- 本机与 H.D.D 战术卡轨道实测固定卡片宽度 `248px`；本机轨道从 `scrollLeft=0` 到 `456`，右箭头到达终点后禁用，左箭头可回到 `0`。
- 文献使用纵向 `.tab-modal-v2__combat-rows`，不渲染横向 CardRail。
- 从“状态监控”打开后，关闭弹窗恢复原触发按钮焦点。
- 1920×1080、2560×1440、125% 和 150% DPI 均完成浏览器视口检查；临时 CDP/viewport 覆盖已清除，预览恢复默认 1280×720、DPR 1.25。

## 证据文件

- 视觉截图目录：`../visual/`
- 1920×1080：`../visual/local-1920x1080.png`
- 2560×1440：`../visual/local-2560x1440.png`
- 125% / 150% DPI：`../visual/local-dpi125-correct.png`、`../visual/local-dpi150-correct.png`
