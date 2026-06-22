"use client";

import { ReactNode } from "react";

interface ShellProps {
  children: ReactNode;
}

/**
 * TenacitOS Shell — Apple-style Soft UI container
 * 
 * Design tokens:
 * - Background: neutral-950/80 with backdrop-blur-md
 * - Panels: rounded-2xl with subtle border
 * - Padding: p-6 for containers, p-4 for cards, p-2 for buttons
 */
export function Shell({ children }: ShellProps) {
  return (
    <div
      className="tenacios-shell"
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0a0a0f 0%, #0d1117 50%, #0a0a0f 100%)",
        color: "var(--text-primary)",
        fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Panel — Soft UI panel with glass morphism
 */
export function Panel({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`panel ${className}`}
      style={{
        backgroundColor: "rgba(15, 15, 20, 0.8)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        borderRadius: "16px",
        padding: "24px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Card — Soft UI card (smaller than Panel)
 */
export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`card ${className}`}
      style={{
        backgroundColor: "rgba(20, 20, 28, 0.6)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        borderRadius: "12px",
        padding: "16px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * GhostButton — text-only button with hover reveal
 */
export function GhostButton({
  children,
  onClick,
  color = "var(--text-muted)",
  hoverColor = "var(--text-primary)",
  className = "",
  style,
  title,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  color?: string;
  hoverColor?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <button
      className={`ghost-btn ${className}`}
      onClick={onClick}
      title={title}
      style={{
        padding: "4px 8px",
        borderRadius: "6px",
        border: "none",
        backgroundColor: "transparent",
        color: color,
        cursor: "pointer",
        fontSize: "10px",
        fontWeight: 500,
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        letterSpacing: "0.2px",
        transition: "all 150ms ease",
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.06)";
        e.currentTarget.style.color = hoverColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = color;
      }}
    >
      {children}
    </button>
  );
}
