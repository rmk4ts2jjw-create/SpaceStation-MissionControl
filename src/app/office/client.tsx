"use client";

import dynamic from "next/dynamic";
import { Suspense, useState } from "react";

// Dynamically import the 3D Office component with SSR disabled.
// WebGL contexts are not available during SSR and will crash on iPad.
const Office3D = dynamic(() => import("@/components/Office3D/Office3D"), {
  ssr: false,
  loading: () => <LoadingFallback />,
});

function LoadingFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--background)",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          border: "3px solid var(--accent)",
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
        Loading 3D Office…
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function OfficeClient() {
  const [loadOffice, setLoadOffice] = useState(false);

  if (!loadOffice) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--background)",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <h2 style={{ color: "var(--text-primary)", fontSize: "1.5rem" }}>
          🏢 The Office 3D
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", maxWidth: "400px", textAlign: "center" }}>
          Interactive 3D agent office. Loading this view may cause performance issues on lower-powered devices.
        </p>
        <button
          onClick={() => setLoadOffice(true)}
          style={{
            padding: "12px 32px",
            fontSize: "1rem",
            fontWeight: 600,
            backgroundColor: "var(--accent)",
            color: "var(--background)",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          Load 3D Office
        </button>
      </div>
    );
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Office3D />
    </Suspense>
  );
}
