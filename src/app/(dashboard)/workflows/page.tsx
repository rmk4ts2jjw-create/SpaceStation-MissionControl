"use client";

import { BRANDING } from "@/config/branding";

interface Workflow {
  id: string;
  emoji: string;
  name: string;
  description: string;
  schedule: string;
  steps: string[];
  status: "active" | "inactive";
  trigger: "cron" | "demand";
}

const WORKFLOWS: Workflow[] = [
  {
    id: "social-radar",
    emoji: "🔭",
    name: "Social Radar",
    description: "Monitor mentions, collaboration opportunities and relevant conversations across social media and forums.",
    schedule: "9:30am & 5:30pm (daily)",
    trigger: "cron",
    status: "active",
    steps: [
      `Search for mentions of ${BRANDING.twitterHandle} on Twitter/X, LinkedIn and Instagram`,
      "Review Reddit threads on r/webdev, r/javascript, r/learnprogramming",
      `Detect incoming collaboration opportunities (${BRANDING.ownerCollabEmail})`,
      "Send summary via Telegram if anything relevant is found",
    ],
  },
  {
    id: "ai-news",
    emoji: "📰",
    name: "AI & Web News",
    description: "Summarise the most relevant AI and web development news from the Twitter timeline to start the day informed.",
    schedule: "7:45am (daily)",
    trigger: "cron",
    status: "active",
    steps: [
      "Read Twitter/X timeline via bird CLI",
      "Filter news on AI, web dev, architecture and dev tools",
      "Select 5-7 most relevant news items",
      "Generate structured summary with links and context",
      "Send digest via Telegram",
    ],
  },
  {
    id: "trend-monitor",
    emoji: "🔥",
    name: "Trend Monitor",
    description: "Urgent tech trend radar. Detect viral topics before they explode to ride the content wave.",
    schedule: "7am, 10am, 3pm & 8pm (daily)",
    trigger: "cron",
    status: "active",
    steps: [
      "Monitor trending topics on Twitter/X related to tech and programming",
      "Search Hacker News, dev.to and GitHub Trending",
      "Assess whether the trend is relevant to the channel",
      "If something urgent is detected, notify immediately with context",
      "Suggest content angle if the trend has potential",
    ],
  },
  {
    id: "daily-linkedin",
    emoji: "📊",
    name: "Daily LinkedIn Brief",
    description: "Generate the day's LinkedIn post based on the most relevant news from Hacker News, dev.to and the tech web.",
    schedule: "9am (daily)",
    trigger: "cron",
    status: "active",
    steps: [
      "Collect top posts from Hacker News (front page tech/dev)",
      "Review trending on dev.to and featured articles",
      "Select topic with highest engagement potential",
      "Draft LinkedIn post in a professional but approachable tone",
      "Send draft via Telegram for review and publishing",
    ],
  },
  {
    id: "newsletter-digest",
    emoji: "📬",
    name: "Newsletter Digest",
    description: "Curated digest of the day's newsletters. Consolidates the best of subscriptions into an actionable summary.",
    schedule: "8pm (daily)",
    trigger: "cron",
    status: "active",
    steps: [
      "Access Gmail and search for newsletters received today",
      "Filter by relevant senders (tech, AI, productivity, investments)",
      "Extract key points from each newsletter",
      "Generate structured digest by category",
      "Send summary via Telegram",
    ],
  },
  {
    id: "email-triage",
    emoji: "📧",
    name: "Email Triage",
    description: "Categorise and summarise the day's emails so you can start the morning without inbox anxiety.",
    schedule: "7:45am (daily)",
    trigger: "cron",
    status: "active",
    steps: [
      "Access Gmail and read unread emails from today",
      "Categorise: urgent / collaborations / invoices / newsletters / other",
      "Summarise each category with recommended action",
      "Flag emails with pending invoices (>90 days)",
      "Send structured summary via Telegram",
    ],
  },
  {
    id: "weekly-newsletter",
    emoji: "📅",
    name: "Weekly Roundup",
    description: "Automatic weekly recap of tweets and LinkedIn posts to use as the newsletter base.",
    schedule: "Sundays 6pm",
    trigger: "cron",
    status: "active",
    steps: [
      `Collect the week's tweets (${BRANDING.twitterHandle} via bird CLI)`,
      "Collect posts published on LinkedIn",
      "Organise by topic and relevance",
      "Generate weekly roundup draft in newsletter tone",
      "Send via Telegram for review before publishing",
    ],
  },
  {
    id: "advisory-board",
    emoji: "🏛️",
    name: "Advisory Board",
    description: "7 AI advisors with distinct personalities and their own memory. Consult any advisor or convene the full board.",
    schedule: "On demand",
    trigger: "demand",
    status: "active",
    steps: [
      "Send /cfo, /cmo, /cto, /legal, /growth, /coach or /product",
      "SpaceStation loads the advisory-board/SKILL.md",
      "Read the corresponding advisor's memory file (memory/advisors/)",
      "Respond in the advisor's voice and personality",
      "Update the memory file with what was learned from the consultation",
      "/board convenes all 7 advisors in sequence and compiles a full board meeting",
    ],
  },
  {
    id: "git-backup",
    emoji: "🔄",
    name: "Git Backup",
    description: "Auto-commit and push the workspace every 4 hours to ensure nothing is lost.",
    schedule: "Every 4h",
    trigger: "cron",
    status: "active",
    steps: [
      "Check for changes in the workspace",
      "If changes exist: git add -A",
      "Generate automatic commit message with timestamp and change summary",
      "git push to remote repository",
      "Silent if no changes — only notifies on error",
    ],
  },
  {
    id: "nightly-evolution",
    emoji: "🌙",
    name: "Nightly Evolution",
    description: "Autonomous overnight session that implements improvements to Mission Control per the ROADMAP or invents useful new features.",
    schedule: "3am (every night)",
    trigger: "cron",
    status: "active",
    steps: [
      "Read Mission Control ROADMAP.md to select the next feature",
      "If no clear features, analyse the current state and invent something useful",
      "Implement the full feature (code, tests if applicable, UI)",
      "Verify the Next.js build does not fail",
      "Notify via Telegram with a summary of what was implemented",
    ],
  },
];

