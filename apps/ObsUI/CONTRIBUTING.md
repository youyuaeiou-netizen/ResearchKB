# 贡献指南

ObsUI 当前优先保持简单、离线和可验证。提交功能前请先说明用户场景、数据边界和回滚方式。

## 本地验证

```powershell
pnpm install
pnpm test
pnpm build
```

## 约束

- 不把 Vault、Obsidian、Zotero 或 API Key 写入应用数据库、构建产物或 Git。
- v0.1 不新增网络请求、自动化、Codex 集成或任意 Shell 执行。
- 修改数据格式时必须递增备份格式版本并增加迁移/拒绝测试。
- 保持默认中文和键盘可操作性；重大交互变更请附截图或录屏说明。
