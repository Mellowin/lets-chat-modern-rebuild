import { getApiBase } from "./env";
import { authFetch } from "./auth-fetch";

const API_BASE = getApiBase();

export interface AuditUserSummary {
  id: string;
  username: string;
  displayName: string | null;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  severity: string;
  actor: AuditUserSummary | null;
  targetUser: AuditUserSummary | null;
  workspaceId: string | null;
  channelId: string | null;
  groupId: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogList {
  items: AuditLogItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  severity?: string;
  actorUserId?: string;
  targetUserId?: string;
  workspaceId?: string;
  channelId?: string;
  groupId?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

async function parseErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  let message = fallback;
  try {
    const body = await res.json();
    if (body?.message) message = body.message;
    else if (body?.error) message = body.error;
  } catch {
    // ignore parse error
  }
  return message;
}

function authHeaders(accessToken: string) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

function buildQuery(filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.actorUserId) params.set("actorUserId", filters.actorUserId);
  if (filters.targetUserId) params.set("targetUserId", filters.targetUserId);
  if (filters.workspaceId) params.set("workspaceId", filters.workspaceId);
  if (filters.channelId) params.set("channelId", filters.channelId);
  if (filters.groupId) params.set("groupId", filters.groupId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit) params.set("limit", String(filters.limit));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listAdminAudit(
  accessToken: string,
  filters: AuditLogFilters = {},
): Promise<AuditLogList> {
  const res = await authFetch(`${API_BASE}/admin/audit${buildQuery(filters)}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(
        res,
        `Failed to load audit logs: ${res.status} ${res.statusText}`,
      ),
    );
  }

  return res.json() as Promise<AuditLogList>;
}

export async function getAdminAuditEvent(
  accessToken: string,
  id: string,
): Promise<AuditLogItem> {
  const res = await authFetch(`${API_BASE}/admin/audit/${id}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(
        res,
        `Failed to load audit event: ${res.status} ${res.statusText}`,
      ),
    );
  }

  return res.json() as Promise<AuditLogItem>;
}
