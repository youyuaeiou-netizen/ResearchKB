# 中文快速开始

## 目标

用合成或本地已有 RAW 内容验证流程，不联网、不消耗 Apify、不写入正式知识库。

## 环境

- Windows PowerShell 7
- Python 3.11+
- 可选：Obsidian 与 Zotero；首次 dry-run 不需要它们

## 验证

```powershell
git clone https://github.com/youyuaeiou-netizen/ResearchKB.git
Set-Location ResearchKB
python -m pip install -r .harness\requirements-test.txt
python -m unittest discover -s .harness\tests -v
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile -File .harness\tasks\run-researchkb-weekly.ps1 -NoWrite
```

成功时，周度入口只输出扫描/评估结果，不创建 Curated、Areas、报告或 usage 状态。

## 现有自动化任务

ResearchKB 不会为基础学习新增计划任务。现有 `Horizon 科研与 AI 工程周报` 在既有周报成功后，调用既有周度入口；后者可将来源完整的 Curated 卡映射到 `02-Areas/_Codex-Auto/基础学习`。计划任务必须先经过一次明确、范围受限的 `--apply` 授权；不要手工改写预算状态或密钥。

Horizon 只承担外部信号发现。相图、凝固和相变的定义、条件、公式与单位仍应以教材、论文、Zotero 文献和用户导入资料为依据。
