# ObsUI

ObsUI 是一个面向所有学生的本地优先工作台，用于管理课程、科研和个人项目中的下一步任务与资料入口。

当前应用交接记录见 [交接文档](交接文档.md)，视觉验收记录见 [design-qa.md](design-qa.md)。

当前版本是 v0.1 本地 Web 原型：

- 默认中文、深色终端工作台风格；
- 项目、月历、任务、资料、回收站和 JSON 备份/恢复；
- 业务数据仍保存在浏览器本地 IndexedDB；H.D.D 会话另存为 `F:\ResearchKB\03-Resources\v3-auto\HDD-Chats\*.json`，不会写入 IndexedDB；
- H.D.D 只读镜像六个受控知识目录中的 `.md` / `.txt`，对话页可在这六个目录内选择上下文范围，并可为每次回答选择 Codex 模型（5.5、5.6 Luna、5.6 Terra、5.6 Sol）与 `low`、`medium`、`high`、`xhigh`、`max` 强度；明确排除 `.claudian`、`.obsidian`、`_system`、`.harness`、应用配置、环境文件和密钥；
- 本机运行时可每 60 秒扫描一次 Codex 会话记录并仅提取周额度的已用比例、窗口长度与重置时间；不提取、保存、上传或显示令牌、账号信息或聊天内容；
- 可选本机网络卡：每 2 秒读取默认网络适配器的收发速率与局域网 IP，并每 5 秒测一次 `1.1.1.1:443` 的基础 TCP 延迟；该延迟不等于代理节点延迟；
- 可选手动唤起独立 FlClash / Clash Verge 窗口；不嵌入代理客户端、不切换节点或代理模式；
- 出口 IP 默认不查询。完成配置后，应用会每 60 秒经本机 FlClash loopback 代理请求 IPinfo Lite 自动更新；仍可手动立即刷新，且不保存 token 或查询结果到 IndexedDB。

## 开发

要求 Node.js 20+ 与 pnpm：

```powershell
pnpm install
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

- `GET /api/hdd/status`：检查当前登录的 Codex CLI；CLI 不可用时显示离线状态，不伪造回答；
- `GET/POST /api/hdd/conversations`、`GET/DELETE /api/hdd/conversations/:id`：会话列表、创建、读取和二次确认删除；
- `POST /api/hdd/conversations/:id/messages`：SSE 流式回复，可停止生成；请求可带 `contextRoots`、Codex `model` 和 `reasoningEffort`，且只接受六个固定知识目录名、模型名和强度值。

每次提问都以 `codex exec --ephemeral --json --sandbox read-only --skip-git-repo-check` 调用本机 Codex CLI，并按当前选择传入 `--model` 与调用级 `model_reasoning_effort`；若提供 `contextRoots`，临时镜像只包含当前选择的固定目录。应用不读取、复制或展示认证文件；请求结束后删除临时知识镜像。知识摘录和提问会经本机 CLI 发送给模型，知识内容被视为不可信参考资料，不能改变助手权限。首版不编辑文件、不执行用户指令、不联网检索，也不配置 API Key。

## 本地启动

Windows 桌面快捷方式 `ObsUI.lnk` 指向 `scripts\start-obsui.ps1`。点击后会在本机启动（或复用）Vite 开发服务，并打开 `http://127.0.0.1:5173/?ui=tab-v2`；它是手动启动入口，不创建计划任务。

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

- `OBSUI_FLCLASH_PATH`：本机 `FlClash.exe` 的绝对路径；
- `OBSUI_CLASH_VERGE_PATH`：本机 `clash-verge.exe` 的绝对路径；
- `OBSUI_FLCLASH_PROXY_URL`：FlClash 的 loopback HTTP 代理地址，例如 `http://127.0.0.1:7890`；仅接受 `127.0.0.1` 或 `::1`；
- `OBSUI_IPINFO_TOKEN`：个人 IPinfo Lite token；不要添加 `VITE_` 前缀。

出口 IP 请求会在配置完成后由应用每 60 秒自动触发；“状态监控”页中的“刷新出口 IP”按钮仍可立即触发一次。缺少代理或 token 时，ObsUI 不会改为直连请求；token 不会写入页面、IndexedDB、日志或 Git。

## Codex 额度数据边界

`/api/codex-usage` 仅由本机 Vite 服务提供，读取 `%USERPROFILE%\.codex\sessions` 中最新的 `rate_limits` 事件。它不调用 ChatGPT 网页接口、不读取 `auth.json`、不上传数据，也不会把额度数据写入 IndexedDB。当前账户只返回 7 天窗口时，界面只显示该窗口；缺失或文件暂时被占用时显示 `OFFLINE`，不会用示例数值代替。

该会话记录格式由 Codex 决定，未来桌面端更新可能导致此本地读取方式失效。

## 网络数据边界

`/api/network-metrics`、`/api/flclash/launch` 和 `/api/clash-verge/launch` 仅由监听 `127.0.0.1` 的本机 Vite 服务提供。代理启动请求不接受浏览器传入的路径，只能使用服务端已验证的本机环境变量路径。

`/api/network-egress/refresh` 只接受同源 POST，并使用已配置的 loopback HTTP 代理访问固定的 IPinfo Lite endpoint。它只保留 IP、国家/地区码、ASN 与运营组织的内存缓存；刷新 Vite 服务后缓存消失。不开启 Mihomo Controller，不读取代理节点、协议、流量或密钥。

## 本地模型数据边界

`/api/local-models` 只读取本机 Ollama 的 loopback `/api/tags` 接口，用于显示已安装模型的名称与数量；它不会发送提示词、模型内容或凭据，也不会自动启动 Ollama。当前版本只接入模型发现状态，不改变 H.D.D/Codex 的对话模型。

## 路线

v0.2 将增加项目详情和画布；v0.3 增加 ResearchKB/Obsidian 只读适配；v0.4 增加可选的本地 Codex 协作；Web 版稳定后再封装为 Tauri Windows App。

## 边界

本项目是对学生工作台需求的独立实现。`terminal-workbench` 仅作为功能参考，不复制其代码、资源或安装包。

## 许可证

代码使用 MIT License。公开发布前，应另行确认壁纸和参考界面素材具有可再分发权；MIT 不会自动授予第三方素材的版权许可。
