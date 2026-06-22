"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  CircleDot,
  ListFilter,
  ChevronDown,
  ChevronRight,
  Tag,
  User,
  Zap,
  AlertOctagon,
  RotateCcw,
  Archive,
  Trash2,
  Activity,
  FileText,
  X,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  assignee: string;
  status: string;
  priority: string;
  ts: string;
  note?: string;
  linkedIncidentId?: string;
  tags?: string[];
  history?: Array<{
    ts: string;
    action: string;
    actor: string;
    details?: string;
  }>;
  lastActivity?: string;
  currentStep?: string | null;
  progress?: number;
  stalledAt?: string | null;
  wasStalled?: boolean;
  dispatchCount?: number;
  dispatchFailed?: boolean;
  dispatchFailedReason?: string;
  rcaConfidence?: number;
}

interface TasksResponse {
  tasks: Task[];
  total: number;
  error?: string;
}

const COLUMNS = [
  { key: "triage", label: "Triage", icon: AlertTriangle, accent: "var(--warning)" },
  { key: "backlog", label: "Backlog", icon: CircleDot, accent: "var(--text-muted)" },
  { key: "in_progress", label: "In Progress", icon: Zap, accent: "var(--accent)" },
  { key: "done", label: "Done", icon: CheckCircle2, accent: "var(--success)" },
  { key: "archived", label: "Archive", icon: Archive, accent: "rgba(100,100,100,0.4)" },
] as const;

const PRIORITY_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  P1: { bg: "rgba(239, 68, 68, 0.10)", text: "#ef4444", border: "rgba(239, 68, 68, 0.35)", label: "P1" },
  P2: { bg: "rgba(251, 191, 36, 0.10)", text: "#f59e0b", border: "rgba(251, 191, 36, 0.35)", label: "P2" },
  P3: { bg: "rgba(139, 92, 246, 0.10)", text: "#8b5cf6", border: "rgba(139, 92, 246, 0.35)", label: "P3" },
};

const ASSIGNEE_EMOJI: Record<string, string> = {
  monkey: "🐒",
  lifesupport: "🥷🏽",
  engineer: "🔧",
  archivist: "📚",
};

