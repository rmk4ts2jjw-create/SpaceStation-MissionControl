"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  ShieldAlert,
  Zap,
  Clock,
  CheckCircle2,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Tag,
  User,
  Bell,
  BellOff,
  ArrowUpCircle,
  XCircle,
} from "lucide-react";

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  owner: string;
  acknowledged: boolean;
  escalated: boolean;
  opened: string;
  lastActivity: string;
  summary: string;
  tags: string[];
  timeline: Array<{ ts: string; message: string }>;
  actions: string[];
  actionsGenerated: boolean;
  _recurrence: number | null;
  _fingerprint: string;
}

interface IncidentsResponse {
  incidents: Incident[];
  total: number;
  error?: string;
}

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string; icon: typeof AlertTriangle; label: string }> = {
  P1: {
    bg: "rgba(239, 68, 68, 0.10)",
    text: "#ef4444",
    border: "rgba(239, 68, 68, 0.35)",
    icon: ShieldAlert,
    label: "CRITICAL",
  },
  P2: {
    bg: "rgba(251, 191, 36, 0.10)",
    text: "#f59e0b",
    border: "rgba(251, 191, 36, 0.35)",
    icon: AlertTriangle,
    label: "HIGH",
  },
  P3: {
    bg: "rgba(139, 92, 246, 0.10)",
    text: "#8b5cf6",
    border: "rgba(139, 92, 246, 0.35)",
    icon: Zap,
    label: "ELEVATED",
  },
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  TRIAGE: {
    bg: "rgba(251, 191, 36, 0.10)",
    text: "#f59e0b",
    border: "rgba(251, 191, 36, 0.35)",
    label: "TRIAGE",
  },
  MITIGATING: {
    bg: "rgba(139, 92, 246, 0.10)",
    text: "#8b5cf6",
    border: "rgba(139, 92, 246, 0.35)",
    label: "INVESTIGATING",
  },
  AWAITING_REVIEW: {
    bg: "rgba(34, 211, 238, 0.10)",
    text: "#22d3ee",
    border: "rgba(34, 211, 238, 0.35)",
    label: "REVIEW",
  },
  RESOLVED: {
    bg: "rgba(52, 211, 153, 0.10)",
    text: "#34d399",
    border: "rgba(52, 211, 153, 0.35)",
    label: "RESOLVED",
  },
};

