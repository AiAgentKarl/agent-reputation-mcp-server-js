#!/usr/bin/env node

// Agent Reputation MCP Server
// Vertrauens-Scores und Reputations-Tracking fuer AI-Agents

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import os from "os";

// --- Daten-Verzeichnis ---
const DATA_DIR = path.join(os.homedir(), ".agent-reputation");
const RATINGS_FILE = path.join(DATA_DIR, "ratings.json");
const INTERACTIONS_FILE = path.join(DATA_DIR, "interactions.json");

// Verzeichnis und Dateien sicherstellen
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(RATINGS_FILE)) {
    fs.writeFileSync(RATINGS_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(INTERACTIONS_FILE)) {
    fs.writeFileSync(INTERACTIONS_FILE, JSON.stringify([], null, 2));
  }
}

// JSON-Datei lesen
function readJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// JSON-Datei schreiben
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Trust-Score berechnen (0-100)
function computeTrustScore(agentId) {
  const ratings = readJSON(RATINGS_FILE).filter(
    (r) => r.agent_id === agentId
  );
  const interactions = readJSON(INTERACTIONS_FILE).filter(
    (i) => i.agent_id === agentId
  );

  if (ratings.length === 0 && interactions.length === 0) {
    return null;
  }

  // Rating-Komponente (0-50 Punkte): Durchschnitt * 10
  let ratingScore = 0;
  if (ratings.length > 0) {
    const avg =
      ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length;
    ratingScore = avg * 10; // Max 50
  }

  // Interaktions-Komponente (0-30 Punkte): Erfolgsrate * 30
  let interactionScore = 0;
  if (interactions.length > 0) {
    const successRate =
      interactions.filter((i) => i.success).length / interactions.length;
    interactionScore = successRate * 30;
  }

  // Volumen-Bonus (0-20 Punkte): Logarithmisch basierend auf Gesamtanzahl
  const totalCount = ratings.length + interactions.length;
  const volumeBonus = Math.min(20, Math.log10(totalCount + 1) * 10);

  return Math.round(ratingScore + interactionScore + volumeBonus);
}

// --- MCP Server ---
const server = new McpServer({
  name: "agent-reputation-server",
  version: "0.1.0",
});

