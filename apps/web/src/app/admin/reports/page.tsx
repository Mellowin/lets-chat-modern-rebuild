"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import {
  listAdminReports,
  getAdminReport,
  updateAdminReport,
  type AdminReport,
  type ReportStatus,
} from "@/lib/safety-api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

const STATUS_OPTIONS: ReportStatus[] = [
  "OPEN",
  "REVIEWED",
  "DISMISSED",
  "ACTION_TAKEN",
];

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "OPEN":
      return "warning";
    case "REVIEWED":
      return "default";
    case "DISMISSED":
      return "muted";
    case "ACTION_TAKEN":
      return "success";
    default:
      return "muted";
  }
}

function AdminReportCard({
  report,
  selected,
  onClick,
}: {
  report: AdminReport;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`admin-report-card-${report.id}`}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:bg-muted/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">
          {report.reportedUser.displayName || report.reportedUser.username}
        </span>
        <Badge variant={statusBadgeVariant(report.status)}>{report.status}</Badge>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {report.reason}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {formatDate(report.createdAt)}
      </p>
    </button>
  );
}

export default function AdminReportsPage() {
  const { user, accessToken, isLoading: authLoading } = useAuth();
  const { t } = useLocale();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<AdminReport | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN" || user?.role === "MODERATOR";

  const loadReports = useCallback(
    async (status?: ReportStatus) => {
      if (!accessToken) return;
      setLoading(true);
      setError(null);
      try {
        const result = await listAdminReports(
          accessToken,
          status ? { status } : {},
        );
        setReports(result.items);
        if (selectedReport) {
          const updated = result.items.find((r) => r.id === selectedReport.id);
          if (updated) setSelectedReport(updated);
        }
      } catch (err) {
        setError(localizeApiError(err, "errors.generic", t));
      } finally {
        setLoading(false);
      }
    },
    [accessToken, selectedReport, t],
  );

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReports(statusFilter === "ALL" ? undefined : statusFilter);
  }, [authLoading, isAdmin, statusFilter, loadReports]);

  const handleSelect = async (report: AdminReport) => {
    setSelectedReport(report);
    setNote(report.adminNote ?? "");
    setUpdateError(null);
    if (!accessToken) return;
    try {
      const fresh = await getAdminReport(accessToken, report.id);
      setSelectedReport(fresh);
      setNote(fresh.adminNote ?? "");
    } catch {
      // keep existing data
    }
  };

  const handleUpdate = async (newStatus?: ReportStatus) => {
    if (!accessToken || !selectedReport) return;
    setUpdating(true);
    setUpdateError(null);
    try {
      const updated = await updateAdminReport(accessToken, selectedReport.id, {
        status: newStatus,
        adminNote: note,
      });
      setSelectedReport(updated);
      setReports((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
    } catch (err) {
      setUpdateError(localizeApiError(err, "errors.generic", t));
    } finally {
      setUpdating(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
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
    <div className="flex h-full flex-col gap-4 p-4 sm:flex-row sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 sm:w-80">
        <div>
          <h1 className="text-lg font-semibold">Moderation reports</h1>
          <p className="text-sm text-muted-foreground">
            Review user-submitted reports.
          </p>
        </div>

        <div>
          <label htmlFor="status-filter" className="sr-only">
            Status filter
          </label>
          <select
            id="status-filter"
            data-testid="admin-report-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ReportStatus | "ALL")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="ALL">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {loading && reports.length === 0 && (
          <p className="text-sm text-muted-foreground">Loading reports…</p>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {!loading && reports.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">No reports found.</p>
        )}
        <div className="flex flex-col gap-2 overflow-y-auto">
          {reports.map((report) => (
            <AdminReportCard
              key={report.id}
              report={report}
              selected={selectedReport?.id === report.id}
              onClick={() => handleSelect(report)}
            />
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-sm">
        {!selectedReport ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">
              Select a report to view details.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">
                    Report on{" "}
                    {selectedReport.reportedUser.displayName ||
                      selectedReport.reportedUser.username}
                  </h2>
                  <Badge variant={statusBadgeVariant(selectedReport.status)}>
                    {selectedReport.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Reported by{" "}
                  {selectedReport.reporter.displayName ||
                    selectedReport.reporter.username}{" "}
                  on {formatDate(selectedReport.createdAt)}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Reason</p>
              <p
                className="text-sm text-muted-foreground"
                data-testid="admin-report-reason"
              >
                {selectedReport.reason}
              </p>
            </div>

            {selectedReport.details && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Details</p>
                <p
                  className="whitespace-pre-wrap text-sm text-muted-foreground"
                  data-testid="admin-report-details"
                >
                  {selectedReport.details}
                </p>
              </div>
            )}

            {(selectedReport.messageId ||
              selectedReport.directConversationId ||
              selectedReport.groupId) && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Context IDs</p>
                <ul className="text-xs text-muted-foreground">
                  {selectedReport.messageId && (
                    <li>message: {selectedReport.messageId}</li>
                  )}
                  {selectedReport.directConversationId && (
                    <li>dm: {selectedReport.directConversationId}</li>
                  )}
                  {selectedReport.groupId && (
                    <li>group: {selectedReport.groupId}</li>
                  )}
                </ul>
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="admin-note" className="text-sm font-medium">
                Admin note
              </label>
              <Input
                id="admin-note"
                data-testid="admin-report-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add an internal note…"
                disabled={updating}
              />
            </div>

            {selectedReport.reviewedAt && (
              <p className="text-xs text-muted-foreground">
                Last reviewed {formatDate(selectedReport.reviewedAt)} by{" "}
                {selectedReport.reviewedByUser?.displayName ||
                  selectedReport.reviewedByUser?.username ||
                  selectedReport.reviewedBy ||
                  "unknown"}
              </p>
            )}

            {updateError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {updateError}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => handleUpdate("REVIEWED")}
                disabled={updating}
                data-testid="admin-report-mark-reviewed"
              >
                Mark reviewed
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleUpdate("DISMISSED")}
                disabled={updating}
                data-testid="admin-report-dismiss"
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleUpdate("ACTION_TAKEN")}
                disabled={updating}
                data-testid="admin-report-action-taken"
              >
                Action taken
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleUpdate()}
                disabled={updating}
                data-testid="admin-report-save-note"
              >
                Save note
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
