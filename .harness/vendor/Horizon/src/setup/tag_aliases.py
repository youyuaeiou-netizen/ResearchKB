"""Tag alias lookup for multilingual matching in setup wizard.

Mirrors horizon-site/app/lib/tagAliases.ts — canonical tag -> aliases
(including Chinese, abbreviations, and common variations).
"""

TAG_ALIASES: dict[str, list[str]] = {
    "ai": ["人工智能", "AI", "artificial-intelligence"],
    "aigc": ["生成式AI", "生成式人工智能", "generative-ai"],
    "algorithms": ["算法", "Algorithms"],
    "analysis": ["分析", "Analysis"],
    "analytics": ["数据分析", "Analytics"],
    "android": ["Android", "安卓"],
    "angular": ["Angular"],
    "aws": ["AWS", "Amazon Web Services", "亚马逊云"],
    "azure": ["Azure", "微软云"],
    "backend": ["后端", "Backend"],
    "bigdata": ["大数据", "big-data", "Big Data"],
    "blockchain": ["区块链", "Blockchain", "Web3"],
    "c": ["C语言", "C"],
    "chinese": ["中文", "Chinese"],
    "cicd": ["CI/CD", "持续集成", "持续部署"],
    "cli": ["命令行", "CLI", "command-line"],
    "cpp": ["C++", "c++"],
    "cryptography": ["密码学", "加密"],
    "css": ["CSS", "样式"],
    "cv": ["计算机视觉", "CV", "computer-vision"],
    "dataeng": ["数据工程", "data-engineering", "Data Engineering"],
    "datascience": ["数据科学", "data-science", "Data Science"],
    "datastructure": ["数据结构", "data-structures", "Data Structures"],
    "defi": ["DeFi", "去中心化金融"],
    "designpattern": ["设计模式", "design-patterns", "Design Patterns"],
    "devops": ["DevOps"],
    "distributed": ["分布式系统", "distributed-systems"],
    "django": ["Django"],
    "dl": ["深度学习", "deep-learning", "神经网络"],
    "docker": ["Docker", "docker", "容器"],
    "editor": ["编辑器", "Editor"],
    "embedded": ["嵌入式", "Embedded"],
    "embodied": ["具身智能", "Embodied Intelligence"],
    "es": ["Elasticsearch", "elasticsearch", "搜索引擎"],
    "ethereum": ["以太坊", "Ethereum"],
    "flutter": ["Flutter"],
    "frontend": ["前端", "Frontend"],
    "gcp": ["GCP", "Google Cloud", "谷歌云"],
    "golang": ["Go", "Golang", "go语言"],
    "hardware": ["硬件", "Hardware"],
    "html": ["HTML"],
    "ios": ["iOS", "苹果开发"],
    "java": ["Java", "java语言"],
    "javascript": ["JavaScript", "JS", "js", "ECMAScript"],
    "k8s": ["Kubernetes", "kubernetes", "容器编排"],
    "kernel": ["内核", "Kernel"],
    "kotlin": ["Kotlin"],
    "linux": ["Linux", "linux"],
    "llm": ["大语言模型", "LLM", "large-language-model", "大模型"],
    "llm-inference": ["大模型推理", "LLM Inference", "llm-inference", "推理"],
    "maker": [],
    "microservice": ["微服务", "microservices", "Microservices"],
    "ml": ["机器学习", "machine-learning"],
    "mongo": ["MongoDB", "mongodb"],
    "mysql": ["MySQL", "mysql"],
    "neovim": ["Neovim", "neovim"],
    "news": ["新闻"],
    "nextjs": ["Next.js", "NextJS"],
    "nft": ["NFT", "非同质化代币"],
    "nlp": ["自然语言处理", "NLP", "natural-language-processing"],
    "nodejs": ["Node.js", "NodeJS", "node"],
    "os": ["操作系统", "operating-system"],
    "performance": ["性能优化", "Performance"],
    "php": ["PHP", "php语言"],
    "pl": ["编程语言", "programming-languages", "Programming Languages", "语言"],
    "postgres": ["PostgreSQL", "Postgres", "PG", "pg", "postgresql"],
    "python": ["Python", "python编程", "py"],
    "react": ["React", "ReactJS", "react.js"],
    "redis": ["Redis", "缓存"],
    "research": ["研究", "Research"],
    "rl": ["强化学习", "reinforcement-learning"],
    "rn": ["React Native", "react-native"],
    "robotics": [],
    "ruby": ["Ruby", "ruby语言"],
    "rust": ["Rust", "rust语言", "rust编程"],
    "science": ["科学", "Science"],
    "security": ["安全", "网络安全", "Security"],
    "serverless": ["无服务器", "Serverless"],
    "sglang": ["SGLang"],
    "smart-contract": ["智能合约", "smart-contracts", "Smart Contracts"],
    "spring": ["Spring", "Spring Boot"],
    "svelte": ["Svelte"],
    "swift": ["Swift"],
    "systems": ["系统"],
    "terminal": ["终端", "Terminal"],
    "terraform": ["Terraform", "IaC"],
    "testing": ["测试", "Testing"],
    "theory": ["理论", "Theory"],
    "tools": ["工具", "Tools"],
    "trending": ["趋势", "Trending"],
    "typescript": ["TypeScript", "TS", "ts"],
    "vue": ["Vue", "VueJS", "vue.js", "vue框架"],
    "zig": [],
}

# Reverse lookup: alias (lowercased) -> canonical tag
_REVERSE_MAP: dict[str, str] = {}
for _main, _aliases in TAG_ALIASES.items():
    _REVERSE_MAP[_main.lower()] = _main
    for _alias in _aliases:
        _REVERSE_MAP[_alias.lower()] = _main


def get_tag_aliases(tag: str) -> list[str]:
    """Return all aliases for a canonical tag (empty list if unknown)."""
    return TAG_ALIASES.get(tag.lower(), [])


def resolve_tag_alias(input_str: str) -> str:
    """Resolve a tag or alias to its canonical form (lowercased)."""
    normalized = input_str.lower().strip()
    resolved = _REVERSE_MAP.get(normalized)
    return resolved if resolved else normalized
