# ObsUI

ObsUI 是一个面向所有学生的本地优先工作台，用于管理课程、科研和个人项目中的下一步任务与资料入口。

当前应用交接记录见 [交接文档](交接文档.md)，视觉验收记录见 [design-qa.md](design-qa.md)。

当前版本是 v0.1 本地 Web 原型：

- 默认中文、深色终端工作台风格；
- 项目、月历、任务、资料、回收站和 JSON 备份/恢复；
- 业务数据仍保存在浏览器本地 IndexedDB；H.D.D 会话另存为 `F:\ResearchKB\03-Resources\v3-auto\HDD-Chats\*.json`，不会写入 IndexedDB；
- H.D.D 只读镜像六个受控知识目录中的 `.md` / `.txt`，回答引擎可选 Codex CLI、本机 Ollama 或受信任的其他 CLI；强度选项按当前模型能力生成：Codex 5.5 支持 `low` 至 `xhigh`，5.6 Luna 至 `max`，5.6 Terra/Sol 至 `ultra`，本机 Qwen 3.5 支持 `off/low/medium/high`；OpenCode 对已识别底层模型使用 `--variant`。明确排除 `.claudian`、`.obsidian`、`_system`、`.harness`、应用配置、环境文件和密钥；
- 本机运行时可每 60 秒通过 Codex app-server 读取 5 小时与 1 周额度的已用比例、窗口长度与重置时间；不可用时回退到会话记录；不提取、保存、上传或显示令牌、账号信息或聊天内容；
- 可选本机网络卡：每 3 秒读取默认网络适配器的收发速率与局域网 IP，并每 5 秒测一次 `1.1.1.1:443` 的基础 TCP 延迟；该延迟不等于代理节点延迟；
- 可选手动唤起独立 FlClash / Clash Verge 窗口；不嵌入代理客户端、不切换节点或代理模式；
- 配置本机 FlClash loopback 代理后，应用会在启动时并每 60 秒自动检测代理出口 IP；未配置 token 时使用 ipify 仅返回 IP，配置 IPinfo Lite token 后可附带国家/地区与 ASN。查询结果不会写入 IndexedDB，界面不提供手动刷新按钮。
- 主页天气区优先通过本机 `/api/weather` 使用粗略网络位置读取 Open-Meteo 当前天气和今日高低温；浏览器允许位置权限后可改用更准确的当前位置。坐标只按约 1 公里精度保存在浏览器 localStorage，不写入 IndexedDB、文件或日志。
- 主页自动化状态行通过 `/api/codex-automations` 读取 `%USERPROFILE%\.codex\automations`（或 `CODEX_HOME\automations`）下的 `automation.toml` 元数据，只显示最近更新时间任务的名称和状态，不返回提示词。

## 开发

要求 Node.js 22.13+ 与 pnpm 11.19.0；按锁文件安装：

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 会自动打开当前界面入口 `http://127.0.0.1:5173/?ui=tab-v2`。如果浏览器没有自动打开，请手动访问这个完整地址；根地址 `/` 是保留的旧版工作台入口。

验证：

```powershell
pnpm test
pnpm build
```

## 设备弹窗与 H.D.D

点击首页导航、状态卡、知识空间、顶部设置或自动化计时后，会打开同一套居中的设备弹窗；关闭按钮返回总览。目标、本机、仓库、文献和 H.D.D 五个状态分别使用 `assets/reference/device-shell/` 中归一化的 688×373 原始外壳，内容只叠加在源图的开口内，不拼接 Tab 或补绘外框。自动化计时固定进入“目标”Tab；设置从 H.D.D 的二级入口进入。

H.D.D 的本机接口由 Vite 插件提供：

- `GET /api/hdd/providers`：并行检查 Codex CLI、本机 Ollama 和已知外部 CLI，返回各自可用模型或候选命令；
- `GET /api/hdd/status`：按 `provider` 检查 Codex、Ollama 或已配置外部 CLI；不可用时显示离线状态，不伪造回答；
- `POST /api/hdd/select-cli`：通过 Windows STA 文件选择器添加 `.exe`、`.cmd`、`.bat` 或 `.ps1` 命令行工具；
- `GET/POST /api/hdd/conversations`、`GET/DELETE /api/hdd/conversations/:id`：会话列表、创建、读取和二次确认删除；
- `POST /api/hdd/conversations/:id/messages`：SSE 流式回复，可停止生成；请求可带 `contextRoots`、`provider`、`model`、Codex `reasoningEffort` 及受限的 CLI 路径/参数配置。

