# ResearchKB Schema

- 正式知识类型：`material-knowledge`、`literature`、`experiment`、必要的 `concept`。
- `primary_domain` 是材料知识卡唯一的物理归属；路径必须与其一致。
- `domain`、`material_system`、`process`、`microstructure`、`property`、`mechanism`、`characterization` 必须为列表。
- `knowledge_status`：`captured → screened → evidence-extracted → synthesized → verified → reusable → archived`。
- `review_status`：`pending`、`in-review`、`approved`、`rejected`。
- `verified` 要求人工审核、来源锚点和 `review_status: approved`。
- 文献父条目 key 与 PDF 附件 key 分离；附件逐项写入受管表格。
- 日志、报告、diff、缓存和备份不得进入活动 Vault。

## 新晋升卡表示规范

此规范只适用于 ObsUI 新晋升的卡片；既有历史卡不批量迁移或补写。

- 保留既有 `type` 的语义，另加 `record_kind`：`knowledge`、`skill` 或 `project`。
- 三类卡都必须有 `summary` 与 `keywords`，并保留 `promotion_source_path`、`promotion_source_sha256` 和 `promotion_decision_id`。
- 知识卡（`02-Areas`）：`record_kind: knowledge`，另有 `definition_scope`；正文含定义与适用范围、主张与依据、条件限制、关联来源。
- 技能卡（`05-Skills`）：`record_kind: skill`，另有 `intended_outcome`、`prerequisites`、`acceptance_criteria`；正文含操作、验收与回退。
- 项目卡（`01-Projects`）：`record_kind: project`，另有 `objective`、`project_status`、`next_action`；`project_status` 仅为 `planned`、`active`、`blocked` 或 `closed`。
- 原候选正文逐字保留在 `PROMOTED EVIDENCE` 区；`DRAFT` 区可由经 SHA 复核的 Codex 任务补写；其余人工区不得自动覆盖。

详见 [[_system/knowledge-card-representation.md|知识、技能与项目卡表示规则]]，可从 [[_system/templates/knowledge-card.md|知识卡模板]]、[[_system/templates/skill-card.md|技能卡模板]] 和 [[_system/templates/project-card.md|项目卡模板]] 开始建卡。
