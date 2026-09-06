---
title: "ResearchKB v3：Codex 驱动的自主知识迭代系统"
type: concept
knowledge_status: captured
review_status: pending
candidate_id: "candidate-20260812-researchkb-v3"
candidate_origin: "user-authorized-implementation"
source_ref: "https://x.com/karpathy/status/2039805659525644595; https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
source_manifest: "F:\\ResearchKB\\.harness\\knowledge-loop-v2-source-manifest.json"
requires_human_review: true
proposal_status: "implemented-draft"
implementation_root: "F:\\ResearchKB\\.harness"
---

# ResearchKB v3：Codex 驱动的自主知识迭代系统

> 本方案是 ResearchKB v3 的设计基线。文件本身仍是 00-Ideas 中的待审候选；代码和配置已经部署到 .harness，不代表任何科学知识自动获得验证状态。

## 核心模式

ResearchKB v3 将 Karpathy 的 Raw / Wiki / Schema 和 Ingest / Query / Lint 模式落地为：

原始资料 → 来源卡 → Codex 编译候选 → 人工审阅 → 正式知识 → Query/Lint/报告 → 新问题

- 03-Resources 是来源与证据层。
- 00-Ideas\v3-auto 是 Codex 自动生成的候选 Wiki 层。
- 02-Areas、01-Projects、05-Skills 是人工确认后的正式知识层。
- .harness 是 Codex 的执行、staging、日志和报告层。
- Obsidian 负责浏览和审阅，ObsUI v3 首版不作为自动执行依赖。

## 自动化边界

每日任务读取 Zotero Local API、本地导入目录和启用的公开元数据适配器，执行规范化、去重、来源卡、候选摘要和日报。每周任务检查重复、冲突、过期、孤立链接、缺失概念和可沉淀 Skill，并生成周报、证据矩阵和研究问题。

自动任务只允许新增候选到 00-Ideas\v3-auto 和 03-Resources\v3-auto。候选必须包含来源身份、URL/DOI 或本地路径、来源内容 SHA-256、运行编号和证据锚点；正式知识晋级、verified、reusable 和科学结论仍需人工确认。

Zotero 是书目和 PDF 权威源。X、知网、ScienceDirect 通过剪藏、RIS/BibTeX、PDF、DOI 或按需查询进入导入流，不使用绕过登录、反爬和访问限制的无人值守抓取。

## 运行入口

- scripts\researchkb_v3.py preflight
- scripts\researchkb_v3.py daily --dry-run --no-network
- scripts\researchkb_v3.py daily --network --codex --apply
- scripts\researchkb_v3.py weekly --codex
- scripts\researchkb_v3.py query --text "研究问题"
- scripts\researchkb_v3.py lint

全部运行首先写 .harness\staging、.harness\runs、.harness\reports 和 .harness\logs。没有 --apply 时不写正式 Vault；apply 仍只允许新建候选文件，不覆盖人工区域。

## 来源分级

第一版启用 Zotero、本地导入、OpenAlex 和 Crossref 元数据。官方 RSS/Atom 需要逐个加入白名单；X、知网和 ScienceDirect 保持手动导入/按需查询。

材料科学宽域查询集合配置在 .harness\config\source-registry.yaml，包括材料、增材制造、工艺、组织、性能、表征、相变、腐蚀、焊接、能源材料和材料机器学习等主题。

## 验收原则

同一 DOI、URL、Zotero key 或内容哈希重复运行不得重复生成候选；来源失败不得阻塞其他来源；候选不得自动晋级；受保护区域前后哈希必须一致；每次运行必须产生可追溯的 JSON 报告、Markdown 报告、scope hash 和失败明细。