function timeAgo(ts: string): string {
  if (!ts) return "—";
  const date = new Date(ts);
  if (isNaN(date.getTime())) return ts;
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function IncidentRow({
  incident,
  expanded,
  onToggle,
  onResolve,
  onAcknowledge,
  onEscalate,
  loading,
}: {
  incident: Incident;
  expanded: boolean;
  onToggle: () => void;
  onResolve: () => void;
  onAcknowledge: () => void;
  onEscalate: () => void;
  loading: boolean;
}) {
  const sevConfig = SEVERITY_CONFIG[incident.severity] || {
    bg: "rgba(100,100,100,0.1)",
    text: "#888",
    border: "rgba(100,100,100,0.3)",
    icon: AlertTriangle,
    label: incident.severity || "—",
  };
  const statusConfig = STATUS_CONFIG[incident.status] || {
    bg: "rgba(100,100,100,0.1)",
    text: "#888",
    border: "rgba(100,100,100,0.3)",
    label: incident.status || "—",
  };
  const SevIcon = sevConfig.icon;
  const isTriaged = incident.status === "TRIAGE";

  return (
    <div
      style={{
        backgroundColor: "var(--card-elevated)",
        border: `1px solid ${expanded ? sevConfig.border : "var(--border)"}`,
        borderRadius: "10px",
        marginBottom: "8px",
        overflow: "hidden",
        transition: "all 150ms ease",
      }}
    >
      {/* Main row */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 16px",
          cursor: "pointer",
          minHeight: "56px",
        }}
      >
        {/* Severity icon */}
        <SevIcon style={{ width: "18px", height: "18px", color: sevConfig.text, flexShrink: 0 }} />

        {/* Severity tag */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            backgroundColor: sevConfig.bg,
            color: sevConfig.text,
            border: `1px solid ${sevConfig.border}`,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {sevConfig.label}
        </span>

        {/* Incident ID */}
        <span
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--text-secondary)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {incident.id}
        </span>

        {/* Title */}
        <div
          style={{
            flex: 1,
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {incident.title}
        </div>

        {/* Recurrence badge */}
        {incident._recurrence && incident._recurrence > 1 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
              padding: "2px 6px",
              borderRadius: "10px",
              fontSize: "10px",
              fontWeight: 600,
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              color: "#ef4444",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            ×{incident._recurrence}
          </span>
        )}

        {/* Last activity */}
        <span
          style={{
            fontSize: "11px",
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
            flexShrink: 0,
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          {timeAgo(incident.lastActivity)}
        </span>

        {/* Status badge */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            backgroundColor: statusConfig.bg,
            color: statusConfig.text,
            border: `1px solid ${statusConfig.border}`,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {statusConfig.label}
        </span>

        {/* Expand indicator */}
        {expanded ? (
          <ChevronDown style={{ width: "14px", height: "14px", color: "var(--text-muted)", flexShrink: 0 }} />
        ) : (
          <ChevronRight style={{ width: "14px", height: "14px", color: "var(--text-muted)", flexShrink: 0 }} />
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            padding: "0 16px 16px",
            borderTop: "1px solid var(--border)",
            backgroundColor: "rgba(0,0,0,0.15)",
          }}
        >
          {/* Summary */}
          {incident.summary && (
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                lineHeight: "1.6",
                marginTop: "12px",
                marginBottom: "12px",
              }}
            >
              {incident.summary}
            </p>
          )}

          {/* Meta row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              fontSize: "11px",
              color: "var(--text-muted)",
              marginBottom: "12px",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <User style={{ width: "12px", height: "12px" }} />
              {incident.owner}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <Clock style={{ width: "12px", height: "12px" }} />
              Opened {timeAgo(incident.opened)}
            </span>
            {incident.acknowledged && (
              <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--success)" }}>
                <CheckCircle2 style={{ width: "12px", height: "12px" }} />
                Acknowledged
              </span>
            )}
            {incident.escalated && (
              <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--warning)" }}>
                <ArrowUpCircle style={{ width: "12px", height: "12px" }} />
                Escalated
              </span>
            )}
          </div>

          {/* Tags */}
          {incident.tags && incident.tags.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                marginBottom: "12px",
                flexWrap: "wrap",
              }}
            >
              <Tag style={{ width: "12px", height: "12px", color: "var(--text-muted)" }} />
              {incident.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: "10px",
                    padding: "1px 6px",
                    borderRadius: "3px",
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Quick Actions — only for TRIAGE incidents */}
          {isTriaged && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                paddingTop: "12px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "1px",
                  color: "var(--text-muted)",
                  marginRight: "4px",
                }}
              >
                QUICK ACTIONS
              </span>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onResolve();
                }}
                disabled={loading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 12px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.5 : 1,
                  backgroundColor: "rgba(52, 211, 153, 0.10)",
                  color: "#34d399",
                  border: "1px solid rgba(52, 211, 153, 0.35)",
                  transition: "all 150ms ease",
                }}
              >
                <CheckCircle2 style={{ width: "13px", height: "13px" }} />
                Resolve
              </button>

              {!incident.acknowledged && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAcknowledge();
                  }}
                  disabled={loading}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 12px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.5 : 1,
                    backgroundColor: "rgba(251, 191, 36, 0.10)",
                    color: "#f59e0b",
                    border: "1px solid rgba(251, 191, 36, 0.35)",
                    transition: "all 150ms ease",
                  }}
                >
                  <Bell style={{ width: "13px", height: "13px" }} />
                  Acknowledge
                </button>
              )}

              {!incident.escalated && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEscalate();
                  }}
                  disabled={loading}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 12px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.5 : 1,
                    backgroundColor: "rgba(239, 68, 68, 0.10)",
                    color: "#ef4444",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    transition: "all 150ms ease",
                  }}
                >
                  <ArrowUpCircle style={{ width: "13px", height: "13px" }} />
                  Escalate
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch("/api/incidents");
      const data: IncidentsResponse = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setIncidents(data.incidents);
      }
    } catch (err) {
      setError("Failed to fetch incidents");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 30000);
    return () => clearInterval(interval);
  }, [fetchIncidents]);

  const handleAction = async (incidentId: string, action: string) => {
    setActionLoading(incidentId);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, action }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchIncidents();
        // Collapse the incident after action
        if (action === "resolve") {
          setExpandedId(null);
        }
      } else {
        console.error("Action failed:", data.error);
      }
    } catch (err) {
      console.error("Action error:", err);
    } finally {
      setActionLoading(null);
    }
  };

  // Apply filters
  const filtered = incidents.filter((i) => {
    if (filterSeverity !== "all" && i.severity !== filterSeverity) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    return true;
  });

  // Sort: TRIAGE first, then by lastActivity descending
  const sorted = [...filtered].sort((a, b) => {
    // TRIAGE first
    if (a.status === "TRIAGE" && b.status !== "TRIAGE") return -1;
    if (b.status === "TRIAGE" && a.status !== "TRIAGE") return 1;
    // Then by severity (P1 > P2 > P3)
    const sevOrder = { P1: 0, P2: 1, P3: 2 };
    const sevA = sevOrder[a.severity as keyof typeof sevOrder] ?? 9;
    const sevB = sevOrder[b.severity as keyof typeof sevOrder] ?? 9;
    if (sevA !== sevB) return sevA - sevB;
    // Then by lastActivity desc
    return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
  });

  // Summary counts
  const triageCount = incidents.filter((i) => i.status === "TRIAGE").length;
  const resolvedCount = incidents.filter((i) => i.status === "RESOLVED").length;
  const p1Count = incidents.filter((i) => i.severity === "P1" && i.status !== "RESOLVED").length;
  const p2Count = incidents.filter((i) => i.severity === "P2" && i.status !== "RESOLVED").length;

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                border: "2px solid var(--accent)",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading incidents…</span>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      {/* Page Header */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1
              className="text-2xl md:text-3xl font-bold mb-1"
              style={{
                fontFamily: "var(--font-heading)",
                color: "var(--text-primary)",
                letterSpacing: "-1.5px",
              }}
            >
              ⚠️ Incidents & Alerts
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
              {incidents.length} total · {triageCount} triage · {p1Count} P1 · {p2Count} P2
            </p>
          </div>
          <button
            onClick={fetchIncidents}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              transition: "all 150ms ease",
            }}
          >
            <RefreshCw style={{ width: "14px", height: "14px" }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <Filter style={{ width: "14px", height: "14px", color: "var(--text-muted)" }} />

        {/* Severity filter */}
        <div style={{ display: "flex", gap: "4px" }}>
          {["all", "P1", "P2", "P3"].map((s) => {
            const isActive = filterSeverity === s;
            const config = s === "all" ? null : SEVERITY_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => setFilterSeverity(s)}
                style={{
                  padding: "3px 10px",
                  borderRadius: "4px",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  cursor: "pointer",
                  border: `1px solid ${isActive ? (config?.border || "var(--accent)") : "var(--border)"}`,
                  backgroundColor: isActive ? (config?.bg || "var(--accent-soft)") : "transparent",
                  color: isActive ? (config?.text || "var(--accent)") : "var(--text-muted)",
                  transition: "all 150ms ease",
                }}
              >
                {s === "all" ? "All Sev." : s}
              </button>
            );
          })}
        </div>

        {/* Status filter */}
        <div style={{ display: "flex", gap: "4px" }}>
          {["all", "TRIAGE", "RESOLVED"].map((s) => {
            const isActive = filterStatus === s;
            const label = s === "all" ? "All" : s === "TRIAGE" ? "Triage" : "Resolved";
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: "3px 10px",
                  borderRadius: "4px",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  cursor: "pointer",
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                  backgroundColor: isActive ? "var(--accent-soft)" : "transparent",
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  transition: "all 150ms ease",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Error indicator */}
        {error && (
          <span style={{ fontSize: "11px", color: "var(--error)", marginLeft: "auto" }}>
            ⚠ {error}
          </span>
        )}

        {/* Result count */}
        <span
          style={{
            fontSize: "11px",
            color: "var(--text-muted)",
            marginLeft: "auto",
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          {sorted.length} shown
        </span>
      </div>

      {/* Incident list */}
      {sorted.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px",
            color: "var(--text-muted)",
            fontSize: "14px",
          }}
        >
          <CheckCircle2 style={{ width: "32px", height: "32px", margin: "0 auto 12px", opacity: 0.3 }} />
          No incidents match the current filters.
        </div>
      ) : (
        <div>
          {sorted.map((inc) => (
            <IncidentRow
              key={inc.id}
              incident={inc}
              expanded={expandedId === inc.id}
              onToggle={() => setExpandedId((prev) => (prev === inc.id ? null : inc.id))}
              onResolve={() => handleAction(inc.id, "resolve")}
              onAcknowledge={() => handleAction(inc.id, "acknowledge")}
              onEscalate={() => handleAction(inc.id, "escalate")}
              loading={actionLoading === inc.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
