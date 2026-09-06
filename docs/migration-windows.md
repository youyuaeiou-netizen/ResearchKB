# Windows 新电脑迁移

此仓库用于恢复 ResearchKB 知识内容、ObsUI 功能和界面，以及已提交的使用数据。可以克隆到不同盘符。示例使用 `D:\ResearchKB`；请替换为你的目标目录。

## 1. 安装与克隆

安装 Git、PowerShell 7、Python 3.11+、Node.js 24 和 pnpm 11。需要阅读知识库时安装 Obsidian；需要 H.D.D 对话时安装 Codex CLI 并在新电脑本地登录；按需安装 Zotero、Ollama 和代理客户端。

在 PowerShell 7 终端执行：

```powershell
git clone https://github.com/youyuaeiou-netizen/ResearchKB.git D:\ResearchKB
Set-Location D:\ResearchKB
python -m pip install -r .harness\requirements-test.txt
Set-Location apps\ObsUI
pnpm install --frozen-lockfile
pnpm test
pnpm build
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile -File .\scripts\start-obsui.ps1
```

普通新克隆已包含 ObsUI 文件，不需要递归子模块命令。旧电脑的 ObsUI 独立 `.git` 仅在旧电脑保留；迁移提交以主仓库版本为准。

## 2. 恢复已有使用数据

- H.D.D 会话读取工作区下的 `03-Resources/v3-auto/HDD-Chats/*.json`；只有实际存在并已提交的会话才会恢复。
- 项目、任务、资料和回收站保存在浏览器 IndexedDB，不会由 Git 自动导入。本次迁移文件为 `apps/ObsUI/migration/obsui-state-2026-09-05.json`，包含 2 个项目、2 个任务、1 条资料和空回收站，来自旧电脑 Chrome 的 `http://127.0.0.1:5173`。
- 新电脑启动后访问 **http://127.0.0.1:5173/**（首次导入时不要添加 `?ui=tab-v2`），点击右上角“工作台设置”，选择“导入 JSON 备份”，选中上述文件，确认替换新电脑当前 ObsUI 数据。不要在已有重要数据的浏览器中未经核对执行替换。
- 导入后访问 **http://127.0.0.1:5173/?ui=tab-v2** 使用当前界面。核对“选课结束”和“电信维修,上午”两项任务。
- 使用同一浏览器、同一主机名和端口；`localhost`、`127.0.0.1`、不同端口及不同浏览器的数据库彼此独立。
- 自动化状态保留在 `.harness/state/`、`_system/state.json` 和 `_system/sync/`。它们只是已提交时的快照，不代表新电脑已经完成来源验证或获得付费采集授权。

## 3. 本机配置

在 `apps/ObsUI` 中，仅当 `.env.local` 不存在时复制 `.env.example`，在本地填写代理软件路径和 API token。不要在聊天中提供密钥，不要将真实值填入 example 文件。

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

回到仓库根目录后，仅当 `_system/external_paths.json` 不存在时，从 `_system/external_paths.example.json` 复制并填入新电脑实际路径；该文件不会上传。Obsidian 用“打开文件夹作为仓库”打开新克隆目录，社区插件需要重新安装和配置。

Horizon 为可选集成：需要时安装 uv，执行 `uv sync --project .harness/vendor/Horizon --extra twitter`；仅在本地 `.harness/secrets/horizon.env` 配置采集凭据。Codex 登录、Ollama 模型、代理客户端、Codex/Windows 自动化任务和 Zotero 库不会随 Git 克隆安装或注册。

工作区外的 `F:\ZoteroData`、`F:\zotero_pdf`、外部 Staging/Runtime 目录没有纳入此次上传。历史笔记中的旧路径保留作为原始记录；链接到旧盘符的外部文件需按新电脑位置重新关联。不要把账户配置目录或浏览器完整用户目录提交到仓库。

## 4. 验证与后续同步

在仓库根目录执行：

```powershell
python -m unittest discover -s .harness\tests -v
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile -File .harness\tasks\run-researchkb-weekly.ps1 -NoWrite
git status --short
```

核对知识笔记和图片可打开、ObsUI 页面与任务恢复、配置后 H.D.D 能识别本机 Codex。先验证只读入口，不自动启用付费联网或正式知识写入。

后续代码和笔记变动使用 Git 提交并推送，新电脑用 `git pull --ff-only` 获取；发生分歧时先处理冲突，不强推。浏览器中的后续任务变化需要重新导出 JSON 并审核提交，Git 不会实时同步 IndexedDB。每次推送前检查暂存内容，避免将凭据或本机配置纳入公开仓库。
