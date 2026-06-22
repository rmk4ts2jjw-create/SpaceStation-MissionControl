"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, CheckCircle2, Clock, AlertTriangle, Zap, Minus } from "lucide-react";

interface AgentStatus {
  id: string;
  name: string;
  emoji: string;
  status: "idle" | "working" | "stalled" | "error" | "offline";
  currentTask?: string;
  lastActivity?: string;
  taskCount: number;
  completedToday: number;
}

interface AgentMatrixProps {
  compact?: boolean;
}

const STATUS_CONFIG = {
  idle: { icon: Minus, color: "rgba(148,163,184,0.5)", label: "Idle", bg: "rgba(148,163,184,0.04)" },
  working: { icon: Zap, color: "#22c55e", label: "Working", bg: "rgba(34,197,94,0.06)" },
  stalled: { icon: Clock, color: "#f59e0b", label: "Stalled", bg: "rgba(251,191,36,0.06)" },
  error: { icon: AlertTriangle, color: "#ef4444", label: "Error", bg: "rgba(239,68,68,0.06)" },
  offline: { icon: Minus, color: "rgba(100,100,100,0.4)", label: "Offline", bg: "rgba(100,100,100,0.03)" },
};

const DEFAULT_AGENTS: AgentStatus[] = [
  { id: "main", name: "Space Monkey", emoji: "🐒", status: "working", currentTask: "Kanban DnD fix", lastActivity: "2m ago", taskCount: 3, completedToday: 12 },
  { id: "lifesupport", name: "Life Support", emoji: "🥷🏽", status: "idle", lastActivity: "15m ago", taskCount: 1, completedToday: 4 },
  { id: "engineer", name: "Engineer", emoji: "🔧", status: "idle", lastActivity: "1h ago", taskCount: 0, completedToday: 2 },
  { id: "archivist", name: "Archivist", emoji: "📚", status: "idle", lastActivity: "3h ago", taskCount: 0, completedToday: 1 },
];

export function AgentMatrix({ compact = false }: AgentMatrixProps) {
  const [agents, setAgents] = useState<AgentStatus[]>(DEFAULT_AGENTS);

  const fetchAgentStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.agents && data.agents.length > 0) {
          setAgents(data.agents);
        }
      }
    } catch {
      // Fallback to default agents if API unavailable
    }
  }, []);

  useEffect(() => {
    fetchAgentStatus();
    const interval = setInterval(fetchAgentStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchAgentStatus]);

  if (compact) {
    return (
      <div style={{
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
      }}>
        {agents.map((agent) => {
          const cfg = STATUS_CONFIG[agent.status];
          const StatusIcon = cfg.icon;
          return (
            <div
              key={agent.id}
              title={`${agent.name}: ${cfg.label}${agent.currentTask ? ` — ${agent.currentTask}` : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "8px",
                backgroundColor: cfg.bg,
                border: `1px solid ${cfg.color}22`,
                transition: "all 200ms ease",
              }}
            >
              <span style={{ fontSize: "14px" }}>{agent.emoji}</span>
              <StatusIcon style={{ width: "10px", height: "10px", color: cfg.color }} />
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                {agent.completedToday}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: "rgba(15, 15, 20, 0.6)",
      backdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: "16px",
      padding: "24px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Bot style={{ width: "16px", height: "16px", color: "rgba(255,255,255,0.5)" }} />
          <span style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.7)",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          }}>Agent Matrix</span>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: cfg.color }} />
              <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Matrix grid — agents as rows, status columns */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "180px 100px 1fr 80px 80px", gap: "12px", padding: "0 8px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Agent</span>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</span>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Current Task</span>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center" }}>Active</span>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center" }}>Done</span>
        </div>

        {/* Agent rows */}
        {agents.map((agent) => {
          const cfg = STATUS_CONFIG[agent.status];
          const StatusIcon = cfg.icon;
          return (
            <div
              key={agent.id}
              style={{
                display: "grid",
                gridTemplateColumns: "180px 100px 1fr 80px 80px",
                gap: "12px",
                alignItems: "center",
                padding: "10px 8px",
                borderRadius: "8px",
                backgroundColor: "rgba(255,255,255,0.01)",
                transition: "all 150ms ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.01)"; }}
            >
              {/* Agent name + emoji */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>{agent.emoji}</span>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{agent.name}</div>
                  <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", fontFamily: "'SF Mono', monospace" }}>{agent.id}</div>
                </div>
              </div>

              {/* Status badge */}
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <StatusIcon style={{ width: "10px", height: "10px", color: cfg.color }} />
                <span style={{ fontSize: "10px", color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
              </div>

              {/* Current task */}
              <div style={{
                fontSize: "11px",
                color: agent.currentTask ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)",
                fontStyle: agent.currentTask ? "normal" : "italic",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {agent.currentTask || "—"}
              </div>

              {/* Active count */}
              <div style={{ textAlign: "center" }}>
                <span style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: agent.taskCount > 0 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.15)",
                  fontFamily: "'SF Mono', monospace",
                }}>{agent.taskCount}</span>
              </div>

              {/* Completed today */}
              <div style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "3px" }}>
                <CheckCircle2 style={{ width: "10px", height: "10px", color: "rgba(34,197,94,0.4)" }} />
                <span style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "rgba(34,197,94,0.6)",
                  fontFamily: "'SF Mono', monospace",
                }}>{agent.completedToday}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
