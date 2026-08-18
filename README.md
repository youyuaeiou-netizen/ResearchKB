# ResearchKB

参考卡帕西思路，自己设计的obsidian知识库。

面向材料科研的本地优先、证据可追溯知识库框架。Codex 负责受控采集、候选编译、检索和检查；Obsidian 用于阅读与人工审阅；Zotero 始终是书目、PDF 和引用关系的权威源。

## 本仓库包含的内容

- 知识库目录结构与协作规则：`AGENTS.md`、`00-Ideas` 至 `05-Skills`。
- 自动化配置、任务脚本、测试和文档：`.harness/`。
- 知识卡模板与 Schema：`_system/templates`、`_system/schema.md`。
- 可共享的 Obsidian 基础设置：`.obsidian/*.json`。
- 运行 GitHub/X 信号桥接器所需的 MIT 许可 Horizon 源码快照与依赖锁定文件。

为保护隐私、版权与可复现性，仓库**不包含**个人笔记、原始资料、PDF、Zotero 数据、运行日志/缓存/状态、凭据、Obsidian 插件二进制或机器专属设置。六个正式知识目录中的 `.gitkeep` 仅保留目录结构。

## 克隆后开始

```powershell
git clone https://github.com/youyuaeiou-netizen/ResearchKB.git
Set-Location ResearchKB
codex
```

在 Codex 中打开本目录即可读取 `AGENTS.md`。任务会从自身位置定位工作区；不要求克隆到特定盘符或用户名目录。

基础任务需要 PowerShell 7 与 Python 3.11+。`Resolve-ResearchKBPython.ps1` 会优先发现 Codex 自带 Python；也可显式设置 `RESEARCHKB_PYTHON` 为 `python.exe` 路径。只有显式使用 `-Codex` 的候选编译才需要本机可用的 `codex` CLI。

```powershell
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile -File .harness\tasks\run-knowledge-lifecycle-weekly.ps1 -NoWrite
```

## 可选本地集成

Horizon GitHub/X 信号采集需要其独立 Python 环境，且默认不会联网。若确有经审核的来源与相应权限，请先安装 `uv`，再执行：

```powershell
uv sync --project .harness/vendor/Horizon --extra twitter
Copy-Item .harness/secrets/horizon.env.example .harness/secrets/horizon.env
```

仅在 `horizon.env` 中填写可选的 `RESEARCHKB_GITHUB_TOKEN` 与 `APIFY_TOKEN`；该文件被 Git 忽略。运行前先使用 `run-horizon-fetch.ps1` 的默认 dry-run，联网和正式 Vault 写入都需要明确授权。

如需启用本机 Zotero/Obsidian/运行目录，复制并填写 `_system/external_paths.example.json` 为 `_system/external_paths.json`。该本地文件同样不会提交。

## 安全边界

- 自动化默认 dry-run，只能改写带有 `CODEX MANAGED` 标记的区域。
- Zotero Local API 仅只读；不直接修改 Zotero 数据库。
- 采集失败、来源冲突或证据不足时保持 `hold`，而非将候选提升为正式知识。
- `--apply`、归档及任何外部访问都必须获得当前操作者的明确授权。

## 第三方组件

`.harness/vendor/Horizon` 保留其上游 MIT 许可文本。其虚拟环境、数据目录和内部 Git 元数据不会被版本控制。
