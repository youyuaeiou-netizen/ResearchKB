# 安全策略

ObsUI v0.1 是本地 Web 应用。业务数据保存在浏览器 IndexedDB；H.D.D 会话独立保存到工作区的 `03-Resources\v3-auto\HDD-Chats`。只有用户在被忽略的 `.env.local` 配置 loopback FlClash 代理后，应用才会自动经该代理访问固定的 ipify endpoint；配置可选 IPinfo Lite token 时改用 IPinfo Lite 补充国家/地区与 ASN。主页天气是独立的 Open-Meteo 请求，用户成功授权后仅在浏览器 localStorage 保存约 1 公里精度的位置坐标，不写入 IndexedDB、文件或日志。

`/api/local-models` 只访问固定的 `127.0.0.1:11434/api/tags`，读取 Ollama 已安装模型的名称、模型目录配置和当前忙碌状态；不发送提示词或模型内容，不读取凭据，也不自动启动本地模型运行器。文献分析只通过本机 Ollama loopback 接口，模型仓库固定为 `C:\AIModels`。仅当用户在工作台启动设置中勾选 Ollama 时，Vite 服务创建、启动脚本服务就绪或页面挂载触发的本机启动接口才会按固定用户环境启动缺失进程。

文献系统的索引、设置、缓存和加密授权文件固定保存在 `C:\ObsUILiteratureDB`；原始 PDF 留在用户配置的期刊分类文件夹，不移动、不删除。文献目录只允许访问用户明确配置的文件夹，且禁止指向 Zotero、模型仓库或文献数据库。Zotero 仅通过启用后的 Local API 写入，写入后必须回读验证；不会直接修改 `zotero.sqlite` 或 Zotero `storage`。启动就绪检查和轻量状态接口只探测固定的 `127.0.0.1:23119/api/`，校验 `Zotero-Server-ID` 响应头，不读取条目内容。Zotero 授权信息使用 Windows DPAPI 保护后写入 `credentials.dat`，不进入浏览器、Git 或日志。

`/api/weather` 只接受校验后的纬度和经度，服务端按坐标短时内存缓存天气结果；`/api/codex-automations` 只读取自动化文件的名称、状态、周期和更新时间，不向浏览器返回 `prompt` 内容。两个接口均为本机 Vite 服务的只读 GET 接口，并对带有 Origin 的跨源请求执行同源校验。

H.D.D 的边界如下：

- 提问与命中的知识摘录会通过本机 Vite 服务发送给用户在 H.D.D 设置中明确选择的 Codex CLI、本机 Ollama 或外部 CLI；应用不读取、复制或展示 `auth.json`、Cookie、令牌或账号信息。
- 临时镜像只允许 `00-Ideas`、`01-Projects`、`02-Areas`、`03-Resources`、`04-Archive`、`05-Skills` 中的 `.md` / `.txt`，排除 `.claudian`、`.obsidian`、`_system`、`.harness`、应用配置、环境文件和密钥。镜像在请求结束后清除。
- Codex 调用固定为 `codex exec --ephemeral --json --sandbox read-only`（临时镜像位于仓库外时附加 `--skip-git-repo-check`）；Ollama 只访问固定 loopback 接口。模型强度在前端按模型能力收窄，服务端再次校验；Ollama 使用受限的 `think` 布尔值/枚举，OpenCode 使用参数数组中的 `--variant`，不会拼接到命令 shell。所选提供方不可用时只显示明确离线状态，不自动回退或伪造回答。
- 外部 CLI 只接受绝对 `.exe/.cmd/.bat/.ps1` 路径，参数模板拒绝 shell 元字符并通过参数数组或 stdin 传入问题；但进程会继承该工具自身的文件、网络与账号权限，不能视为 Codex 只读沙箱。用户只能添加自己信任的 CLI。
- ObsUI 自身不根据模型回答编辑文件或执行回答中的指令；会话删除必须在 H.D.D 中二次确认。

令牌、FlClash 路径、代理地址和出口 IP 不得写入 Git、IndexedDB、构建产物或日志。启动 FlClash 与刷新出口 IP 的接口只接受同源 POST，不接受前端传入的路径、命令或凭据。

工作台伴随应用启动接口只监听本机 Vite 服务并执行服务端已解析的路径；它不接受浏览器传入的任意命令或路径。启用的 Zotero、FlClash、Ollama 和自定义应用会在服务创建、启动脚本和页面挂载时幂等检查，已运行进程不会重复启动。

请不要在公开 Issue 中提交令牌、个人资料备份、Vault 内容或本机路径。发现可能导致数据泄露、任意文件访问或权限绕过的问题，请先通过 GitHub Security Advisories 私下报告。
