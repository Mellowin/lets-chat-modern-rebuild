import { getApiBase } from "./env";
import { authFetch } from "./auth-fetch";

const API_BASE = getApiBase();

export interface BlockedUser {
  id: string;
  blockedUserId: string;
  reason: string | null;
  createdAt: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface BlockUserInput {
  userId: string;
  reason?: string;
}

export interface ReportInput {
  reportedUserId: string;
  reason: string;
  details?: string;
  messageId?: string;
  directConversationId?: string;
  groupId?: string;
}

export interface AdminReportUserSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export type ReportStatus = "OPEN" | "REVIEWED" | "DISMISSED" | "ACTION_TAKEN";

export interface AdminReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  messageId: string | null;
  directConversationId: string | null;
  groupId: string | null;
  reason: string;
  details: string | null;
  status: ReportStatus;
  adminNote: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  reporter: AdminReportUserSummary;
  reportedUser: AdminReportUserSummary;
  reviewedByUser: AdminReportUserSummary | null;
}

export interface AdminReportList {
  items: AdminReport[];
  nextCursor: string | null;
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

export async function listBlockedUsers(
  accessToken: string,
): Promise<BlockedUser[]> {
  const res = await authFetch(`${API_BASE}/blocks`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to load blocked users: ${res.status} ${res.statusText}`),
    );
  }

  return res.json() as Promise<BlockedUser[]>;
}

export async function blockUser(
  accessToken: string,
  input: BlockUserInput,
): Promise<BlockedUser> {
  const res = await authFetch(`${API_BASE}/blocks`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to block user: ${res.status} ${res.statusText}`),
    );
  }

  return res.json() as Promise<BlockedUser>;
}

export async function unblockUser(
  accessToken: string,
  blockedUserId: string,
): Promise<{ success: boolean }> {
  const res = await authFetch(
    `${API_BASE}/blocks/${encodeURIComponent(blockedUserId)}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    },
  );

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to unblock user: ${res.status} ${res.statusText}`),
    );
  }

  return res.json() as Promise<{ success: boolean }>;
}

export async function submitReport(
  accessToken: string,
  input: ReportInput,
): Promise<{ success: boolean }> {
  const res = await authFetch(`${API_BASE}/reports`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to submit report: ${res.status} ${res.statusText}`),
    );
  }

  return res.json() as Promise<{ success: boolean }>;
}

export async function listAdminReports(
  accessToken: string,
  params: { status?: ReportStatus; cursor?: string; limit?: number } = {},
): Promise<AdminReportList> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  const res = await authFetch(`${API_BASE}/admin/reports${query ? `?${query}` : ""}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to load reports: ${res.status} ${res.statusText}`),
    );
  }

  return res.json() as Promise<AdminReportList>;
}

export async function getAdminReport(
  accessToken: string,
  reportId: string,
): Promise<AdminReport> {
  const res = await authFetch(
    `${API_BASE}/admin/reports/${encodeURIComponent(reportId)}`,
    {
      method: "GET",
      headers: authHeaders(accessToken),
    },
  );

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to load report: ${res.status} ${res.statusText}`),
    );
  }

  return res.json() as Promise<AdminReport>;
}

export async function updateAdminReport(
  accessToken: string,
  reportId: string,
  input: { status?: ReportStatus; adminNote?: string },
): Promise<AdminReport> {
  const res = await authFetch(
    `${API_BASE}/admin/reports/${encodeURIComponent(reportId)}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to update report: ${res.status} ${res.statusText}`),
    );
  }

  return res.json() as Promise<AdminReport>;
}

// ── Admin diagnostics ───────────────────────────────────────────────

export type DiagnosticsCheckStatus = "ok" | "not_configured" | "error";

export interface DiagnosticsCheck {
  status: DiagnosticsCheckStatus;
  detail?: string;
}

export interface DiagnosticsHealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  requestId?: string;
  checks: {
    api: DiagnosticsCheck;
    database: DiagnosticsCheck;
    redis: DiagnosticsCheck;
    push: DiagnosticsCheck;
    attachments: DiagnosticsCheck;
    mail: DiagnosticsCheck;
  };
}

export interface DiagnosticsConfigResponse {
  push: boolean;
  pwa: boolean;
  attachments: boolean;
  email: boolean;
  redis: boolean;
  rateLimit: boolean;
  websocket: boolean;
  adminModeration: boolean;
  messageSearch: boolean;
}

export interface DiagnosticsChecksResponse {
  timestamp: string;
  requestId?: string;
  checks: DiagnosticsHealthResponse["checks"];
}

export async function getAdminDiagnosticsHealth(
  accessToken: string,
): Promise<DiagnosticsHealthResponse> {
  const res = await authFetch(`${API_BASE}/admin/diagnostics/health`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to load health diagnostics: ${res.status} ${res.statusText}`),
    );
  }
  return res.json() as Promise<DiagnosticsHealthResponse>;
}

export async function getAdminDiagnosticsConfig(
  accessToken: string,
): Promise<DiagnosticsConfigResponse> {
  const res = await authFetch(`${API_BASE}/admin/diagnostics/config`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to load diagnostics config: ${res.status} ${res.statusText}`),
    );
  }
  return res.json() as Promise<DiagnosticsConfigResponse>;
}

export async function getAdminDiagnosticsChecks(
  accessToken: string,
): Promise<DiagnosticsChecksResponse> {
  const res = await authFetch(`${API_BASE}/admin/diagnostics/checks`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to load diagnostics checks: ${res.status} ${res.statusText}`),
    );
  }
  return res.json() as Promise<DiagnosticsChecksResponse>;
}
