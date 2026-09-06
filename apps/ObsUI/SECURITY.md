# 安全策略

ObsUI v0.1 是本地 Web 应用。业务数据保存在浏览器 IndexedDB；H.D.D 会话独立保存到 `F:\ResearchKB\03-Resources\v3-auto\HDD-Chats`。默认不会查询出口 IP；只有用户在被忽略的 `.env.local` 配置 loopback FlClash 代理与 IPinfo token 后，应用才会每 60 秒自动经该代理访问固定的 IPinfo Lite endpoint。

`/api/local-models` 只访问固定的 `127.0.0.1:11434/api/tags`，读取 Ollama 已安装模型的名称；不发送提示词或模型内容，不读取凭据，也不自动启动本地模型运行器。

H.D.D 的边界如下：

- 提问与命中的知识摘录会通过本机 Vite 服务发送给当前已登录的 Codex CLI；应用不读取、复制或展示 `auth.json`、Cookie、令牌或账号信息。
- 临时镜像只允许 `00-Ideas`、`01-Projects`、`02-Areas`、`03-Resources`、`04-Archive`、`05-Skills` 中的 `.md` / `.txt`，排除 `.claudian`、`.obsidian`、`_system`、`.harness`、应用配置、环境文件和密钥。镜像在请求结束后清除。
- CLI 调用固定为 `codex exec --ephemeral --json --sandbox read-only`（临时镜像位于仓库外时附加 `--skip-git-repo-check`）；CLI 不可用时只显示明确离线状态，不回退到其他服务或伪造回答。
- 首版仅只读回答，不编辑文件、运行用户指令、联网检索或执行外部操作。会话删除必须在 H.D.D 中二次确认。

令牌、FlClash 路径、代理地址和出口 IP 不得写入 Git、IndexedDB、构建产物或日志。启动 FlClash 与刷新出口 IP 的接口只接受同源 POST，不接受前端传入的路径、命令或凭据。

请不要在公开 Issue 中提交令牌、个人资料备份、Vault 内容或本机路径。发现可能导致数据泄露、任意文件访问或权限绕过的问题，请先通过 GitHub Security Advisories 私下报告。