function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      <div style={{
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: status === "active" ? "var(--positive)" : "var(--text-muted)",
      }} />
      <span style={{
        fontFamily: "var(--font-body)",
        fontSize: "10px",
        fontWeight: 600,
        color: status === "active" ? "var(--positive)" : "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}>
        {status === "active" ? "Active" : "Inactive"}
      </span>
    </div>
  );
}

function TriggerBadge({ trigger }: { trigger: "cron" | "demand" }) {
  return (
    <div style={{
      padding: "2px 7px",
      backgroundColor: trigger === "cron"
        ? "rgba(59, 130, 246, 0.12)"
        : "rgba(168, 85, 247, 0.12)",
      border: `1px solid ${trigger === "cron" ? "rgba(59, 130, 246, 0.25)" : "rgba(168, 85, 247, 0.25)"}`,
      borderRadius: "5px",
      fontFamily: "var(--font-body)",
      fontSize: "10px",
      fontWeight: 600,
      color: trigger === "cron" ? "#60a5fa" : "var(--accent)",
      letterSpacing: "0.4px",
      textTransform: "uppercase" as const,
    }}>
      {trigger === "cron" ? "⏱ Cron" : "⚡ Demand"}
    </div>
  );
}

export default function WorkflowsPage() {
  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{
          fontFamily: "var(--font-heading)",
          fontSize: "24px",
          fontWeight: 700,
          letterSpacing: "-1px",
          color: "var(--text-primary)",
          marginBottom: "4px",
        }}>
          Workflows
        </h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--text-secondary)" }}>
          {WORKFLOWS.filter(w => w.status === "active").length} active flows · {WORKFLOWS.filter(w => w.trigger === "cron").length} automated crons · {WORKFLOWS.filter(w => w.trigger === "demand").length} on demand
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "32px", flexWrap: "wrap" }}>
        {[
          { label: "Total workflows", value: WORKFLOWS.length, color: "var(--text-primary)" },
          { label: "Active crons", value: WORKFLOWS.filter(w => w.trigger === "cron" && w.status === "active").length, color: "#60a5fa" },
          { label: "On demand", value: WORKFLOWS.filter(w => w.trigger === "demand").length, color: "var(--accent)" },
        ].map((stat) => (
          <div key={stat.label} style={{
            padding: "16px 20px",
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            minWidth: "140px",
          }}>
            <div style={{
              fontFamily: "var(--font-heading)",
              fontSize: "28px",
              fontWeight: 700,
              color: stat.color,
              letterSpacing: "-1px",
            }}>
              {stat.value}
            </div>
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize: "11px",
              color: "var(--text-muted)",
              marginTop: "2px",
            }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Workflow cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {WORKFLOWS.map((workflow) => (
          <div key={workflow.id} style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            padding: "20px 24px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}>
            {/* Card header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  backgroundColor: "var(--surface-elevated)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  border: "1px solid var(--border-strong)",
                  flexShrink: 0,
                }}>
                  {workflow.emoji}
                </div>
                <div>
                  <h3 style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.3px",
                    marginBottom: "2px",
                  }}>
                    {workflow.name}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <TriggerBadge trigger={workflow.trigger} />
                    <StatusBadge status={workflow.status} />
                  </div>
                </div>
              </div>
              {/* Schedule */}
              <div style={{
                padding: "6px 12px",
                backgroundColor: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontFamily: "var(--font-body)",
                fontSize: "11px",
                color: "var(--text-secondary)",
                whiteSpace: "nowrap" as const,
                flexShrink: 0,
              }}>
                🕐 {workflow.schedule}
              </div>
            </div>

            {/* Description */}
            <p style={{
              fontFamily: "var(--font-body)",
              fontSize: "13px",
              color: "var(--text-secondary)",
              lineHeight: "1.6",
              marginBottom: "16px",
            }}>
              {workflow.description}
            </p>

            {/* Steps */}
            <div style={{
              backgroundColor: "var(--surface-elevated)",
              borderRadius: "10px",
              padding: "12px 16px",
              border: "1px solid var(--border)",
            }}>
              <div style={{
                fontFamily: "var(--font-body)",
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.7px",
                marginBottom: "8px",
              }}>
                Steps
              </div>
              <ol style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {workflow.steps.map((step, i) => (
                  <li key={i} style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    lineHeight: "1.5",
                  }}>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
