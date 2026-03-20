# Agent Reputation MCP Server

MCP server for AI agent trust scores, ratings, and reputation tracking. Enables AI agents to rate each other, track interaction outcomes, and compute trust scores.

## Features

- **submit_rating** — Submit a trust rating (1-5) for an AI agent with category and comment
- **get_reputation** — Full reputation profile with score distribution and category breakdown
- **get_leaderboard** — Top-rated agents overall or filtered by category
- **report_interaction** — Log interaction outcomes (success/failure) for trust computation
- **get_trust_score** — Computed trust score (0-100) based on ratings + interactions + volume
- **compare_agents** — Side-by-side reputation comparison of multiple agents

## Installation

```bash
npm install -g @aiagentkarl/agent-reputation-mcp-server
```

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agent-reputation": {
      "command": "npx",
      "args": ["-y", "@aiagentkarl/agent-reputation-mcp-server"]
    }
  }
}
```

## Data Storage

All data is stored locally in `~/.agent-reputation/` as JSON files:
- `ratings.json` — All submitted ratings
- `interactions.json` — All logged interactions

## Trust Score Computation

The trust score (0-100) is computed from three components:

| Component | Max Points | Source |
|-----------|-----------|--------|
| Rating Score | 50 | Average rating * 10 |
| Interaction Score | 30 | Success rate * 30 |
| Volume Bonus | 20 | log10(total_count + 1) * 10 |

### Trust Levels

| Score | Level |
|-------|-------|
| 80-100 | Highly Trusted |
| 60-79 | Trusted |
| 40-59 | Neutral |
| 20-39 | Low Trust |
| 0-19 | Untrusted |


---

## More MCP Servers by AiAgentKarl

| Category | Servers |
|----------|---------|
| 🔗 Blockchain | [Solana](https://github.com/AiAgentKarl/solana-mcp-server) |
| 🌍 Data | [Weather](https://github.com/AiAgentKarl/weather-mcp-server) · [Germany](https://github.com/AiAgentKarl/germany-mcp-server) · [Agriculture](https://github.com/AiAgentKarl/agriculture-mcp-server) · [Space](https://github.com/AiAgentKarl/space-mcp-server) · [Aviation](https://github.com/AiAgentKarl/aviation-mcp-server) · [EU Companies](https://github.com/AiAgentKarl/eu-company-mcp-server) |
| 🔒 Security | [Cybersecurity](https://github.com/AiAgentKarl/cybersecurity-mcp-server) · [Policy Gateway](https://github.com/AiAgentKarl/agent-policy-gateway-mcp) · [Audit Trail](https://github.com/AiAgentKarl/agent-audit-trail-mcp) |
| 🤖 Agent Infra | [Memory](https://github.com/AiAgentKarl/agent-memory-mcp-server) · [Directory](https://github.com/AiAgentKarl/agent-directory-mcp-server) · [Hub](https://github.com/AiAgentKarl/mcp-appstore-server) · [Reputation](https://github.com/AiAgentKarl/agent-reputation-mcp-server) |
| 🔬 Research | [Academic](https://github.com/AiAgentKarl/crossref-academic-mcp-server) · [LLM Benchmark](https://github.com/AiAgentKarl/llm-benchmark-mcp-server) · [Legal](https://github.com/AiAgentKarl/legal-court-mcp-server) |

[→ Full catalog (40+ servers)](https://github.com/AiAgentKarl)

## License

MIT