工作台启动设置由 `C:\ObsUILiteratureDB\workbench-startup-settings.json` 保存。ObsUI Vite 服务创建时、桌面启动脚本打开页面前，以及页面每次挂载时都会幂等检查已勾选的 Zotero、FlClash、Ollama 和自定义应用；已运行进程不会重复启动。Zotero 开启时，启动接口会等待其固定 loopback Local API 就绪，页面继续预取文献运行状态和完整统一条目，再把快照交给文献页首帧；超时或请求失败后仍允许进入应用，文献页会自行恢复。Windows 登录自启动快捷方式仍由设置页单独管理。

Codex 提问使用 `codex exec --ephemeral --json --sandbox read-only --skip-git-repo-check`，并传入所选模型与调用级推理强度；Ollama 只访问 `127.0.0.1:11434`，强度会作为 `/api/chat` 的 `think` 参数传入。OpenCode 使用其公开的 `--variant` 参数，未知通用 CLI 因无法可靠发现能力而不伪造强度档位。若提供 `contextRoots`，临时镜像只包含当前选择的固定目录。应用不读取、复制或展示认证文件，请求结束后删除临时知识镜像。外部 CLI 的实际权限由该 CLI 自身决定，ObsUI 不能承诺与 Codex 沙箱等价；只应添加用户信任的工具。

## 本地启动

Windows 桌面快捷方式 `ObsUI.lnk` 通过 `scripts\start-obsui-hidden.vbs` 无控制台启动 `scripts\start-obsui.ps1`。点击后会在本机启动（或复用）Vite 开发服务，并打开 `http://127.0.0.1:5173/?ui=tab-v2` 的主页；若 HWiNFO 尚未运行，启动器会以传感器模式、最小化到托盘的方式启动它。页面本身不重复拉起 HWiNFO，以免每次刷新都触发管理员确认；它是手动启动入口，不创建 HWiNFO 计划任务。

也可以在应用目录直接运行：

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\start-obsui.ps1
```

## 可选网络配置

网络卡不需要配置即可显示本机接口、收发速率和公网 TCP 延迟。若要点击卡片启动 FlClash / Clash Verge，或自动查看代理出口 IP，请复制模板并只在本机填写：

```powershell
Copy-Item .env.example .env.local
```

`.env.local` 已被 Git 忽略，且所有字段都由 Vite 本机服务读取：

- `OBSUI_WORKSPACE_ROOT`：可选的 ResearchKB 根目录；默认使用当前仓库根目录；
- `OBSUI_LITERATURE_DATABASE_ROOT`：可选的文献和工作台设置目录；未设置时兼容原有 `C:\ObsUILiteratureDB`；迁移电脑时需自行复制旧数据并重新授权 DPAPI 保护的 Zotero 凭据；
- `OBSUI_OLLAMA_MODEL_ROOT`：可选的本机 Ollama 模型目录；
- `OBSUI_FLCLASH_PATH`：本机 `FlClash.exe` 的绝对路径；
- `OBSUI_CLASH_VERGE_PATH`：本机 `clash-verge.exe` 的绝对路径；
- `OBSUI_FLCLASH_PROXY_URL`：FlClash 的 loopback HTTP 代理地址，例如 `http://127.0.0.1:7890`；仅接受 `127.0.0.1` 或 `::1`；
- `OBSUI_IPINFO_TOKEN`：可选的个人 IPinfo Lite token，用于补充国家/地区与 ASN；不要添加 `VITE_` 前缀。

出口 IP 请求会在配置完成后由本机服务启动时触发，并由应用每 60 秒自动更新。缺少 token 时使用 ipify 只读取出口 IP；缺少本机代理时不会改为直连请求。token 不会写入页面、IndexedDB、日志或 Git。

## Codex 额度数据边界

`/api/codex-usage` 仅由本机 Vite 服务提供，优先读取 Codex app-server 的 `account/rateLimits/read`，不可用时回退到 `%USERPROFILE%\.codex\sessions` 与 `archived_sessions` 中最新的 `rate_limits` 事件。它不调用 ChatGPT 网页接口、不读取 `auth.json`、不上传数据，也不会把额度数据写入 IndexedDB；界面会同时显示 5 小时和 1 周窗口，缺失或读取失败时显示 `OFFLINE`，不会用示例数值代替。

该会话记录格式由 Codex 决定，未来桌面端更新可能导致此本地读取方式失效。

## 文献数据库与本地模型

文献页采用 Zotero 风格三栏布局，同时读取 Zotero Local API 和用户配置的本地 PDF 文件夹。两者共享一个 ObsUI 文献索引，但职责分开：Zotero 是条目主数据源，`C:\ObsUILiteratureDB` 保存索引、设置、缓存、分析状态和 Zotero 映射，原始 PDF 永久留在用户的期刊分类文件夹。ObsUI 不直接写入 Zotero 的 `zotero.sqlite` 或 `storage`。

