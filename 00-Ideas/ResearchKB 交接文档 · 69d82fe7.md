---
title: ResearchKB 交接文档
type: concept
summary: "# ResearchKB 交接文档 更新日期：2026-08-11（Asia/Shanghai） 最后核验：2026-08-11 11:13:30（UTC+08:00） 正式 Vault：`F:\\ResearchKB` 控制目录：`C:\\Users\\86159\\Documents\\workspace\\project001_自生长科研知识库\\integrations\\huajuan` ## 当前结论 正式 Vault 健康，ObsUI 的候选处理、重复候选整卡替换/撤销、响应式布局和“已晋升重新处理”均已实现并回归验"
knowledge_status: captured
review_status: pending
candidate_id: candidate-1786500453411-69d82fe7
candidate_origin: codex-project
source_ref: C:\Users\86159\Documents\workspace\project001_自生长科研知识库\00_项目说明\交接文档_自生长科研知识库.md
source_sha256: ea75985ce983f995768f04824503fef5fa8e9c3956c74f15b36464e002cace68
source_identity: "content-sha256:ea75985ce983f995768f04824503fef5fa8e9c3956c74f15b36464e002cace68"
source_identity_kind: "content-sha256"
duplicate_candidate: false
duplicate_counterparts: []
requires_human_review: true
---

# ResearchKB 交接文档

## 候选边界

- 来源：C:\Users\86159\Documents\workspace\project001_自生长科研知识库\00_项目说明\交接文档_自生长科研知识库.md
- 来源 SHA-256：ea75985ce983f995768f04824503fef5fa8e9c3956c74f15b36464e002cace68
- 人工审核：需要。该候选不得自动晋升为正式知识。

<!-- BEGIN CODEX MANAGED: CANDIDATE EVIDENCE -->
<details>
<summary>来源项目文档（存档，待人工审核）</summary>

# ResearchKB 交接文档

更新日期：2026-08-11（Asia/Shanghai）  
最后核验：2026-08-11 11:13:30（UTC+08:00）  
正式 Vault：`F:\ResearchKB`  
控制目录：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan`

## 当前结论

正式 Vault 健康，ObsUI 的候选处理、重复候选整卡替换/撤销、响应式布局和“已晋升重新处理”均已实现并回归验证。自动 Codex App Server 连接已移除；手工导入仅生成 Vault 外任务 Markdown。

## 当前验收快照

| 项目 | 已核验状态 |
| --- | --- |
| 正式库受控健康范围 | 259 文件、75 Markdown、183 附件；Lint PASS、Doctor PASS、断链 0、正式写入 0 |
| Vault 磁盘总计 | 278 文件、80 Markdown；含系统/运行目录，与受控健康范围不同 |
| 候选 | 19 个：4 个 `PENDING`、15 个 `RETAINED`；候选 Markdown 19 个 |
| 决定与归档 | 20 条决定记录；1 条 `PROMOTED`；1 个可恢复归档；无待淘汰提案 |
| 手工导入 | `MANUAL_TASK_ONLY`；存在 1 个既有 Vault 外批次 |
| 回归 | `workspace-governance-core: PASS`；`ui-api: PASS`；Core/UI 语法检查通过 |

## 本轮已完成

1. 重复候选默认可共存晋升；只有显式勾选“替换正式卡片”并选择关联正式卡才整卡替换。旧卡在 Vault 外保留 30 天，可撤销替换。
2. ObsUI 候选处理区移出横向表格：桌面为“晋升整行、保留/淘汰并列”，720px 以下为单列；候选列表在窄屏为字段卡片。已核验 1280、1024、720、390 宽度，所有页面无页面级横向溢出。
3. 已晋升卡的重新处理改为校验**当前**正式卡 SHA，而非晋升时的历史 SHA；若正式卡后来更新，会保留原 SHA、当前 SHA 与变化标记的审计，再将当前完整内容降为 `00-Ideas` 候选。旧 SHA 和过期页面提交均会拒绝。
4. 重新处理成功后，ObsUI 自动切到“待处理”。Core 回归覆盖：旧 SHA 拒绝、当前 SHA 成功、当前内容保留、候选状态为 `PENDING`。
5. 自动 `codex app-server` 客户端、探测/自动处理 API 与 UI 入口已删除。手工资料上传后仅生成 Vault 外审计任务 Markdown，不会自动创建候选或晋升。

## 当前待确认操作

- `01-Projects/project001 材料学自生长科研知识库.md` 仍为 `PROMOTED`，决定为 `candidate-decision-1786374255342-748767d6`。
- 该正式卡当前内容与晋升时不同，最近核验已正确暴露当前 SHA；无反向链接命中。
- 未代替用户执行“重新处理”，因为该操作会删除正式路径并创建候选。刷新/重启 ObsUI 后，在“已晋升”中再次点击“重新处理（降回候选）”、填写说明并确认；成功后将自动显示在“待处理”。

## 已锁定规则

1. 候选仅能人工晋升、保留或淘汰归档；晋升根目录固定为 `01-Projects`、`02-Areas`、`05-Skills`，必须校验当前 SHA，禁止任意路径与覆盖。
2. 重新处理必须使用页面读取的当前正式卡 SHA、通过反向链接检查并填写人工说明；失败恢复原卡。晋升时 SHA 仅作不可变审计，不能阻止处理已更新的当前版本。
3. 重复候选替换目标只能是关联的正式卡；替换与撤销替换都要求当前 SHA 和 `confirm=true`，旧卡在 Vault 外保留 30 天。
4. Codex 只能按任务包填写 `CODEX MANAGED: DRAFT`；不得改来源证据、人工区、frontmatter、状态或哈希，且不得设置 `verified`/`reusable`。
5. Zotero 仍是书目、PDF、附件权威来源。正式写入必须有精确范围、人工决定、审计、Lint、Doctor 和断链校验；失败必须回滚。
6. 手工导入仅支持 UTF-8 `.md`/`.txt`、可提取 `.pdf`/`.docx`，单文件不超过 100 MiB；原件、提取文本、清单和任务包均在 Vault 外的 `agent-maintenance\manual-intake`。

## 下一步

1. 用户确认后完成上述项目的“重新处理”，确认其出现在“待处理”，再人工审核。
2. 在 ObsUI 审阅其余 4 个待处理候选，逐项人工晋升、保留或淘汰归档。
3. 如需把外部资料转为候选，另行授权实现受控的人工 Codex 输出接收/校验流程，或安装并登录独立 CLI 后做启动适配与端到端验收；不得恢复自动晋升。
4. 不自行下载、删除或切换 `qwen3:4b` / `researchkb-review-qwen3:4b`；计划任务退出码如需诊断，先只读检查历史与退出码。

## 关键路径

- Host：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan\workspace-host.mjs`
- Core：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan\workspace-governance-core.mjs`
- ObsUI：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan\workspace-ui\app.js`
- 样式：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan\workspace-ui\styles.css`
- 接口契约：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan\UI_CORE_CONTRACT.md`
- 审计根：`C:\Users\86159\Documents\workspace\project001_自生长科研知识库\integrations\huajuan\agent-maintenance`
- Vault 规则：`F:\ResearchKB\AGENTS.md`

</details>
<!-- END CODEX MANAGED: CANDIDATE EVIDENCE -->
