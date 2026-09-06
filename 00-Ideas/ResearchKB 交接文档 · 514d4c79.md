---
title: ResearchKB 交接文档
type: concept
summary: "# ResearchKB 交接文档 更新日期：2026-08-11（Asia/Shanghai） **最后核验时间：** 2026-08-11 00:52（Asia/Shanghai） **正式知识库：** `F:\\ResearchKB` **控制目录：** `C:\\Users\\86159\\Documents\\workspace\\project001_自生长科研知识库\\integrations\\huajuan` **当前结论：** 正式 Vault 健康；ObsUI 自动 Codex App Server 连接已删"
knowledge_status: captured
review_status: pending
candidate_id: candidate-1786413281411-514d4c79
candidate_origin: codex-project
source_ref: C:\Users\86159\Documents\workspace\project001_自生长科研知识库\00_项目说明\交接文档_自生长科研知识库.md
source_sha256: 59ce351ee728e3ee4c6d2cc97b6646a876ba8629787b4e946c1aa04557193ed7
source_identity: "content-sha256:59ce351ee728e3ee4c6d2cc97b6646a876ba8629787b4e946c1aa04557193ed7"
source_identity_kind: "content-sha256"
duplicate_candidate: false
duplicate_counterparts: []
requires_human_review: true
---

# ResearchKB 交接文档

## 候选边界

- 来源：C:\Users\86159\Documents\workspace\project001_自生长科研知识库\00_项目说明\交接文档_自生长科研知识库.md
- 来源 SHA-256：59ce351ee728e3ee4c6d2cc97b6646a876ba8629787b4e946c1aa04557193ed7
- 人工审核：需要。该候选不得自动晋升为正式知识。

<!-- BEGIN CODEX MANAGED: CANDIDATE EVIDENCE -->
<details>
<summary>来源项目文档（存档，待人工审核）</summary>

# ResearchKB 交接文档

更新日期：2026-08-11（Asia/Shanghai）  
**最后核验时间：** 2026-08-11 00:52（Asia/Shanghai）  
**正式知识库：** `F:\ResearchKB`  
**控制目录：** `C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan`  
**当前结论：** 正式 Vault 健康；ObsUI 自动 Codex App Server 连接已删除，手工导入改为仅生成 Vault 外任务 Markdown。

## 1. 已完成什么

- 候选审核、Projects/Areas/Skills 受控晋升、Draft 保护、重新处理、统一检索、登录维护、可恢复会话保留和 ObsUI 已实现。
- 本轮删除自动 `codex app-server` 客户端、探测 API、批次自动处理 API、对应 UI 按钮与测试；不再启动、探测、管理或重试 App Server，也不自动从 Codex 输出创建候选。
- 手工资料仍可上传至 Vault 外暂存区，完成类型/签名/路径/SHA-256/提取检查后生成可审计任务 Markdown，由用户主动交给 Codex。
- 任务包不会自动写入候选或正式库；旧失败探测记录保留为审计历史但不再驱动功能。

## 2. 当前正式验收快照

| 项目 | 当前状态 |
| --- | --- |
| 正式 Vault 预检范围 | 256 文件、72 Markdown、183 图片；Lint PASS、Doctor PASS、断链 0 |
| 最近预检 | `maintenance-run-1786380756361-07cc4e12`；`COMPLETED_READ_ONLY`；正式写入 0 |
| Vault 全量磁盘计数 | 275 文件、77 Markdown、183 图片；含预检排除的运行/系统文件 |
| 候选与审计 | `00-Ideas` + `03-Resources` 有 16 个 Markdown；20 个候选决定记录 |
| 手工导入 | 1 个既有 Vault 外批次；新模式 `MANUAL_TASK_ONLY` |
| 登录维护任务 | `ResearchKB Agent Maintenance` 已安装为当前用户登录触发 |

## 3. 已锁定的控制规则

1. 候选仅可人工晋升、保留或淘汰并归档；晋升目标为 `01-Projects`、`02-Areas`、`05-Skills`，须绑定当前 SHA、禁止覆盖。
2. 新晋升卡逐字保留候选正文为来源证据；Codex 只能按任务包填写 `CODEX MANAGED: DRAFT`，不得修改来源证据、人工区、frontmatter、状态、哈希，也不得设置 `verified`/`reusable`。
3. 已晋升项“重新处理”须复核 SHA 且无反向链接，再原子降回 `00-Ideas`；原来源、Draft、人工判断和审计保留，失败回滚。
4. 统一检索不索引 Codex 原始会话、手工原件、提取缓存、任务包或任务输出；Zotero 仍是书目、PDF 和附件权威来源。
5. 手工导入仅接受 UTF-8 `.md`/`.txt`、可提取 `.pdf`、`.docx`，单文件最多 100 MiB；原件、提取文本、清单、任务包均在 `agent-maintenance\manual-intake`，不进入 Vault。

## 4. Core 与 UI 当前边界

- 自动 App Server 功能已移除：`codex-app-server-client.mjs` 不存在，`POST /api/manual-intake/probe` 为 404，UI 无“检查 Codex 连接”或“用 Codex 处理此批次”入口。
- 手工导入 API：`POST /api/manual-intake/upload`；任务 API：`POST /api/manual-intake/batches/:id/task`。后者只写 Vault 外 Markdown，不创建候选。
- 本机历史探测：`codex` 仅解析至桌面包内 `WindowsApps\...\resources\codex.exe`；曾报 `CODEX_APP_SERVER_ACCESS_DENIED (EPERM)`，未发现独立 CLI。
- 如需恢复自动处理：先安装并登录独立 Codex CLI，再另行授权实现 Windows 启动适配及端到端验收。不得改 WindowsApps ACL、复制内嵌 exe、管理员运行或关闭安全机制。

## 5. 下一步

1. 在 ObsUI 审阅当前 16 个候选，逐项人工选择晋升、保留或淘汰并归档。
2. 外部资料要进入候选时，须另行选择并授权：实现“粘贴/导入人工 Codex 输出并校验”的受控流程，或“独立 CLI 安装 + 登录 + 启动适配 + 验收”；均不得自动晋升。
3. 计划任务原始结果码 `3221225786` 未单独诊断；如需处理，先只读检查任务历史与退出码，不改任务定义。
4. `qwen3:4b` / `researchkb-review-qwen3:4b` 未启用；不得自行下载、删除或切换模型。

## 6. 相关文件

- Host：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan\workspace-host.mjs`
- UI：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan\workspace-ui\app.js`
- 手工导入：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan\manual-intake-core.mjs`
- 治理：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan\workspace-governance-core.mjs`
- UI/API 合约：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan\UI_CORE_CONTRACT.md`
- Vault 规则：`F:\ResearchKB\AGENTS.md`
- 审计根：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan\agent-maintenance`

## 7. 未决事项与历史风险

- 手工导入目前只能暂存并生成任务；没有人工 Codex 输出接收/校验通道，故不会自动变成候选。这是有意保守边界，不是故障。
- 旧 `manual-intake` 运行记录含早期 App Server 失败信息；保留其审计价值，但当前无自动连接代码读取它。
- 本轮验证：`manual-intake-core`、`workspace-governance-core`、`workspace-ui`、`local-ai-core`、`agent-maintenance-core`（5/5）和 `codex-archive-retention` 全部 PASS；正式预检如上。
- 正式区变更仍必须经过人工决定、当前 SHA、范围保护、审计、Lint、Doctor 和断链校验；失败必须回滚。

</details>
<!-- END CODEX MANAGED: CANDIDATE EVIDENCE -->
