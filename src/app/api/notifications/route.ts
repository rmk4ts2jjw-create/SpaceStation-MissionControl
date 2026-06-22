import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { OPENCLAW_WORKSPACE } from '@/lib/paths';

// ── Types ───────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  link?: string;
  source?: string;       // 'incident' | 'system'
  metadata?: Record<string, unknown>;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

// ── Paths ───────────────────────────────────────────────────────────────────

const LOCAL_DATA_PATH = `${process.cwd()}/data/notifications.json`;
const INCIDENTS_PATH = `${OPENCLAW_WORKSPACE}/data/incidents.json`;

// ── Incident → Notification mapping ──────────────────────────────────────────

const SEVERITY_TO_TYPE: Record<string, Notification['type']> = {
  P1: 'error',
  P2: 'warning',
  P3: 'warning',
  P4: 'info',
};

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  summary: string;
  opened: string;
  lastActivity: string;
  tags?: string[];
  _recurrence?: number;
}

function loadIncidents(): Incident[] {
  try {
    if (!existsSync(INCIDENTS_PATH)) return [];
    const raw = readFileSync(INCIDENTS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function incidentsToNotifications(incidents: Incident[]): Notification[] {
  const activeStatuses = new Set(['TRIAGE', 'OPEN', 'MITIGATING', 'AWAITING_REVIEW']);

  return incidents
    .filter((inc) => activeStatuses.has(inc.status))
    .map((inc) => ({
      id: `inc-${inc.id}`,
      timestamp: inc.opened,
      title: inc.severity ? `[${inc.severity}] ${inc.title}` : inc.title,
      message: inc.summary || 'No details available.',
      type: SEVERITY_TO_TYPE[inc.severity] || 'warning',
      read: false,
      link: '/incidents',
      source: 'incident',
      metadata: {
        incidentId: inc.id,
        severity: inc.severity,
        status: inc.status,
        tags: inc.tags || [],
        recurrence: inc._recurrence || 1,
      },
    }));
}

// ── Local notification store (for system notifications + read state) ────────

function loadLocalNotifications(): Notification[] {
  try {
    if (!existsSync(LOCAL_DATA_PATH)) return [];
    const raw = readFileSync(LOCAL_DATA_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalNotifications(notifications: Notification[]): void {
  writeFileSync(LOCAL_DATA_PATH, JSON.stringify(notifications, null, 2));
}

// ── Merge: live incidents override incident-sourced notifications ────────────

function mergeNotifications(
  local: Notification[],
  fromIncidents: Notification[]
): Notification[] {
  // Build a map of incident-sourced IDs
  const incidentIds = new Set(fromIncidents.map((n) => n.id));

  // Keep local notifications that are NOT from incidents (system notifications)
  // and preserve their read state
  const systemNotifications = local.filter((n) => !incidentIds.has(n.id));

  // For incident notifications: use the live data, but preserve read state
  // from local store if the user has already read it
  const localReadMap = new Map(
    local.filter((n) => incidentIds.has(n.id)).map((n) => [n.id, n.read])
  );

  const mergedIncidents = fromIncidents.map((n) => ({
    ...n,
    read: localReadMap.get(n.id) ?? n.read,
  }));

  // Combine: incidents first (sorted by timestamp), then system
  const all = [...mergedIncidents, ...systemNotifications];
  all.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return all;
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const onlyUnread = searchParams.get('unread') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    // Load live incidents and convert to notifications
    const incidents = loadIncidents();
    const incidentNotifications = incidentsToNotifications(incidents);

    // Load local store (for system notifications + read state)
    const local = loadLocalNotifications();

    // Merge: live incidents take precedence for incident-sourced notifications
    let notifications = mergeNotifications(local, incidentNotifications);

    // Filter by read status if requested
    if (onlyUnread) {
      notifications = notifications.filter((n) => !n.read);
    }

    // Apply limit
    notifications = notifications.slice(0, limit);

    // Count unread from the full merged set
    const allMerged = mergeNotifications(local, incidentNotifications);
    const unreadCount = allMerged.filter((n) => !n.read).length;

    return NextResponse.json<NotificationsResponse>({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('[notifications] Failed to get notifications:', error);
    return NextResponse.json(
      { error: 'Failed to get notifications' },
      { status: 500 }
    );
  }
}

// ── POST (system notifications) ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.title || !body.message) {
      return NextResponse.json(
        { error: 'Missing required fields: title, message' },
        { status: 400 }
      );
    }

    const validTypes = ['info', 'success', 'warning', 'error'];
    const type = body.type || 'info';
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const local = loadLocalNotifications();

    const newNotification: Notification = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      title: body.title,
      message: body.message,
      type,
      read: false,
      link: body.link,
      source: 'system',
      metadata: body.metadata,
    };

    local.unshift(newNotification);

    // Keep only last 100 system notifications
    if (local.length > 100) {
      local.splice(100);
    }

    saveLocalNotifications(local);

    return NextResponse.json(newNotification, { status: 201 });
  } catch (error) {
    console.error('[notifications] Failed to create notification:', error);
    return NextResponse.json(
      { error: 'Failed to create notification' },
      { status: 500 }
    );
  }
}

// ── PATCH (mark read/unread) ────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, read, action } = body;

    const local = loadLocalNotifications();

    // Mark all as read
    if (action === 'markAllRead') {
      local.forEach((n) => (n.read = true));
      saveLocalNotifications(local);
      return NextResponse.json({ success: true, updated: local.length });
    }

    // Mark single notification as read/unread
    if (id) {
      const notification = local.find((n) => n.id === id);
      if (!notification) {
        // If not in local store, it might be an incident notification
        // that hasn't been persisted yet — add it
        const incidents = loadIncidents();
        const inc = incidents.find((i) => `inc-${i.id}` === id);
        if (inc) {
          const newNotif: Notification = {
            id: `inc-${inc.id}`,
            timestamp: inc.opened,
            title: `[${inc.severity}] ${inc.title}`,
            message: inc.summary || 'No details available.',
            type: SEVERITY_TO_TYPE[inc.severity] || 'warning',
            read: read !== undefined ? read : true,
            link: '/incidents',
            source: 'incident',
            metadata: { incidentId: inc.id, severity: inc.severity, status: inc.status },
          };
          local.unshift(newNotif);
          saveLocalNotifications(local);
          return NextResponse.json(newNotif);
        }
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }

      notification.read = read !== undefined ? read : !notification.read;
      saveLocalNotifications(local);
      return NextResponse.json(notification);
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    console.error('[notifications] Failed to update notification:', error);
    return NextResponse.json(
      { error: 'Failed to update notification' },
      { status: 500 }
    );
  }
}

// ── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action');

    const local = loadLocalNotifications();

    // Delete all read notifications
    if (action === 'clearRead') {
      const updated = local.filter((n) => !n.read);
      saveLocalNotifications(updated);
      return NextResponse.json({
        success: true,
        deleted: local.length - updated.length,
      });
    }

    // Delete single notification
    if (id) {
      const index = local.findIndex((n) => n.id === id);
      if (index === -1) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }

      local.splice(index, 1);
      saveLocalNotifications(local);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    console.error('[notifications] Failed to delete notification:', error);
    return NextResponse.json(
      { error: 'Failed to delete notification' },
      { status: 500 }
    );
  }
}
