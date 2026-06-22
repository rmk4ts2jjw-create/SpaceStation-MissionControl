"use client";

import { Dock, TopBar, StatusBar, DevToolsHUD, Shell } from "@/components/TenacitOS";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Shell>
      <Dock />
      <TopBar />

      <main
        style={{
          marginLeft: "68px",
          marginTop: "48px",
          marginBottom: "32px",
          minHeight: "calc(100vh - 48px - 32px)",
          padding: "24px",
        }}
      >
        {children}
      </main>

      <StatusBar />
      <DevToolsHUD />
    </Shell>
  );
}