function timeAgo(ts: string): string {
  if (!ts || ts === "just now") return "just now";
  const date = new Date(ts);
  if (isNaN(date.getTime())) return ts;
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function computeStalenessMin(task: Task): number {
  const last = task.lastActivity ? new Date(task.lastActivity) : null;
  if (last && !isNaN(last.getTime())) return (Date.now() - last.getTime()) / 60_000;
  const ts = task.ts ? new Date(task.ts) : null;
  if (ts && !isNaN(ts.getTime()) && task.ts !== "just now") return (Date.now() - ts.getTime()) / 60_000;
  if (task.history && task.history.length > 0) {
    for (let i = task.history.length - 1; i >= 0; i--) {
      const h = new Date(task.history[i].ts);
      if (!isNaN(h.getTime())) return (Date.now() - h.getTime()) / 60_000;
    }
  }
  return 99999;
}

function isActive(task: Task): boolean {
  if (!task.lastActivity) return false;
  const diff = Date.now() - new Date(task.lastActivity).getTime();
  return diff < 5 * 60 * 1000; // 5 minutes
}

// ── TaskCard ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  expanded,
  onToggle,
  onArchive,
  onQuickAction,
  onOpenDrawer,
  onRestore,
  isOverlay,
}: {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  onArchive: (id: string) => void;
  onQuickAction: (taskId: string, action: string) => void;
  onOpenDrawer: (id: string) => void;
  onRestore: (id: string) => void;
  isOverlay?: boolean;
}) {
  // ── Defensive guard ──
  if (!task || !task.status) {
    console.warn("[TaskCard] Skipping render for invalid task:", task);
    return null;
  }

  // ── Sortable hook ──
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 999 : "auto" as const,
  };

  const prio = PRIORITY_CONFIG[task.priority] || {
    bg: "rgba(100,100,100,0.1)", text: "#888", border: "rgba(100,100,100,0.3)", label: task.priority || "—",
  };
  const emoji = ASSIGNEE_EMOJI[task.assignee] || "🤖";

  const isStalled = !!task.stalledAt;
  const wasStalled = !!task.wasStalled;
  const isGhost = task.status === "in_progress" &&
    (task.currentStep === null || task.currentStep === "Agent starting…" || task.currentStep === "Agent starting...");
  const isStale = task.status === "in_progress" && computeStalenessMin(task) > 30;
  const dispatchCount = task.dispatchCount ?? 0;
  const active = task.status === "in_progress" && isActive(task);

  let cardBorder = "var(--border)";
  let cardBg = "var(--card-elevated)";
  let stallIndicator = null;

  if (isStalled) {
    cardBorder = "rgba(239, 68, 68, 0.4)";
    cardBg = "rgba(239, 68, 68, 0.04)";
    stallIndicator = (
      <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
        <AlertOctagon style={{ width: "11px", height: "11px", color: "#ef4444" }} />
        <span style={{ fontSize: "10px", color: "#ef4444", fontWeight: 600 }}>STALLED — auto-reset by watchdog</span>
      </div>
    );
  } else if (isGhost) {
    cardBorder = "rgba(251, 191, 36, 0.4)";
    cardBg = "rgba(251, 191, 36, 0.04)";
    stallIndicator = (
      <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
        <AlertTriangle style={{ width: "11px", height: "11px", color: "#f59e0b" }} />
        <span style={{ fontSize: "10px", color: "#f59e0b", fontWeight: 600 }}>GHOST — agent never started</span>
      </div>
    );
  } else if (isStale) {
    cardBorder = "rgba(251, 191, 36, 0.25)";
    stallIndicator = (
      <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
        <Clock style={{ width: "11px", height: "11px", color: "#f59e0b" }} />
        <span style={{ fontSize: "10px", color: "#f59e0b", fontWeight: 600 }}>STALE — {Math.round(computeStalenessMin(task))}m since last activity</span>
      </div>
    );
  } else if (wasStalled && task.status === "backlog") {
    stallIndicator = (
      <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
        <RotateCcw style={{ width: "10px", height: "10px", color: "var(--text-muted)" }} />
        <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>Previously stalled</span>
      </div>
    );
  }

  const dispatchBadge = dispatchCount > 0 ? (
    <span style={{
      fontSize: "9px", color: dispatchCount >= 3 ? "#ef4444" : "var(--text-muted)",
      backgroundColor: dispatchCount >= 3 ? "rgba(239,68,68,0.1)" : "transparent",
      padding: "0 4px", borderRadius: "3px", fontWeight: dispatchCount >= 3 ? 700 : 400,
    }}>×{dispatchCount}</span>
  ) : null;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...sortableStyle,
        backgroundColor: cardBg,
        border: `1px solid ${cardBorder}`,
        borderRadius: "12px",
        padding: "16px",
        cursor: isOverlay ? "grabbing" : "grab",
        transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
        marginBottom: "8px",
        opacity: isOverlay ? 0.9 : (isDragging ? 0.4 : 1),
        boxShadow: isOverlay
          ? "0 12px 40px rgba(0,0,0,0.5)"
          : "0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.1)",
        backdropFilter: "blur(8px)",
      }}
      {...attributes}
      {...listeners}
    >
      {/* Top row: Drag handle + timestamp (top-right, muted) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        {/* Drag handle grip */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            padding: "4px",
            cursor: "grab",
            borderRadius: "4px",
            color: "rgba(255,255,255,0.15)",
            flexShrink: 0,
          }}
          title="Drag to move"
        >
          <span style={{ display: "flex", gap: "2px" }}><span style={{ width: "3px", height: "3px", borderRadius: "50%", backgroundColor: "currentColor" }} /><span style={{ width: "3px", height: "3px", borderRadius: "50%", backgroundColor: "currentColor" }} /></span>
          <span style={{ display: "flex", gap: "2px" }}><span style={{ width: "3px", height: "3px", borderRadius: "50%", backgroundColor: "currentColor" }} /><span style={{ width: "3px", height: "3px", borderRadius: "50%", backgroundColor: "currentColor" }} /></span>
          <span style={{ display: "flex", gap: "2px" }}><span style={{ width: "3px", height: "3px", borderRadius: "50%", backgroundColor: "currentColor" }} /><span style={{ width: "3px", height: "3px", borderRadius: "50%", backgroundColor: "currentColor" }} /></span>
        </div>

        {/* Timestamp — top-right, small, muted */}
        <span style={{
          fontSize: "9px",
          color: "rgba(255,255,255,0.25)",
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          fontWeight: 400,
          letterSpacing: "0.2px",
          flexShrink: 0,
        }}>
          {timeAgo(task.lastActivity || task.ts)}
        </span>
      </div>

      {/* Title — clickable for expand */}
      <div
        onClick={(e) => { e.stopPropagation(); onOpenDrawer(task.id); }}
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--text-primary)",
          lineHeight: "1.4",
          wordBreak: "break-word",
          cursor: "pointer",
          marginBottom: "8px",
        }}
      >
        {task.title}
      </div>

      {/* Bottom row: Priority + assignee + linked incident */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          padding: "2px 6px",
          borderRadius: "4px",
          fontSize: "9px",
          fontWeight: 600,
          letterSpacing: "0.3px",
          backgroundColor: prio.bg,
          color: prio.text,
          border: `1px solid ${prio.border}`,
        }}>
          {prio.label}
        </span>
        {dispatchBadge}
        {task.linkedIncidentId && (
          <span style={{
            fontSize: "8px",
            color: "rgba(251,191,36,0.6)",
            backgroundColor: "rgba(251,191,36,0.06)",
            padding: "1px 5px",
            borderRadius: "3px",
            fontFamily: "'SF Mono', 'Fira Code', monospace",
          }}>
            {task.linkedIncidentId}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
          {active && (
            <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#22c55e", boxShadow: "0 0 6px #22c55e", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: "8px", color: "#22c55e", fontWeight: 600 }}>LIVE</span>
            </span>
          )}
          <span style={{ fontSize: "12px", opacity: 0.6 }} title={task.assignee}>{emoji}</span>
        </div>
      </div>

      {/* Stall indicator */}
      {stallIndicator}

      {/* Footer: time + linked incident + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
        <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)", display: "flex", alignItems: "center", gap: "3px" }}>
          <Clock style={{ width: "10px", height: "10px" }} />
          {timeAgo(task.lastActivity || task.ts)}
        </span>
        {task.linkedIncidentId && (
          <span style={{ fontSize: "9px", color: "var(--warning)", backgroundColor: "rgba(251,191,36,0.08)", padding: "1px 5px", borderRadius: "3px", fontFamily: "var(--font-mono, monospace)" }}>
            {task.linkedIncidentId}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          {task.linkedIncidentId && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onQuickAction(task.id, "resolve"); }}
                title="Resolve incident"
                style={{ padding: "4px 8px", borderRadius: "6px", border: "none", backgroundColor: "transparent", color: "rgba(34,197,94,0.7)", cursor: "pointer", fontSize: "10px", fontWeight: 500, fontFamily: "'SF Mono', 'Fira Code', monospace", transition: "all 150ms ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(34,197,94,0.1)"; e.currentTarget.style.color = "#22c55e"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "rgba(34,197,94,0.7)"; }}
              >
                Resolve
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onQuickAction(task.id, "ignore"); }}
                title="Ignore incident"
                style={{ padding: "4px 8px", borderRadius: "6px", border: "none", backgroundColor: "transparent", color: "rgba(148,163,184,0.5)", cursor: "pointer", fontSize: "10px", fontWeight: 500, fontFamily: "'SF Mono', 'Fira Code', monospace", transition: "all 150ms ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(148,163,184,0.08)"; e.currentTarget.style.color = "#94a3b8"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "rgba(148,163,184,0.5)"; }}
              >
                Ignore
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onQuickAction(task.id, "escalate"); }}
                title="Escalate incident"
                style={{ padding: "4px 8px", borderRadius: "6px", border: "none", backgroundColor: "transparent", color: "rgba(239,68,68,0.6)", cursor: "pointer", fontSize: "10px", fontWeight: 500, fontFamily: "'SF Mono', 'Fira Code', monospace", transition: "all 150ms ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.1)"; e.currentTarget.style.color = "#ef4444"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "rgba(239,68,68,0.6)"; }}
              >
                Escalate
              </button>
            </>
          )}
          {task.status === "archived" ? (
            <button
              onClick={(e) => { e.stopPropagation(); onRestore(task.id); }}
              title="Restore to backlog"
              style={{ padding: "4px 8px", borderRadius: "6px", border: "none", backgroundColor: "transparent", color: "rgba(34,197,94,0.6)", cursor: "pointer", fontSize: "10px", fontWeight: 500, fontFamily: "'SF Mono', 'Fira Code', monospace", transition: "all 150ms ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#22c55e"; e.currentTarget.style.backgroundColor = "rgba(34,197,94,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(34,197,94,0.6)"; e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              Restore
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(task.id); }}
              title="Archive task"
              style={{ padding: "4px 8px", borderRadius: "6px", border: "none", backgroundColor: "transparent", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: "10px", fontWeight: 500, fontFamily: "'SF Mono', 'Fira Code', monospace", transition: "all 150ms ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#f59e0b"; e.currentTarget.style.backgroundColor = "rgba(251,191,36,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              Archive
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: "10px" }}>
          {task.note && (
            <div style={{ padding: "8px", backgroundColor: "rgba(0,0,0,0.2)", borderRadius: "6px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: "1.5", maxHeight: "120px", overflowY: "auto", whiteSpace: "pre-wrap", fontFamily: "var(--font-mono, monospace)", marginBottom: "8px" }}>
              {task.note.slice(0, 500)}{task.note.length > 500 && "…"}
            </div>
          )}
          {/* History log */}
          {task.history && task.history.length > 0 && (
            <div style={{ padding: "8px", backgroundColor: "rgba(0,0,0,0.15)", borderRadius: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "6px" }}>
                <FileText style={{ width: "11px", height: "11px", color: "var(--text-muted)" }} />
                <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Activity Log</span>
              </div>
              {task.history.slice(-5).reverse().map((entry, idx) => (
                <div key={idx} style={{ display: "flex", gap: "8px", marginBottom: "4px", fontSize: "10px" }}>
                  <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)", whiteSpace: "nowrap", fontSize: "9px" }}>
                    {timeAgo(entry.ts)}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{entry.action}</span>
                    {entry.details && `: ${entry.details.slice(0, 80)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expand indicator */}
      <div style={{ textAlign: "center", marginTop: "4px" }}>
        {expanded ? (
          <ChevronDown style={{ width: "14px", height: "14px", color: "var(--text-muted)", margin: "0 auto" }} />
        ) : (
          <ChevronRight style={{ width: "14px", height: "14px", color: "var(--text-muted)", margin: "0 auto" }} />
        )}
      </div>
    </div>
  );
}

// ── Detail Drawer ──────────────────────────────────────────────────────────

function DetailDrawer({
  task,
  onClose,
  onSave,
  onRefresh,
}: {
  task: Task;
  onClose: () => void;
  onSave: (updated: { title: string; note: string; assignee: string }) => void;
  onRefresh: () => void;
}) {
  const [editTitle, setEditTitle] = useState(task.title);
  const [editNote, setEditNote] = useState(task.note || "");
  const [editAssignee, setEditAssignee] = useState(task.assignee);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ title: editTitle, note: editNote, assignee: editAssignee });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("[DetailDrawer] Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          zIndex: 999,
          animation: "fadeIn 150ms ease",
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "420px",
          maxWidth: "90vw",
          backgroundColor: "rgba(12, 12, 18, 0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.06)",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          animation: "slideInRight 200ms cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", fontFamily: "'SF Mono', monospace" }}>{task.id}</span>
            <span style={{
              fontSize: "9px", fontWeight: 600, letterSpacing: "0.3px",
              padding: "2px 6px", borderRadius: "4px",
              backgroundColor: task.priority === "P1" ? "rgba(239,68,68,0.1)" : task.priority === "P2" ? "rgba(251,191,36,0.1)" : "rgba(139,92,246,0.1)",
              color: task.priority === "P1" ? "#ef4444" : task.priority === "P2" ? "#f59e0b" : "#8b5cf6",
            }}>{task.priority}</span>
          </div>
          <button
            onClick={onClose}
            style={{ padding: "4px", borderRadius: "6px", border: "none", backgroundColor: "transparent", color: "rgba(255,255,255,0.4)", cursor: "pointer", display: "flex", alignItems: "center" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
          >
            <X style={{ width: "18px", height: "18px" }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>

          {/* Title field */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Title</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.08)",
                backgroundColor: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.9)",
                fontSize: "13px",
                fontWeight: 500,
                outline: "none",
                fontFamily: "'SF Pro Display', -apple-system, sans-serif",
                transition: "border-color 150ms ease",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
            />
          </div>

          {/* Description field */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Description</label>
            <textarea
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.08)",
                backgroundColor: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.8)",
                fontSize: "12px",
                lineHeight: "1.6",
                outline: "none",
                resize: "vertical",
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                transition: "border-color 150ms ease",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
            />
          </div>

          {/* Assignee field */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Assignee</label>
            <select
              value={editAssignee}
              onChange={(e) => setEditAssignee(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.08)",
                backgroundColor: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.8)",
                fontSize: "12px",
                outline: "none",
                cursor: "pointer",
                fontFamily: "'SF Pro Display', -apple-system, sans-serif",
              }}
            >
              <option value="monkey" style={{ backgroundColor: "#111" }}>🐒 Space Monkey</option>
              <option value="lifesupport" style={{ backgroundColor: "#111" }}>🥷🏽 Life Support</option>
              <option value="engineer" style={{ backgroundColor: "#111" }}>🔧 Engineer</option>
              <option value="archivist" style={{ backgroundColor: "#111" }}>📚 Archivist</option>
            </select>
          </div>

          {/* Metadata read-only */}
          <div style={{ marginBottom: "20px", padding: "12px", borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>Status</span>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", fontFamily: "'SF Mono', monospace" }}>{task.status}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>Created</span>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", fontFamily: "'SF Mono', monospace" }}>{new Date(task.ts).toLocaleString("en-GB")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>Last Activity</span>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", fontFamily: "'SF Mono', monospace" }}>{task.lastActivity ? timeAgo(task.lastActivity) : "—"}</span>
            </div>
          </div>

          {/* Activity Log — READ ONLY */}
          {task.history && task.history.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <Activity style={{ width: "12px", height: "12px", color: "rgba(255,255,255,0.3)" }} />
                <span style={{ fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Activity Log</span>
                <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.15)", fontFamily: "'SF Mono', monospace", marginLeft: "auto" }}>READ ONLY</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>
                {task.history.slice().reverse().map((entry, idx) => (
                  <div key={idx} style={{
                    display: "flex",
                    gap: "10px",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255,255,255,0.015)",
                    border: "1px solid rgba(255,255,255,0.03)",
                  }}>
                    <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.2)", fontFamily: "'SF Mono', monospace", whiteSpace: "nowrap", paddingTop: "1px" }}>
                      {timeAgo(entry.ts)}
                    </span>
                    <div>
                      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{entry.action}</span>
                      {entry.details && <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>: {entry.details.slice(0, 100)}</span>}
                      {entry.actor && <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.15)", marginLeft: "4px" }}>by {entry.actor}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer with Save + Delete */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "8px",
          flexShrink: 0,
        }}>
          {/* Delete button — left side, red ghost */}
          <button
            onClick={() => {
              if (window.confirm("Delete this task? This cannot be undone.")) {
                fetch(`/api/tasks?id=${task.id}`, { method: "DELETE" })
                  .then((res) => {
                    if (res.ok) {
                      onClose();
                      onRefresh();
                    } else {
                      alert("Failed to delete task");
                    }
                  })
                  .catch((err) => {
                    console.error("[Delete] Error:", err);
                    alert("Failed to delete task");
                  });
              }
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "transparent",
              color: "rgba(239,68,68,0.5)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              marginRight: "auto",
              transition: "all 150ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.08)"; e.currentTarget.style.color = "#ef4444"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "rgba(239,68,68,0.5)"; }}
          >
            Delete
          </button>

          {saved && (
            <span style={{ fontSize: "11px", color: "#22c55e", fontWeight: 500 }}>✓ Saved</span>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.08)",
              backgroundColor: "transparent",
              color: "rgba(255,255,255,0.5)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 20px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: saving ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
              color: saving ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.9)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: saving ? "wait" : "pointer",
              transition: "all 150ms ease",
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── KanbanColumn ────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  tasks,
  expandedId,
  onToggle,
  onArchive,
  onQuickAction,
  onOpenDrawer,
  onRestore,
  visibleCount,
  onLoadMore,
}: {
  column: (typeof COLUMNS)[number];
  tasks: Task[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onArchive: (id: string) => void;
  onQuickAction: (taskId: string, action: string) => void;
  onOpenDrawer: (id: string) => void;
  onRestore: (id: string) => void;
  visibleCount: number;
  onLoadMore: () => void;
}) {
  const Icon = column.icon;
  const stalledCount = tasks.filter((t) => t.stalledAt).length;
  const warningCount = tasks.filter((t) =>
    t.status === "in_progress" && !t.stalledAt &&
    (t.currentStep === null || t.currentStep === "Agent starting…" || t.currentStep === "Agent starting..." || computeStalenessMin(t) > 30)
  ).length;

  // ── Droppable column zone ──
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: column.key });

  return (
    <div
      ref={setDroppableRef}
      style={{
        flex: 1,
        minWidth: "220px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: isOver ? "rgba(255,255,255,0.03)" : "transparent",
        borderRadius: "8px",
        transition: "background-color 150ms ease",
        border: isOver ? "1px dashed rgba(255,255,255,0.15)" : "1px solid transparent",
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px 16px",
        borderRadius: "12px",
        marginBottom: "12px",
        backgroundColor: column.key === "archived" ? "rgba(20, 20, 28, 0.3)" : "rgba(20, 20, 28, 0.5)",
        backdropFilter: "blur(12px)",
        border: column.key === "archived" ? "1px dashed rgba(255,255,255,0.06)" : "1px solid rgba(255,255,255,0.04)",
        opacity: column.key === "archived" ? 0.7 : 1,
      }}>
        <Icon style={{ width: "14px", height: "14px", color: column.accent, opacity: column.key === "archived" ? 0.4 : 0.8 }} />
        <span style={{
          fontSize: "11px",
          fontWeight: 600,
          color: column.key === "archived" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.7)",
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
        }}>{column.label}</span>
        <span style={{
          marginLeft: "auto",
          fontSize: "10px",
          fontWeight: 600,
          color: "rgba(255,255,255,0.3)",
          backgroundColor: "rgba(255,255,255,0.04)",
          padding: "2px 8px",
          borderRadius: "8px",
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          opacity: column.key === "archived" ? 0.5 : 1,
        }}>{tasks.length}</span>
        {stalledCount > 0 && <AlertOctagon style={{ width: "12px", height: "12px", color: "#ef4444", opacity: 0.7 }} />}
        {warningCount > 0 && stalledCount === 0 && <AlertTriangle style={{ width: "12px", height: "12px", color: "#f59e0b", opacity: 0.7 }} />}
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingRight: "2px" }}>
        {tasks.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "32px 12px",
            color: isOver ? "var(--text-secondary)" : "var(--text-muted)",
            fontSize: "11px",
            fontStyle: "italic",
            border: isOver
              ? "1px dashed rgba(255,255,255,0.15)"
              : column.key === "archived"
                ? "1px dashed rgba(255,255,255,0.04)"
                : "none",
            borderRadius: "6px",
            transition: "all 150ms ease",
            opacity: column.key === "archived" ? 0.6 : 1,
          }}>
            {isOver ? "Drop here to archive" : column.key === "archived" ? "Archived tasks appear here" : "No tasks"}
          </div>
        )}
        <SortableContext items={tasks.slice(0, visibleCount).map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.slice(0, visibleCount).map((task) => (
            <TaskCard key={task.id} task={task} expanded={expandedId === task.id} onToggle={() => onToggle(task.id)} onArchive={onArchive} onQuickAction={onQuickAction} onOpenDrawer={onOpenDrawer} onRestore={onRestore} />
          ))}
        </SortableContext>
        {visibleCount < tasks.length && (
          <button onClick={(e) => { e.stopPropagation(); onLoadMore(); }} style={{ width: "100%", padding: "8px", marginTop: "8px", borderRadius: "6px", border: "1px dashed var(--border)", backgroundColor: "transparent", color: "var(--text-muted)", fontSize: "11px", fontWeight: 600, cursor: "pointer", transition: "all 150ms ease" }}>
            Load more ({tasks.length - visibleCount} remaining)
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({
    triage: PAGE_SIZE, backlog: PAGE_SIZE, in_progress: PAGE_SIZE, done: PAGE_SIZE, archived: PAGE_SIZE,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 0 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      const data: TasksResponse = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        const raw: Task[] = data.tasks || [];
        const valid = raw.filter((t): t is Task => !!t && typeof t === "object" && !!t.status);
        if (valid.length !== raw.length) {
          console.warn(`[Tasks] Filtered ${raw.length - valid.length} invalid entries from API response`);
        }
        console.log("[Tasks] Rendering:", valid.length, "tasks");
        setTasks(valid);
      }
    } catch (err) { setError("Failed to fetch tasks"); console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTasks(); const interval = setInterval(fetchTasks, 30000); return () => clearInterval(interval); }, [fetchTasks]);

  useEffect(() => {
    setVisibleCounts({ triage: PAGE_SIZE, backlog: PAGE_SIZE, in_progress: PAGE_SIZE, done: PAGE_SIZE, archived: PAGE_SIZE });
  }, [filterPriority, filterAssignee]);

  const assignees = [...new Set(tasks.map((t) => t.assignee).filter(Boolean))];
  const filtered = tasks.filter((t) => {
    if (!t) {
      console.warn("[Tasks] Filter: null/undefined task entry skipped");
      return false;
    }
    if (!t.status) {
      console.warn("[Tasks] Filter: task with missing status skipped:", t.id, t.title?.slice(0, 40));
      return false;
    }
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterAssignee !== "all" && t.assignee !== filterAssignee) return false;
    return true;
  });

  // Build column tasks
  const columnTasks: Record<string, Task[]> = {};
  for (const col of COLUMNS) {
    columnTasks[col.key] = filtered.filter((t) => t && t.status === col.key);
  }

  // ── DnD handlers ──────────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    console.log("[DnD] DragStart:", event);
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    console.log("[DnD] DragEnd:", event);
    setActiveId(null);
    const { active, over } = event;
    if (!over) {
      console.log("[DnD] Dropped with no target");
      return;
    }

    const taskId = active.id as string;
    const overId = over.id as string;

    // Find the task being dragged
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Determine target column
    let targetStatus: string | null = null;

    // Check if dropped on a column
    if (COLUMNS.some((c) => c.key === overId)) {
      targetStatus = overId;
    } else {
      // Dropped on another task — find that task's column
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) targetStatus = overTask.status;
    }

    if (!targetStatus || targetStatus === task.status) return;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t && t.id === taskId
          ? { ...t, status: targetStatus!, lastActivity: new Date().toISOString() }
          : t
      )
    );

    // Persist via API
    fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status: targetStatus }),
    }).catch((err) => {
      console.error("[DnD] Failed to persist status change:", err);
      fetchTasks(); // Revert on failure
    });
  }

  // ── Archive handler ───────────────────────────────────────────────────────

  const handleArchive = useCallback(async (taskId: string) => {
    // Optimistic update
    setTasks((prev) => prev.map((t) => t && t.id === taskId ? { ...t, status: "ARCHIVED" } : t));
    setArchiveConfirm(null);

    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, action: "archive" }),
      });
    } catch (err) {
      console.error("[Archive] Failed:", err);
      fetchTasks();
    }
  }, []);

  // ── Quick Action handler ─────────────────────────────────────────────────

  const handleQuickAction = useCallback(async (taskId: string, action: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !task.linkedIncidentId) return;

    const incidentId = task.linkedIncidentId;

    try {
      // Map action to incident API action
      let incidentAction: string;
      let taskStatus: string | null = null;

      if (action === "resolve") {
        incidentAction = "resolve";
        taskStatus = "done";
      } else if (action === "ignore") {
        incidentAction = "acknowledge";
        // Task stays in current status, just acknowledge the incident
      } else if (action === "escalate") {
        incidentAction = "escalate";
        // Task stays in current status, just escalate the incident
      } else {
        return;
      }

      // Update incident via API
      const incRes = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, action: incidentAction }),
      });

      if (!incRes.ok) {
        console.error("[QuickAction] Failed to update incident:", await incRes.text());
        return;
      }

      // If resolving, also mark the task as done
      if (taskStatus) {
        await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: taskId, status: taskStatus }),
        });
      }

      // Refresh tasks
      fetchTasks();
    } catch (err) {
      console.error("[QuickAction] Error:", err);
    }
  }, [tasks, fetchTasks]);

  // ── Detail Drawer save ────────────────────────────────────────────────────

  const handleDrawerSave = useCallback(async (updates: { title: string; note: string; assignee: string }) => {
    if (!drawerTaskId) return;
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: drawerTaskId, ...updates }),
    });
    if (!res.ok) throw new Error("Save failed");
    await fetchTasks();
  }, [drawerTaskId, fetchTasks]);

  // ── Restore from archive ─────────────────────────────────────────────────

  const handleRestore = useCallback(async (taskId: string) => {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status: "backlog" }),
    });
    await fetchTasks();
  }, [fetchTasks]);

  // ── Summary counts ────────────────────────────────────────────────────────

  const p1Count = tasks.filter((t) => t.priority === "P1").length;
  const p2Count = tasks.filter((t) => t.priority === "P2").length;
  const p3Count = tasks.filter((t) => t.priority === "P3").length;
  const stalledCount = tasks.filter((t) => !!t.stalledAt).length;
  const ghostCount = tasks.filter((t) => t.status === "in_progress" && (t.currentStep === null || t.currentStep === "Agent starting…" || t.currentStep === "Agent starting...")).length;
  const staleCount = tasks.filter((t) => t.status === "in_progress" && !t.stalledAt && (t.currentStep !== null && t.currentStep !== "Agent starting…" && t.currentStep !== "Agent starting...") && computeStalenessMin(t) > 30).length;

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  if (loading) {
    return (
      <div style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "32px", height: "32px", border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading tasks…</span>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="p-4 md:p-8">
        {/* Page Header */}
        <div style={{ marginBottom: "20px" }}>
          <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ fontFamily: "var(--font-heading)", color: "var(--text-primary)", letterSpacing: "-1.5px" }}>
            🎯 Task Board
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            {tasks.length} total · {p1Count} P1 · {p2Count} P2 · {p3Count} P3
            {(stalledCount > 0 || ghostCount > 0 || staleCount > 0) && (
              <span style={{ marginLeft: "12px" }}>
                {stalledCount > 0 && <span style={{ color: "#ef4444", marginRight: "8px" }}><AlertOctagon style={{ width: "12px", height: "12px", display: "inline", verticalAlign: "text-bottom", marginRight: "2px" }} />{stalledCount} stalled</span>}
                {ghostCount > 0 && <span style={{ color: "#f59e0b", marginRight: "8px" }}><AlertTriangle style={{ width: "12px", height: "12px", display: "inline", verticalAlign: "text-bottom", marginRight: "2px" }} />{ghostCount} ghost</span>}
                {staleCount > 0 && <span style={{ color: "#f59e0b" }}><Clock style={{ width: "12px", height: "12px", display: "inline", verticalAlign: "text-bottom", marginRight: "2px" }} />{staleCount} stale</span>}
              </span>
            )}
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
          <ListFilter style={{ width: "14px", height: "14px", color: "var(--text-muted)" }} />
          <div style={{ display: "flex", gap: "4px" }}>
            {["all", "P1", "P2", "P3"].map((p) => {
              const isActive = filterPriority === p;
              const config = p === "all" ? null : PRIORITY_CONFIG[p];
              return (
                <button key={p} onClick={() => setFilterPriority(p)} style={{ padding: "3px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", cursor: "pointer", border: `1px solid ${isActive ? (config?.border || "var(--accent)") : "var(--border)"}`, backgroundColor: isActive ? (config?.bg || "var(--accent-soft)") : "transparent", color: isActive ? (config?.text || "var(--accent)") : "var(--text-muted)", transition: "all 150ms ease" }}>
                  {p === "all" ? "All" : p}
                </button>
              );
            })}
          </div>
          <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 500, backgroundColor: "var(--card-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer" }}>
            <option value="all">All Assignees</option>
            {assignees.map((a) => (<option key={a} value={a}>{ASSIGNEE_EMOJI[a] || "🤖"} {a}</option>))}
          </select>
          {error && <span style={{ fontSize: "11px", color: "var(--error)", marginLeft: "auto" }}>⚠ {error}</span>}
        </div>

        {/* Kanban Board */}
        <div style={{ display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "16px" }}>
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              column={col}
              tasks={columnTasks[col.key] || []}
              expandedId={expandedId}
              onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
              onArchive={(id) => setArchiveConfirm(id)}
              onQuickAction={handleQuickAction}
              onOpenDrawer={(id) => setDrawerTaskId(id)}
              onRestore={handleRestore}
              visibleCount={visibleCounts[col.key] || PAGE_SIZE}
              onLoadMore={() => setVisibleCounts((prev) => ({ ...prev, [col.key]: (prev[col.key] || PAGE_SIZE) + PAGE_SIZE }))}
            />
          ))}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} expanded={false} onToggle={() => {}} onArchive={() => {}} onQuickAction={() => {}} onOpenDrawer={() => {}} onRestore={() => {}} isOverlay /> : null}
      </DragOverlay>

      {/* Detail Drawer */}
      {drawerTaskId && (() => {
        const drawerTask = tasks.find((t) => t.id === drawerTaskId);
        if (!drawerTask) return null;
        return (
          <DetailDrawer
            task={drawerTask}
            onClose={() => setDrawerTaskId(null)}
            onSave={handleDrawerSave}
            onRefresh={fetchTasks}
          />
        );
      })()}

      {/* Archive confirmation modal */}
      {archiveConfirm && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", maxWidth: "400px", width: "90%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <Archive style={{ width: "20px", height: "20px", color: "#f59e0b" }} />
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Archive Task</h3>
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
              This task will be moved to the archive and removed from the active board. It won't be deleted — you can find it by filtering for archived tasks.
            </p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setArchiveConfirm(null)} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "transparent", color: "var(--text-secondary)", fontSize: "13px", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => handleArchive(archiveConfirm)} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", backgroundColor: "#f59e0b", color: "#000", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Archive</button>
            </div>
          </div>
        </div>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </DndContext>
  );
}
