# 贡献指南

ObsUI 当前优先保持简单、本地优先和可验证。提交功能前请先说明用户场景、数据边界和回滚方式。

## 本地验证

```powershell
pnpm install
pnpm test
pnpm build
```

## 约束

- 不把 Vault、Obsidian、Zotero 或 API Key 写入应用数据库、构建产物或 Git。H.D.D 会话只能写入 `03-Resources\v3-auto\HDD-Chats` 的独立 JSON 文件，不使用 IndexedDB。
- `.env.local`、令牌、本机绝对路径和网络响应原文不得提交；只提交无密钥的 `.env.example`。
- 不新增任意外部网络端点、自动化或可编辑 Shell 执行。允许本机只读解析 Codex 会话中的 `rate_limits`；允许 H.D.D 通过本机 `codex exec --ephemeral --json --sandbox read-only` 进行只读 SSE 回复；允许在用户配置 loopback 代理后按固定周期查询固定 IPinfo endpoint，且请求必须经该代理。不得提取、保存或上传 `auth.json`、令牌、账号信息或未授权聊天内容。
- H.D.D 知识镜像只能读取六个知识目录中的 `.md` / `.txt`，必须排除 `.claudian`、`.obsidian`、`_system`、`.harness`、应用配置、环境文件和密钥，并在请求结束后删除临时目录。
- 任何可启动本机程序或发起出口查询的 POST 接口必须同源校验，且不得接受浏览器传入的路径、命令、代理地址或 token。
- 修改数据格式时必须递增备份格式版本并增加迁移/拒绝测试。
- 保持默认中文和键盘可操作性；重大交互变更请附截图或录屏说明。
