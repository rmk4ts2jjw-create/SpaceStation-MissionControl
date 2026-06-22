"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, Cpu, HardDrive, Wifi, WifiOff, ChevronUp, ChevronDown } from "lucide-react";

interface HealthData {
  status: string;
  uptime: number;
  services?: Array<{ name: string; status: string; latency?: number }>;
  timestamp?: string;
}

export function DevToolsHUD() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        setLastUpdate(new Date());
      }
    } catch {
      setHealth({ status: "down", uptime: 0 });
      setLastUpdate(new Date());
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const isUp = health && health.status !== "down";
  const statusColor = isUp ? "#22c55e" : "#ef4444";

  return (
    <div
      style={{
        position: "fixed",
        bottom: "40px",
        left: "80px",
        zIndex: 9999,
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        fontSize: "10px",
        color: "var(--text-muted)",
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "8px",
        overflow: "hidden",
        minWidth: "180px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header — always visible */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 10px",
          cursor: "pointer",
          userSelect: "none",
          borderBottom: expanded ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}
      >
        <div
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: "9px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
          Diagnostics
        </span>
        {lastUpdate && (
          <span style={{ marginLeft: "auto", fontSize: "8px", opacity: 0.5 }}>
            {lastUpdate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
        {expanded ? <ChevronDown style={{ width: "10px", height: "10px", opacity: 0.5 }} /> : <ChevronUp style={{ width: "10px", height: "10px", opacity: 0.5 }} />}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: "8px 10px" }}>
          {/* Status row */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {isUp ? <Wifi style={{ width: "9px", height: "9px" }} /> : <WifiOff style={{ width: "9px", height: "9px" }} />}
              Gateway
            </span>
            <span style={{ color: statusColor, fontWeight: 600 }}>
              {isUp ? "UP" : "DOWN"}
            </span>
          </div>

          {/* Uptime */}
          {health?.uptime != null && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Activity style={{ width: "9px", height: "9px" }} />
                Uptime
              </span>
              <span>{formatUptime(health.uptime)}</span>
            </div>
          )}

          {/* Services */}
          {health?.services && health.services.length > 0 && (
            <div style={{ marginTop: "4px", paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              {health.services.map((svc) => (
                <div key={svc.name} style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    {svc.status === "up" ? (
                      <Cpu style={{ width: "8px", height: "8px" }} />
                    ) : (
                      <HardDrive style={{ width: "8px", height: "8px" }} />
                    )}
                    {svc.name}
                  </span>
                  <span style={{ color: svc.status === "up" ? "#22c55e" : "#ef4444", fontSize: "9px" }}>
                    {svc.latency != null ? `${svc.latency}ms` : svc.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
