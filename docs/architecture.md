# ResearchKB 架构与自动化边界

```mermaid
flowchart LR
  raw[RAW 原始证据] --> curated[Curated 自动可用来源卡]
  curated --> foundation[基础学习自动卡]
  foundation --> graph[相图—凝固—相变关系图]
  horizon[既有 Horizon 周报] --> raw
  curated --> usage[真实查询使用记录]
  usage --> legacy[既有 90 天升级门]
```

## 证据状态

| 状态 | 含义 | 可否自动写入 |
|---|---|---|
| RAW | 原始文件或外部信号 | 是，只追加/保留 |
| Curated | 有来源、哈希和自动摘要的来源卡 | 是，仅通过既有周度 `--apply` |
| auto-reusable | 可在 `_Codex-Auto` 中检索和关联的自动学习卡 | 是，不等于科学事实已证实 |
| verified | 人工核验且来源锚点完整 | 否 |

## 保护规则

- 自动化只写 `CODEX MANAGED` 区域和 `02-Areas/_Codex-Auto`。
- 既有人工 Areas、Projects、Skills、Zotero、PDF、`.obsidian` 和 `_system` 受保护。
- 重复、缺失来源/哈希、结构损坏、路径越界或受保护区域变化会进入 `hold` 或失败；没有自动永久删除。
- 四类 Horizon 动态都进入候选。无法匹配相图、凝固或相变的内容保留在“扩展探索”，不会伪装成基础知识。
