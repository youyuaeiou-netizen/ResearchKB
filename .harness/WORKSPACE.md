# ResearchKB v3 自动化执行层

Codex 工作区根目录是本仓库根（当前为 `F:\ResearchKB`）。本文件所在的 `.harness` 仅承载自动化的配置、脚本、暂存、状态、日志、报告与测试；所有运行性输出必须留在此目录。任务和脚本从任意目录启动时都以仓库根作为 cwd，并按脚本位置定位 `.harness` 内部资源。

## 目标

将 ResearchKB 实现为 Codex 驱动的持续知识编译系统：

原始资料 → 来源卡 → 编译候选 → 人工审阅 → 正式知识 → Query/Lint/报告 → 新问题和下一轮资料。

## 角色

- Codex：来源采集、元数据规范化、去重、候选编译、交叉引用建议、Query、Lint 和报告。
- Obsidian：阅读、链接浏览、图谱查看和人工审阅。
- Zotero：书目、PDF、附件和引用关系的权威源。
- 人：确认科学结论、冲突解释、正式晋级和 Skill 沉淀。

## 证据等级

报告和回答必须区分：

- 正式知识：02-Areas、01-Projects、05-Skills 中已人工确认的内容。
- 候选知识：00-Ideas\v3-auto 中尚未确认的内容。
- 原始证据：03-Resources、Zotero 或用户导入文件。
- 推断：Codex 根据现有证据提出的解释，必须标注为推断并回链证据。

不得把元数据摘要写成已验证科学结论。论文摘要不能替代全文证据，自动候选不能替代人工审核。

## 操作

- daily：由 `run-v3-daily.ps1` 执行 v3 来源收集、去重、资源卡和候选 dry-run；不再生成 Horizon 日报。
- Horizon weekly digest：唯一正式入口为 `tasks\run-horizon-weekly-digest.ps1`，运行窗口为 Asia/Shanghai 周日 12:00–12:29；可供知识库处理的周报输出固定为 `03-Resources\RAW\horizon\Weekly`。Horizon 机器原始包仍隔离在 `.harness\staging`。
- `tasks\run-horizon-daily-digest.ps1` 仅保留为兼容别名，转发到 Horizon weekly digest，并遵守同一时间窗口。
- weekly：由 `run-v3-weekly.ps1` 执行 v3 汇总、冲突/孤立/陈旧/缺口检查和周报，计划时间为周日 20:00。
- Curated compile：由 `run-knowledge-compile-weekly.ps1` 扫描 `03-Resources/RAW`，按内容 SHA-256 生成稳定 Curated ID、来源追踪和待审阅提案；默认只写入 `.harness/staging/knowledge-lifecycle/curated-proposals`。显式 `-Codex` 才复用现有只读 v3 Codex 编译器；只有显式 `-Codex -Apply`（等价于 `compile --codex --apply`）才尝试写入正式 `03-Resources/Curated`，且不覆盖已有卡片，异常保持 `hold`。
- 周度闭环：由 `run-researchkb-weekly.ps1 -Apply` 按“现有 Curated 编译 → Knowledge Iteration → usage 聚合 → 90 天升级判断 → Curated 到 Areas”顺序编排现有入口；不新增第二套 Curated 去重或来源规则。手动不带 `-Apply` 时所有步骤均为 no-write。
- Knowledge Iteration：由 `run-knowledge-maintenance-weekly.ps1` 生成 `00-Run-Summary.md`、`01-Input-Report.md`、`02-Curated-Changes.md`、`03-Promotion-Actions.md`、`04-Exceptions.md` 和 `run-manifest.json`。默认写入 `.harness/reports/Knowledge-Iteration/YYYY-Www`；显式 `-Apply` 才发布到 `03-Resources/_Reports/Knowledge-Iteration/YYYY-Www`。RAW 超过 180 天和 Reports 空间阈值只先评估；只有显式 `-ArchiveRaw`/`-ArchiveReports` 且同时 `-Apply` 才执行可验证的 Harness/Vault Archive 移动，永不永久删除。
- usage：只有显式调用 `knowledge_usage.py record --task-id <task> --resource <curated-id> --context <codex|project|output|skill>` 才记录真实 `effective_use`；读取、扫描、测试和维护不计 usage。同一任务/Curated ID 最多一条事件。`run-knowledge-usage-weekly.ps1` 只聚合 30/90 天统计到 `.harness/state/knowledge-usage.json`，不自动生成或补写使用事件。
- upgrade gate：由 `run-knowledge-upgrade-weekly.ps1` 读取 usage 聚合，按滚动 90 天、每个 Curated 的 `distinct_tasks >= 5` 生成 `.harness/state/knowledge-upgrade.json`。同一任务同一资源已在 usage 层幂等去重；只有无效/重复/缺失 Curated ID、Curated 不存在、来源身份不可追踪、usage 损坏等硬结构异常 `hold`，普通语义冲突和待补字段不阻断判断。
- Curated → Areas：由 `run-knowledge-areas-weekly.ps1` 读取升级决策。默认只把候选写入 `.harness/staging/knowledge-lifecycle/areas-proposals`；周度闭环显式 `-Apply` 也只能写入 `02-Areas/_Codex-Auto`，新文件必须保留 `derived_from`、Curated 路径和 SHA-256。已有正式 Areas 不作为自动目标；只有同一自动目录内且含唯一 `CODEX MANAGED: AREA` 区域的文件才可更新，人工内容和关系链接区域一律保留，异常 `hold`。
- 季度 Review：由 `run-quarterly-review.ps1` 和 `knowledge_review.py` 管理 `prepare → start → checkpoint → finalize → apply` 状态机。prepare 只生成上一季度输入包并提醒；用户回复“开始 Review”后每批询问 3–5 个问题，回答可中断恢复。日常升级不等待 Review；阈值、归档和非日常结构调整必须经过精确确认，永不永久删除。
- query：按优先级读取索引和 Markdown，生成带回链的检索报告；必要时可生成待审 Query 候选。
- lint：检查候选 Schema、来源锚点、重复身份、状态门槛和 Wiki 链接。

所有运行结果都写入 `.harness`；只有周度任务明确 `-Apply` 才执行受控 Curated/Areas/Reports 写入，手动入口默认 no-write。Review 的 apply 另需用户明确确认。
