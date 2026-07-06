"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import {
  listAdminAudit,
  getAdminAuditEvent,
  type AuditLogItem,
  type AuditLogFilters,
} from "@/lib/audit-api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

const SEVERITY_OPTIONS = ["info", "warning", "critical"];

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function severityBadgeVariant(severity: string): BadgeVariant {
  switch (severity) {
    case "critical":
      return "danger";
    case "warning":
      return "warning";
    case "info":
      return "info";
    default:
      return "muted";
  }
}

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "muted";

function MetadataPreview({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const text = JSON.stringify(metadata);
  const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
  return (
    <span
      className="font-mono text-xs text-muted-foreground"
      title={text.length > 80 ? text : undefined}
    >
      {preview}
    </span>
  );
}

export default function AdminAuditPage() {
  const { user, accessToken, isLoading: authLoading } = useAuth();
  const { t } = useLocale();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [selected, setSelected] = useState<AuditLogItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [filters, setFilters] = useState<AuditLogFilters>({
    action: "",
    entityType: "",
    severity: "",
  });

  const isAdmin = user?.role === "ADMIN" || user?.role === "MODERATOR";

  const loadItems = useCallback(
    async (cursor?: string, append = false) => {
      if (!accessToken) return;
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const activeFilters: AuditLogFilters = {
          limit: 25,
          action: filters.action || undefined,
          entityType: filters.entityType || undefined,
          severity: filters.severity || undefined,
          cursor,
        };
        const result = await listAdminAudit(accessToken, activeFilters);
        setItems((prev) => (append ? [...prev, ...result.items] : result.items));
        setNextCursor(result.nextCursor);
        setHasMore(result.hasMore);
        if (!append) setSelected(null);
      } catch (err) {
        setError(localizeApiError(err, "errors.generic", t));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [accessToken, filters, t],
  );

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadItems();
  }, [authLoading, isAdmin, loadItems]);

  const handleSelect = async (item: AuditLogItem) => {
    if (!accessToken) return;
    setSelected(item);
    try {
      const detail = await getAdminAuditEvent(accessToken, item.id);
      setSelected(detail);
    } catch {
      // Keep the list item if detail fails
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="mt-2 text-muted-foreground">
          This page is restricted to administrators and moderators.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Audit Log</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Search and review security events across the platform.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Action (e.g. user.blocked)"
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
        />
        <Input
          placeholder="Entity type"
          value={filters.entityType}
          onChange={(e) =>
            setFilters((f) => ({ ...f, entityType: e.target.value }))
          }
        />
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={filters.severity}
          onChange={(e) =>
            setFilters((f) => ({ ...f, severity: e.target.value }))
          }
        >
          <option value="">All severities</option>
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button onClick={() => loadItems()} disabled={loading}>
          {loading ? "Loading…" : "Search"}
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          {items.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">No audit events found.</p>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                selected?.id === item.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{item.action}</span>
                <Badge variant={severityBadgeVariant(item.severity)}>
                  {item.severity}
                </Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {item.entityType} • {item.entityId}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {formatDate(item.createdAt)}
              </p>
            </button>
          ))}
          {hasMore && (
            <Button
              variant="secondary"
              onClick={() => loadItems(nextCursor ?? undefined, true)}
              disabled={loadingMore}
              className="w-full"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          )}
        </div>

        {selected && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-lg font-medium">Event details</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">ID</dt>
                <dd className="font-mono">{selected.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Action</dt>
                <dd>{selected.action}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Severity</dt>
                <dd>
                  <Badge variant={severityBadgeVariant(selected.severity)}>
                    {selected.severity}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Entity</dt>
                <dd>
                  {selected.entityType} / {selected.entityId}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Actor</dt>
                <dd>
                  {selected.actor
                    ? selected.actor.username
                    : "system"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Target</dt>
                <dd>
                  {selected.targetUser
                    ? selected.targetUser.username
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Workspace</dt>
                <dd className="font-mono">{selected.workspaceId ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Channel</dt>
                <dd className="font-mono">{selected.channelId ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Group</dt>
                <dd className="font-mono">{selected.groupId ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Request ID</dt>
                <dd className="font-mono">{selected.requestId ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDate(selected.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Metadata</dt>
                <dd className="mt-1">
                  <MetadataPreview metadata={selected.metadata} />
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
