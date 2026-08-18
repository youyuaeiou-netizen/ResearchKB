---
type: system-rule
title: 知识、技能与项目卡表示规则
knowledge_status: reusable
---

# 知识、技能与项目卡表示规则

本规则用于 ObsUI 新晋升卡。它不要求修改既有 Areas、Skills 或 Projects 历史正文。

## 共同底线

- 保留原有 `type`，用 `record_kind` 区分 `knowledge`、`skill`、`project`。
- 每张新卡必须有摘要、关键词、晋升来源路径、来源 SHA-256 和决策 ID。
- 原候选正文完整保留在 `PROMOTED EVIDENCE` 区，作为来源证据，不重写、不摘要替代。
- `CODEX MANAGED: DRAFT` 是唯一可由经任务包授权的 Codex 填写的区域；“我的判断”及其他人工区不覆盖。
- Codex 草稿不能修改 `verified`、`reusable` 或其他状态，也不能替代人工审核。

## 三类卡

| 存放位置 | `record_kind` | 晋升时必填 | 正文重点 |
| --- | --- | --- | --- |
| `02-Areas` | `knowledge` | 定义/适用范围 | 主张、证据、条件与例外 |
| `05-Skills` | `skill` | 目标、前置条件、验收标准 | 步骤、回退与可验证输出 |
| `01-Projects` | `project` | 目标、当前状态、下一步 | 里程碑、风险、决策与下一步 |

## 协作方式

已晋升记录可在 ObsUI 中预览、复制或生成 Vault 外的 Codex 撰写任务 Markdown。任务包含目标绝对路径、预期 SHA、来源锚点及仅可编辑草稿区的边界。用户主动把任务交给 Codex；不存在 ObsUI 到 Codex app 的直接会话连接。

模板：[[_system/templates/knowledge-card.md|知识卡]]、[[_system/templates/skill-card.md|技能卡]]、[[_system/templates/project-card.md|项目卡]]。
