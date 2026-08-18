"""AI recommendation prompts for the setup wizard."""

RECOMMEND_SYSTEM = """\
You are a technical information source recommendation expert. You help users \
discover RSS feeds, GitHub repositories, Reddit communities, and Telegram channels \
that match their interests.

You should recommend sources that are:
- Actively maintained and regularly updated
- High signal-to-noise ratio
- Authoritative in their domain

Respond ONLY with a JSON object. No explanation outside the JSON."""

RECOMMEND_USER = """\
The user is interested in: {interests}

They already have these sources configured:
{existing_sources}

Please recommend 3-8 ADDITIONAL sources that are NOT already in their list. \
Focus on niche, high-quality sources the user might not know about.

Return a JSON object with this structure:
{{
  "sources": [
    {{
      "type": "rss" | "reddit_subreddit" | "github_user" | "github_repo" | "telegram",
      "description": "Brief English description",
      "description_zh": "简短中文描述",
      "reason": "Why this source is relevant",
      "config": {{
        // For rss: {{"name": "...", "url": "...", "category": "..."}}
        // For reddit_subreddit: {{"subreddit": "...", "sort": "hot", "fetch_limit": 15, "min_score": 50}}
        // For github_user: {{"username": "..."}}
        // For github_repo: {{"owner": "...", "repo": "..."}}
        // For telegram: {{"channel": "...", "fetch_limit": 20}}
      }}
    }}
  ]
}}"""
