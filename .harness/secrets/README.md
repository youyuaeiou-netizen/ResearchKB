# ResearchKB v3 本地密钥目录

此目录只保存用户本人在本机配置的可选密钥；脚本、报告、`staging`、日志和正式 Vault 均不得记录密钥值。

当前支持可选的 GitHub 公共 API 令牌和可选的 Apify 令牌。若未创建 `horizon.env`，公开 GitHub 仍可抓取；X 采集则会安全跳过。

创建 `horizon.env`（不要把它发到聊天、Obsidian 或 Git 仓库）：

```dotenv
RESEARCHKB_GITHUB_TOKEN=github_pat_替换为你的真实令牌
# 只有在你确认启用 X/Apify 后才填写；不要把它发给 Codex 或聊天
APIFY_TOKEN=apify_api_替换为你的真实令牌
```

GitHub 令牌只需最小只读权限。Apify 令牌只用于 Horizon 的 `altimis~scweet` X 采集；当前方案仅采集已审核账号的 profile 时间线，禁止关键词搜索和回复扩展。不要在此文件填写 OpenAI、Claude、Gemini、Codex 或其他模型凭据；Horizon 外部 AI 始终关闭。

费用边界：本方案将 Apify Free 计划的每月 $5 额度中的最高 $4.50 设为本地月度预留上限，确保至少保留 10% 额度；每次运行另设 $0.145 的 Apify Actor 费用上限。达到任一限制或发生失败时不重试、不升级付费套餐。Scweet 当前将小于 100 的请求上限提升为 100，因此每天最多一次、每月最多预留 31 次/3,100 条；31 × $0.145 = $4.495。本方案另向 Actor 传入 UTC `since`/`until` 和 `exclude_replies`，实际返回量通常会低于请求上限。单次费用上限和本地预留不涵盖账户中其他 Actor 或后续数据存储读取的费用；请在 Apify 控制台保持 Free 计划并检查用量。
