# Navigation Shell Diagnosis

**Date:** 2026-06-30
**System:** SpaceStation (Next.js App Router)

## Root Cause

**Commit `2ad548c`** ("fix: landing page redirect, local IP auth bypass") created `src/app/page.tsx` at the root level, creating a **duplicate route `/`** that conflicts with `src/app/(dashboard)/page.tsx` and bypasses the dashboard layout.

### Before the commit

No `src/app/page.tsx` existed. Route `/` was served by `src/app/(dashboard)/page.tsx`, which is inside the `(dashboard)` route group and wrapped by `src/app/(dashboard)/layout.tsx`. That layout renders:

- `<Shell>`
- `<Dock />` (sidebar navigation)
- `<TopBar />`
- `<StatusBar />`
- `<DevToolsHUD />`

Navigation shell was fully rendered.

### After the commit

`src/app/page.tsx` was created at the root level:

```tsx
import DashboardPage from "./(dashboard)/page";
export default DashboardPage;
```

Route `/` is now served by this **root-level** `page.tsx`, which is wrapped only by `src/app/layout.tsx` — a bare layout that renders just `{children}` inside `<html>`+`<body>` with zero navigation components.

`src/app/(dashboard)/page.tsx` still exists, also defining `/`, but Next.js resolves the conflict by choosing the root-level `page.tsx`.

### Rendering Chain (broken)

```
src/app/layout.tsx              ← bare html/body, {children} only
  └── src/app/page.tsx          ← re-exports (dashboard)/page
        └── DashboardPage       ← content only, NO Shell/Dock/TopBar
```

### Rendering Chain (other routes — working)

```
src/app/layout.tsx              ← bare html/body
  └── src/app/(dashboard)/layout.tsx  ← Shell + Dock + TopBar + StatusBar + DevToolsHUD
        └── {children}          ← e.g. /agents, /tasks, /activity
```

Pages under `/(dashboard)/*` (e.g. `/agents`, `/activity`, `/tasks`) still render the navigation shell correctly.

## Components Examined

| File | Status |
|---|---|
| `src/app/layout.tsx` | Correct — root layout, intentionally has no nav |
| `src/app/(dashboard)/layout.tsx` | Correct — provides Shell, Dock, TopBar, StatusBar, DevToolsHUD |
| `src/components/TenacitOS/Shell.tsx` | Healthy — simple wrapper div, no errors |
| `src/app/page.tsx` | **Root cause** — created by 2ad548c, bypasses dashboard layout |

## Comparison: Original vs Current

The archive at `_ARCHIVE_OLD_SPACESTATION/tenacitOS-original/` confirms the same architecture: navigation was always in `(dashboard)/layout.tsx`, never in the root layout. The original did NOT have a `src/app/page.tsx` — the root route `/` was served by `(dashboard)/page.tsx`.

## Why Shell.tsx Is Not Broken

`Shell.tsx:17-29` is a simple `<div>` wrapper with `className="tenacios-shell"` and a `color` style. It renders fine. The issue is that `Shell` is **never invoked** for route `/` because `src/app/page.tsx` bypasses `(dashboard)/layout.tsx`.

## Fix Required

Delete `src/app/page.tsx` to restore `(dashboard)/page.tsx` as the sole handler for route `/`. The commit intended a "landing page redirect" but created a duplicate route instead. If behavior change is needed for `/`, modify `(dashboard)/layout.tsx` or `(dashboard)/page.tsx` directly.