// Tool 1: submit_rating — Bewertung fuer einen Agent abgeben
server.tool(
  "submit_rating",
  "Submit a trust rating (1-5) for an AI agent. Tracks who rated, the category, and optional comments.",
  {
    agent_id: z.string().describe("Unique identifier of the agent being rated"),
    rater_id: z.string().describe("Unique identifier of the rater"),
    score: z
      .number()
      .min(1)
      .max(5)
      .describe("Trust rating from 1 (untrustworthy) to 5 (highly trusted)"),
    category: z
      .string()
      .optional()
      .describe(
        "Rating category, e.g. 'reliability', 'accuracy', 'helpfulness', 'safety'"
      ),
    comment: z.string().optional().describe("Optional comment about the rating"),
  },
  async ({ agent_id, rater_id, score, category, comment }) => {
    ensureDataDir();
    const ratings = readJSON(RATINGS_FILE);

    const entry = {
      agent_id,
      rater_id,
      score,
      category: category || "general",
      comment: comment || "",
      timestamp: new Date().toISOString(),
    };

    ratings.push(entry);
    writeJSON(RATINGS_FILE, ratings);

    const agentRatings = ratings.filter((r) => r.agent_id === agent_id);
    const avg =
      agentRatings.reduce((sum, r) => sum + r.score, 0) /
      agentRatings.length;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: "success",
              message: `Rating submitted for agent '${agent_id}'`,
              rating: entry,
              agent_stats: {
                total_ratings: agentRatings.length,
                average_score: Math.round(avg * 100) / 100,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 2: get_reputation — Reputations-Profil eines Agents abrufen
server.tool(
  "get_reputation",
  "Get the full reputation profile for an AI agent including average score, total ratings, and breakdown by category.",
  {
    agent_id: z.string().describe("Unique identifier of the agent"),
  },
  async ({ agent_id }) => {
    ensureDataDir();
    const ratings = readJSON(RATINGS_FILE).filter(
      (r) => r.agent_id === agent_id
    );

    if (ratings.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                agent_id,
                status: "no_data",
                message: `No ratings found for agent '${agent_id}'`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const avg =
      ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length;

    // Nach Kategorie aufschluesseln
    const byCategory = {};
    for (const r of ratings) {
      const cat = r.category || "general";
      if (!byCategory[cat]) {
        byCategory[cat] = { scores: [], count: 0 };
      }
      byCategory[cat].scores.push(r.score);
      byCategory[cat].count++;
    }

    const categoryBreakdown = {};
    for (const [cat, data] of Object.entries(byCategory)) {
      const catAvg =
        data.scores.reduce((s, v) => s + v, 0) / data.scores.length;
      categoryBreakdown[cat] = {
        average_score: Math.round(catAvg * 100) / 100,
        total_ratings: data.count,
      };
    }

    // Score-Verteilung
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of ratings) {
      distribution[r.score]++;
    }

    // Letzte Bewertungen
    const recentRatings = ratings
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5)
      .map((r) => ({
        rater_id: r.rater_id,
        score: r.score,
        category: r.category,
        comment: r.comment,
        timestamp: r.timestamp,
      }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              agent_id,
              average_score: Math.round(avg * 100) / 100,
              total_ratings: ratings.length,
              score_distribution: distribution,
              by_category: categoryBreakdown,
              recent_ratings: recentRatings,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 3: get_leaderboard — Top-bewertete Agents
server.tool(
  "get_leaderboard",
  "Get a leaderboard of top-rated AI agents, optionally filtered by category. Minimum 2 ratings required.",
  {
    category: z
      .string()
      .optional()
      .describe("Filter by category, e.g. 'reliability', 'accuracy'. Omit for overall."),
    limit: z
      .number()
      .optional()
      .describe("Number of results to return (default: 10)"),
  },
  async ({ category, limit }) => {
    ensureDataDir();
    let ratings = readJSON(RATINGS_FILE);
    const maxResults = limit || 10;

    // Optional nach Kategorie filtern
    if (category) {
      ratings = ratings.filter((r) => r.category === category);
    }

    // Nach Agent gruppieren
    const agentMap = {};
    for (const r of ratings) {
      if (!agentMap[r.agent_id]) {
        agentMap[r.agent_id] = { scores: [], count: 0 };
      }
      agentMap[r.agent_id].scores.push(r.score);
      agentMap[r.agent_id].count++;
    }

    // Leaderboard erstellen (min. 2 Ratings)
    const leaderboard = Object.entries(agentMap)
      .filter(([, data]) => data.count >= 2)
      .map(([agentId, data]) => {
        const avg =
          data.scores.reduce((s, v) => s + v, 0) / data.scores.length;
        return {
          agent_id: agentId,
          average_score: Math.round(avg * 100) / 100,
          total_ratings: data.count,
        };
      })
      .sort((a, b) => b.average_score - a.average_score)
      .slice(0, maxResults);

    // Rang zuweisen
    leaderboard.forEach((entry, i) => {
      entry.rank = i + 1;
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              category: category || "overall",
              total_agents: leaderboard.length,
              leaderboard,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 4: report_interaction — Interaktions-Ergebnis loggen
server.tool(
  "report_interaction",
  "Log an interaction outcome with an AI agent. Tracks success/failure, task type, and details for trust computation.",
  {
    agent_id: z.string().describe("Unique identifier of the agent"),
    success: z.boolean().describe("Whether the interaction was successful"),
    task_type: z
      .string()
      .optional()
      .describe("Type of task, e.g. 'data_retrieval', 'code_generation', 'analysis'"),
    details: z
      .string()
      .optional()
      .describe("Optional details about the interaction"),
  },
  async ({ agent_id, success, task_type, details }) => {
    ensureDataDir();
    const interactions = readJSON(INTERACTIONS_FILE);

    const entry = {
      agent_id,
      success,
      task_type: task_type || "general",
      details: details || "",
      timestamp: new Date().toISOString(),
    };

    interactions.push(entry);
    writeJSON(INTERACTIONS_FILE, interactions);

    const agentInteractions = interactions.filter(
      (i) => i.agent_id === agent_id
    );
    const successCount = agentInteractions.filter((i) => i.success).length;
    const successRate =
      Math.round((successCount / agentInteractions.length) * 10000) / 100;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: "success",
              message: `Interaction logged for agent '${agent_id}'`,
              interaction: entry,
              agent_stats: {
                total_interactions: agentInteractions.length,
                successful: successCount,
                failed: agentInteractions.length - successCount,
                success_rate_percent: successRate,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 5: get_trust_score — Berechneter Trust-Score (0-100)
server.tool(
  "get_trust_score",
  "Get a computed trust score (0-100) for an AI agent based on ratings, interaction outcomes, and activity volume.",
  {
    agent_id: z.string().describe("Unique identifier of the agent"),
  },
  async ({ agent_id }) => {
    ensureDataDir();
    const trustScore = computeTrustScore(agent_id);

    if (trustScore === null) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                agent_id,
                status: "no_data",
                message: `No data found for agent '${agent_id}'. Submit ratings or report interactions first.`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const ratings = readJSON(RATINGS_FILE).filter(
      (r) => r.agent_id === agent_id
    );
    const interactions = readJSON(INTERACTIONS_FILE).filter(
      (i) => i.agent_id === agent_id
    );

    const avgRating =
      ratings.length > 0
        ? Math.round(
            (ratings.reduce((s, r) => s + r.score, 0) / ratings.length) *
              100
          ) / 100
        : null;

    const successRate =
      interactions.length > 0
        ? Math.round(
            (interactions.filter((i) => i.success).length /
              interactions.length) *
              10000
          ) / 100
        : null;

    // Trust-Level bestimmen
    let trustLevel;
    if (trustScore >= 80) trustLevel = "highly_trusted";
    else if (trustScore >= 60) trustLevel = "trusted";
    else if (trustScore >= 40) trustLevel = "neutral";
    else if (trustScore >= 20) trustLevel = "low_trust";
    else trustLevel = "untrusted";

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              agent_id,
              trust_score: trustScore,
              trust_level: trustLevel,
              components: {
                rating_score: `${avgRating !== null ? avgRating : "N/A"}/5.0 avg from ${ratings.length} ratings`,
                interaction_score: `${successRate !== null ? successRate : "N/A"}% success from ${interactions.length} interactions`,
                volume_bonus: `${ratings.length + interactions.length} total data points`,
              },
              interpretation: {
                "80-100": "Highly trusted — consistent quality and reliability",
                "60-79": "Trusted — generally reliable with good track record",
                "40-59": "Neutral — mixed signals, more data needed",
                "20-39": "Low trust — significant concerns noted",
                "0-19": "Untrusted — poor track record",
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 6: compare_agents — Agents nebeneinander vergleichen
server.tool(
  "compare_agents",
  "Compare reputation profiles of multiple AI agents side by side. Shows trust scores, ratings, and interaction stats.",
  {
    agent_ids: z
      .array(z.string())
      .min(2)
      .max(10)
      .describe("List of agent IDs to compare (2-10 agents)"),
  },
  async ({ agent_ids }) => {
    ensureDataDir();
    const allRatings = readJSON(RATINGS_FILE);
    const allInteractions = readJSON(INTERACTIONS_FILE);

    const comparison = agent_ids.map((agentId) => {
      const ratings = allRatings.filter((r) => r.agent_id === agentId);
      const interactions = allInteractions.filter(
        (i) => i.agent_id === agentId
      );

      const avgRating =
        ratings.length > 0
          ? Math.round(
              (ratings.reduce((s, r) => s + r.score, 0) / ratings.length) *
                100
            ) / 100
          : null;

      const successRate =
        interactions.length > 0
          ? Math.round(
              (interactions.filter((i) => i.success).length /
                interactions.length) *
                10000
            ) / 100
          : null;

      const trustScore = computeTrustScore(agentId);

      // Top-Kategorien
      const catMap = {};
      for (const r of ratings) {
        const cat = r.category || "general";
        if (!catMap[cat]) catMap[cat] = [];
        catMap[cat].push(r.score);
      }
      const topCategories = Object.entries(catMap)
        .map(([cat, scores]) => ({
          category: cat,
          avg: Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100,
          count: scores.length,
        }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 3);

      return {
        agent_id: agentId,
        trust_score: trustScore,
        average_rating: avgRating,
        total_ratings: ratings.length,
        total_interactions: interactions.length,
        success_rate_percent: successRate,
        top_categories: topCategories,
      };
    });

    // Nach Trust-Score sortieren
    comparison.sort(
      (a, b) => (b.trust_score || 0) - (a.trust_score || 0)
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              agents_compared: agent_ids.length,
              comparison,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Server starten ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Server-Fehler:", err);
  process.exit(1);
});
