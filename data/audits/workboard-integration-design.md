# Workboard Integration Design

**Date:** 2026-06-22
**Goal:** SpaceStation tasks page becomes a custom UI for the OpenClaw Workboard

---

## Architecture

### Current State
- SpaceStation tasks page → `/api/tasks` REST → `tasks.json` file
- Workboard → Gateway WebSocket RPC → SQLite

### Target State
- SpaceStation tasks page → Gateway WebSocket RPC → Workboard SQLite
- SpaceStation keeps: Kanban UI, theme, drag-and-drop, filters
- SpaceStation drops: `/api/tasks` REST API, `tasks.json` as source of truth

### Connection Model
The browser connects to the Gateway WebSocket (same as Control UI Workboard tab).
The Gateway URL is `ws://localhost:18789` (or whatever `gateway.port` is configured).

SpaceStation needs a WebSocket client in the browser that:
1. Connects to the Gateway
2. Calls `workboard.cards.list` to load cards
3. Calls `workboard.cards.create` for new cards
4. Calls `workboard.cards.move` for drag-and-drop
5. Calls `workboard.cards.update` for edits
6. Calls `workboard.cards.dispatch` for dispatch
7. Calls `workboard.cards.archive` for archival

---

## Field Mapping

### Status
| SpaceStation | Workboard |
|-------------|-----------|
| `triage` | `triage` |
| `backlog` | `backlog` |
| `in_progress` | `running` |
| `done` | `done` |
| `archived` | (via `metadata.archivedAt`) |

### Priority
| SpaceStation | Workboard |
|-------------|-----------|
| `P1` | `urgent` |
| `P2` | `high` |
| `P3` | `normal` |

### Fields to Keep (SpaceStation-specific)
- `linkedIncidentId` — not in Workboard, store in notes or skip
- `projectId` — map to Workboard `labels` or `boardId`
- `tags` — map to Workboard `labels`
- `history` — Workboard has `events[]` + `metadata.comments[]`

### Fields to Add (from Workboard)
- `sessionKey` — linked session
- `runId` — linked run
- `agentId` — assigned agent
- `labels` — tags/labels
- `position` — ordering within column
- `metadata.links` — parent/child dependencies
- `metadata.claim` — claim/heartbeat

---

## What to KEEP from SpaceStation
1. **Kanban UI** — the visual board with columns, cards, drag-and-drop
2. **SpaceStation theme** — dark mode, glass panels, custom styling
3. **Filters** — priority, assignee, project, system health (stalled/ghost)
4. **Detail drawer** — read-only view of card details
5. **Auto-refresh** — poll or WebSocket push for live updates
6. **Test mode** — separate data for testing

## What to DROP
1. **`/api/tasks` REST endpoints** — no longer needed (Workboard is source of truth)
2. **`tasks.json` as source of truth** — Workboard SQLite is source of truth
3. **Local task CRUD** — create/edit/delete all go through Workboard RPC
4. **Stall/ghost detection UI** — Workboard has its own stale detection
5. **Dispatch count badge** — Workboard tracks attempts differently

## What to ADD
1. **WebSocket client** — connect to Gateway for Workboard RPC
2. **"New Card" button** — calls `workboard.cards.create`
3. **"Dispatch Ready Work" button** — calls `workboard.cards.dispatch`
4. **Session linking** — show linked session status on cards
5. **9-column board** — add Scheduled, Ready, Review, Blocked columns
6. **Labels support** — show/edit labels on cards
7. **Agent assignment** — assign cards to agents

---

## API Call Mapping

| SpaceStation Action | Workboard RPC |
|--------------------|---------------|
| Load all cards | `workboard.cards.list` |
| Create new card | `workboard.cards.create` |
| Move card (drag) | `workboard.cards.move` |
| Update card fields | `workboard.cards.update` |
| Delete card | `workboard.cards.delete` |
| Archive card | `workboard.cards.archive` |
| Dispatch work | `workboard.cards.dispatch` |
| Add comment | `workboard.cards.comment` |

---

## Implementation Plan

### Step 1: Create WebSocket Client Hook
Create `src/hooks/useWorkboard.ts` — a React hook that:
- Connects to Gateway WebSocket
- Provides `call(method, params)` function
- Manages connection state (connected/disconnected/error)
- Auto-reconnects on disconnect

### Step 2: Rewrite Tasks Page
Modify `src/app/(dashboard)/tasks/page.tsx` to:
- Use `useWorkboard` hook instead of `/api/tasks` fetch
- Map Workboard card fields → SpaceStation task fields
- Add New Card button
- Add Dispatch Ready Work button
- Add 4 new columns (Scheduled, Ready, Review, Blocked)
- Keep existing SpaceStation theme and styling
- Keep drag-and-drop via @dnd-kit

### Step 3: Remove Old API (optional)
Keep `/api/tasks` for backward compatibility but mark as deprecated.
Or remove entirely if no other consumers.

---

## Authentication

The Gateway WebSocket requires a token. Options:
1. **Read from config** — SpaceStation reads `gateway.token` from openclaw.json
2. **Prompt user** — ask for token on first load, store in localStorage
3. **Use existing session** — if user is already logged into Gateway

For now, use option 2 (localStorage) with a settings input for the Gateway URL and token.

---

## Risks

1. **WebSocket availability** — if Gateway is down, tasks page won't load
2. **Auth complexity** — users need to provide Gateway token
3. **Field mismatch** — some SpaceStation fields don't map cleanly to Workboard
4. **Real-time sync** — need to handle WebSocket push updates for live data
5. **Migration** — existing tasks.json data needs to be migrated to Workboard
