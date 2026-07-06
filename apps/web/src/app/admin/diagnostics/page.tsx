"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import {
  getAdminDiagnosticsHealth,
  getAdminDiagnosticsConfig,
  type DiagnosticsHealthResponse,
  type DiagnosticsConfigResponse,
} from "@/lib/safety-api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Loader2, RefreshCw, Activity, Database, Server, Mail, HardDrive, Radio, Search, Shield, MessageSquare } from "lucide-react";

type CheckKey = keyof DiagnosticsHealthResponse["checks"];

const CHECK_ICONS: Record<CheckKey, typeof Activity> = {
  api: Activity,
  database: Database,
  redis: Server,
  push: Radio,
  attachments: HardDrive,
  mail: Mail,
};

const CHECK_LABELS: Record<CheckKey, string> = {
  api: "API",
  database: "Database",
  redis: "Redis",
  push: "Push notifications",
  attachments: "Attachments",
  mail: "Mail",
};

function statusBadgeVariant(status: string) {
  switch (status) {
    case "ok":
      return "success";
    case "not_configured":
      return "muted";
    case "error":
      return "danger";
    default:
      return "default";
  }
}

function CapabilityCard({
  label,
  enabled,
  icon: Icon,
}: {
  label: string;
  enabled: boolean;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <Badge variant={enabled ? "success" : "muted"}>{enabled ? "Enabled" : "Disabled"}</Badge>
      </div>
    </div>
  );
}

function CheckCard({
  checkKey,
  check,
}: {
  checkKey: CheckKey;
  check: DiagnosticsHealthResponse["checks"][CheckKey];
}) {
  const Icon = CHECK_ICONS[checkKey];
  return (
    <div
      className="rounded-lg border border-border bg-card p-3"
      data-testid={`diagnostics-check-${checkKey}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium">{CHECK_LABELS[checkKey]}</span>
        </div>
        <Badge variant={statusBadgeVariant(check.status)}>{check.status}</Badge>
      </div>
      {check.detail && (
        <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
      )}
    </div>
  );
}

export default function AdminDiagnosticsPage() {
  const { user, accessToken, isLoading: authLoading } = useAuth();
  const { t } = useLocale();
  const [health, setHealth] = useState<DiagnosticsHealthResponse | null>(null);
  const [config, setConfig] = useState<DiagnosticsConfigResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN" || user?.role === "MODERATOR";

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [healthResult, configResult] = await Promise.all([
        getAdminDiagnosticsHealth(accessToken),
        getAdminDiagnosticsConfig(accessToken),
      ]);
      setHealth(healthResult);
      setConfig(configResult);
    } catch (err) {
      setError(localizeApiError(err, "errors.generic", t));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [authLoading, isAdmin, load]);

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <h1 className="text-lg font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Diagnostics</h1>
          <p className="text-sm text-muted-foreground">
            Production-safe health signals and capability summary.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          data-testid="diagnostics-refresh-button"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {error && (
        <div
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          data-testid="diagnostics-error"
        >
          {error}
        </div>
      )}

      {loading && !health && !config && (
        <div
          className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
          data-testid="diagnostics-loading"
        >
          <Loader2 size={16} className="animate-spin" />
          Loading diagnostics…
        </div>
      )}

      {!loading && !error && !health && !config && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No diagnostics data available.
        </div>
      )}

      {health && (
        <div className="space-y-2" data-testid="diagnostics-health-section">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <div>
              <p className="text-sm font-medium">Overall status</p>
              <p className="text-xs text-muted-foreground">
                Last checked: {new Date(health.timestamp).toLocaleString()}
                {health.requestId && (
                  <span className="ml-2">Request ID: {health.requestId}</span>
                )}
              </p>
            </div>
            <Badge variant={health.status === "ok" ? "success" : "warning"}>
              {health.status}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(health.checks) as CheckKey[]).map((key) => (
              <CheckCard key={key} checkKey={key} check={health.checks[key]} />
            ))}
          </div>
        </div>
      )}

      {config && (
        <div className="space-y-2" data-testid="diagnostics-config-section">
          <h2 className="text-sm font-semibold">Capabilities</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <CapabilityCard label="Push" enabled={config.push} icon={Radio} />
            <CapabilityCard label="PWA" enabled={config.pwa} icon={Activity} />
            <CapabilityCard label="Attachments" enabled={config.attachments} icon={HardDrive} />
            <CapabilityCard label="Email" enabled={config.email} icon={Mail} />
            <CapabilityCard label="Redis" enabled={config.redis} icon={Server} />
            <CapabilityCard label="Rate limit" enabled={config.rateLimit} icon={Shield} />
            <CapabilityCard label="WebSocket" enabled={config.websocket} icon={MessageSquare} />
            <CapabilityCard label="Admin moderation" enabled={config.adminModeration} icon={Shield} />
            <CapabilityCard label="Message search" enabled={config.messageSearch} icon={Search} />
          </div>
        </div>
      )}
    </div>
  );
}
