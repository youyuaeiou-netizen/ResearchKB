# ObsUI

ObsUI 是一个面向所有学生的本地优先工作台，用于管理课程、科研和个人项目中的下一步任务与资料入口。

当前版本是 v0.1 本地 Web 原型：

- 默认中文、深色终端工作台风格；
- 项目、月历、任务、资料、回收站和 JSON 备份/恢复；
- 数据仅保存在浏览器本地 IndexedDB；
- 不读取或写入 ResearchKB、Obsidian、Zotero；
- 不连接网络、不保存 API Key、不启动 Codex。

## 开发

要求 Node.js 20+ 与 pnpm：

```powershell
pnpm install
pnpm dev
```

验证：

```powershell
pnpm test
pnpm build
```

## 路线

v0.2 将增加项目详情和画布；v0.3 增加 ResearchKB/Obsidian 只读适配；v0.4 增加可选的本地 Codex 协作；Web 版稳定后再封装为 Tauri Windows App。

## 边界

本项目是对学生工作台需求的独立实现。`terminal-workbench` 仅作为功能参考，不复制其代码、资源或安装包。

## 许可证

代码使用 MIT License。
