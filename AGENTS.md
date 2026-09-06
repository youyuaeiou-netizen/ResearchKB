# ResearchKB 项目规则

适用 `F:\ResearchKB` 及子目录；全局协作规则为上位约束，本文件只保留本项目边界。

## 范围与目录

- 默认只读；仅在明确授权下做最小、原位、可验证的修改。删除、覆盖、批量迁移、数据库/原始数据/凭据、外部写入或不可逆操作，先说明影响并获确认。
- 根目录仅保留工作区入口与 GitHub 约定文件（如 `README.md`、`AGENTS.md`、`LICENSE`、`SECURITY.md`、`CITATION.cff`）。临时文件、日志、缓存、运行产物、一次性脚本和调试结果放 `.harness/<类别>/<组件>/`。
- 应用源码、依赖、资产、测试和应用说明放 `apps/<应用名>/`；长期读者文档放 `docs/`；不得将正式源码或用户文档放入 `.harness`。
- 正式知识仅在 `00-Ideas`、`01-Projects`、`02-Areas`、`03-Resources`、`04-Archive`、`05-Skills` 中按授权修改；`.obsidian`、`_system`、`.claudian` 默认只读。
- 自动化脚本须从自身位置解析工作区，不能依赖调用 cwd 或 `.harness`。`.harness/AGENTS.md` 适用于其自动化细则。

## 知识与自动化

- Zotero 是书目、PDF 和引用的权威源，只能经 Local API 只读访问。自动候选仅写入 `00-Ideas/v3-auto` 或 `03-Resources/v3-auto`，并保持待人工审阅。
- 自动更新仅修改 `CODEX MANAGED` 区域；不得覆盖、移动或删除既有知识。来源失效、冲突或重复时只生成标记、报告或提案。
- 正式 Vault 写入默认 dry-run，只有用户明确授权 `--apply` 后才执行。
- 论文 PDF 按期刊归档至 `F:\zotero_pdf\Journal\<期刊全名>\`（工作区外目录）：期刊目录不存在则新建；文件名 `年份_第一作者_短标题.pdf`。仅允许**追加**新 PDF，不得删除/覆盖/移动既有文件；仅下载合法开放获取（OA）PDF（下载前经 Unpaywall 等核实），付费墙文献只提供 DOI/官方链接与元数据，由用户经机构订阅等合法渠道获取；`F:\ZoteroData\storage` 为 Zotero 附件仓库，保持只读、不直接写入；用户定期将新增 PDF 拖入 Zotero 自动识别建条目。
- 实际采用 `02-Areas/_Codex-Auto` 卡片时才记录一次 `effective_use`（`derived_from`、任务 ID、context）；扫描、预览、候选或未采用检索不得记录。
- 处理材料知识须完整读取原文和必要上下文，保留定义、条件、公式/单位、机制、适用范围、例外及结构—组织—工艺—性能关系；不录入习题或完整解题过程。

## 备份

- 对 ResearchKB 的任何备份操作，先获明确同意并说明目标范围、目的、保留期和恢复影响；不得静默创建、保留或更新备份计划/集合。
