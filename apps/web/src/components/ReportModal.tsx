"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { submitReport } from "@/lib/safety-api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string;
  reportedUserId: string;
  reportedUserName: string;
  messageId?: string;
  directConversationId?: string;
  groupId?: string;
  onSubmitted?: () => void;
}

export function ReportModal({
  isOpen,
  onClose,
  accessToken,
  reportedUserId,
  reportedUserName,
  messageId,
  directConversationId,
  groupId,
  onSubmitted,
}: ReportModalProps) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) return;

    setLoading(true);
    setError(null);
    try {
      await submitReport(accessToken, {
        reportedUserId,
        reason: trimmedReason,
        details: details.trim() || undefined,
        messageId,
        directConversationId,
        groupId,
      });
      setSuccess(true);
      setReason("");
      setDetails("");
      onSubmitted?.();
    } catch (err) {
      setError(localizeApiError(err, "safety.reportFailed", t));
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setReason("");
    setDetails("");
    setError(null);
    setSuccess(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 sm:pt-24"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t("safety.reportUser")}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("safety.reportUser")}</h2>
          <Button variant="icon" size="sm" onClick={handleClose} aria-label={t("channel.cancel")}>
            <X size={18} />
          </Button>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          {reportedUserName}
        </p>

        {success ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
            {t("safety.reportSubmitted")}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-1">
              <label htmlFor="report-reason" className="block text-sm font-medium">
                {t("safety.reportReason")}
              </label>
              <Input
                id="report-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("safety.reportReason")}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="report-details" className="block text-sm font-medium">
                {t("safety.reportDetails")}
              </label>
              <textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={t("safety.reportDetailsPlaceholder")}
                rows={4}
                disabled={loading}
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
                {t("channel.cancel")}
              </Button>
              <Button type="submit" disabled={loading || !reason.trim()}>
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  t("safety.submitReport")
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