固定目录如下：

- 模型仓库：`C:\AIModels`，由 Ollama 管理；用户级 `OLLAMA_MODELS` 已指向此目录；
- 文献数据库：`C:\ObsUILiteratureDB`，包含 `literature-state.json`、`settings.json`、`cache\` 和 DPAPI 保护的 `credentials.dat`。

使用 `scripts/start-obsui.ps1` 启动 ObsUI 时，伴随应用是否启动由工作台设置中的勾选项决定；启动脚本只负责让本机服务就绪后调用同源启动接口，已运行的 Ollama 会直接复用，关闭勾选不会强制启动。Ollama 服务在后台静默常驻；本地模型仍可在模型页手动启动或关闭，文献阅读器会在退出时请求卸载本次会话使用过的本地翻译模型，但检测到 OpenCode 或其他 Ollama 客户端连接时会跳过自动卸载。

设置文献文件夹后，ObsUI 会递归扫描 PDF，文字型 PDF 先提取正文，扫描 PDF 使用本机 `pdftoppm.exe` 渲染页面，再交给本机 Ollama 的 `qwen3.5:9b` 分析。模型生成的中文标题、摘要和标签必须经过用户确认后才写入 Zotero；写入会创建受管附件并回读验证。模型离线、Zotero 离线或上传失败时保留原始文件和可重试状态。

文献接口包括轻量的 `GET /api/literature/zotero/status`，以及 `GET /api/literature/status`、`GET /api/literature/items`、`PUT /api/literature/settings`、`POST /api/literature/rescan`、分析、忽略、确认入库和 Zotero 授权接口；所有写入接口执行同源校验。`GET /api/local-models` 额外返回 Ollama 模型目录、已安装模型、配置状态及当前忙碌信息。

仓库根目录的 `opencode.json` 已将 OpenCode 指向 Ollama 的 OpenAI-compatible 地址 `http://localhost:11434/v1`，使用同一份 `qwen3.5:9b`，无需再次下载模型。

## 主页天气与自动化数据边界

浏览器首次没有本地位置时，`GET /api/weather` 会由服务端通过 `ipapi.co` 获取粗略网络位置，仅取经纬度字段；若该步骤失败，再调用 `navigator.geolocation.getCurrentPosition`。浏览器定位成功后将坐标四舍五入到两位小数保存到 localStorage，后续进入主页直接复用，用户仍可通过“重新定位”刷新。`GET /api/weather?latitude=&longitude=` 会校验显式坐标；天气请求优先走已配置的本机代理，代理不可用时尝试直连，并按约 15 分钟在 Vite 进程内缓存，失败时优先返回旧缓存。

`GET /api/codex-automations` 只扫描自动化目录的一级子目录和 `automation.toml` 文件，返回名称、启用状态、周期和文件更新时间；自动化目录不存在时返回明确空状态，不用本地计时器冒充真实自动化。

## 网络数据边界

`/api/network-metrics`、`/api/flclash/launch` 和 `/api/clash-verge/launch` 仅由监听 `127.0.0.1` 的本机 Vite 服务提供。代理启动请求不接受浏览器传入的路径，只能使用服务端已验证的本机环境变量路径。

`/api/network-egress/refresh` 只接受同源 POST，并使用已配置的 loopback HTTP 代理访问固定的 ipify endpoint；配置可选 IPinfo Lite token 时改用 IPinfo Lite 补充国家/地区与 ASN。它只保留结果的内存缓存；刷新 Vite 服务后缓存消失。不开启 Mihomo Controller，不读取代理节点、协议、流量或密钥。

## 本地模型数据边界

`/api/local-models` 只读取本机 Ollama 的 loopback `/api/tags` 接口，用于显示已安装模型的名称与数量；读取本身不会发送提示词、模型内容或凭据，也不会自动启动 Ollama。只有用户在 H.D.D 设置中选择“本地 Ollama”并主动发送问题时，H.D.D 才会把当前问题与受限知识摘录发往本机 Ollama；64K、128K、200K 是同一 Qwen 模型族的不同上下文运行档，不重复计为不同基础模型。

## 路线

v0.2 将增加项目详情和画布；v0.3 增加 ResearchKB/Obsidian 只读适配；v0.4 增加可选的本地 Codex 协作；Web 版稳定后再封装为 Tauri Windows App。

## 边界

本项目是对学生工作台需求的独立实现。`terminal-workbench` 仅作为功能参考，不复制其代码、资源或安装包。

## 许可证

代码使用 MIT License。公开发布前，应另行确认壁纸和参考界面素材具有可再分发权；MIT 不会自动授予第三方素材的版权许可。
