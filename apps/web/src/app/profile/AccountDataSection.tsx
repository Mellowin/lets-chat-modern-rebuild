"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Download } from "lucide-react";

import {
  requestAccountDeletion,
  requestDataExport,
  type AuthUser,
} from "@/lib/auth-api";
import { AUTH_EVENTS } from "@/lib/auth-fetch";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";

type FormState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AccountDataSection({
  accessToken,
  user,
}: {
  accessToken: string | null;
  user: AuthUser | null;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const exportPasswordRef = useRef<HTMLInputElement>(null);
  const deletePasswordRef = useRef<HTMLInputElement>(null);
  const deletePhraseRef = useRef<HTMLInputElement>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportState, setExportState] = useState<FormState>({ kind: "idle" });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<FormState>({ kind: "idle" });
  const [deleteIdempotencyKey, setDeleteIdempotencyKey] = useState<string | null>(null);

  const openDeleteDialog = useCallback(() => {
    setDeleteIdempotencyKey(generateIdempotencyKey());
    setDeleteOpen(true);
  }, []);

  async function handleExport(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    const password = exportPasswordRef.current?.value ?? "";
    setExportState({ kind: "loading" });
    try {
      const blob = await requestDataExport(accessToken, { currentPassword: password });
      const filename = `letschat-data-export-${user?.username ?? "user"}-${new Date().toISOString().slice(0, 10)}.json`;
      downloadBlob(blob, filename);
      setExportState({ kind: "success", message: t("profile.exportDataSuccess") });
      if (exportPasswordRef.current) exportPasswordRef.current.value = "";
      setTimeout(() => setExportOpen(false), 1500);
    } catch (err) {
      const message = localizeApiError(err, "profile.exportDataFailed", t);
      setExportState({ kind: "error", message });
    }
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !deleteIdempotencyKey) return;
    const password = deletePasswordRef.current?.value ?? "";
    const phrase = deletePhraseRef.current?.value ?? "";
    if (phrase !== "DELETE MY ACCOUNT") {
      setDeleteState({ kind: "error", message: t("profile.deleteAccountPhraseMismatch") });
      return;
    }
    setDeleteState({ kind: "loading" });
    try {
      await requestAccountDeletion(accessToken, {
        currentPassword: password,
        confirmationPhrase: phrase,
        idempotencyKey: deleteIdempotencyKey,
      });
      setDeleteState({ kind: "success", message: t("profile.deleteAccountRequested") });
      if (deletePasswordRef.current) deletePasswordRef.current.value = "";
      if (deletePhraseRef.current) deletePhraseRef.current.value = "";
      // Clear actual auth state used by AuthProvider and redirect.
      setTimeout(() => {
        window.sessionStorage?.removeItem("accessToken");
        window.sessionStorage?.removeItem("refreshToken");
        window.dispatchEvent(new CustomEvent(AUTH_EVENTS.SESSION_EXPIRED));
        router.push("/login?deleted=1");
      }, 1500);
    } catch (err) {
      const message = localizeApiError(err, "profile.deleteAccountFailed", t);
      setDeleteState({ kind: "error", message });
    }
  }

  return (
    <div className="space-y-6">
      <Card data-testid="account-data-section">
        <CardHeader>
          <CardTitle>{t("profile.dataAndAccount")}</CardTitle>
          <CardDescription>
            {t("profile.exportDataDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setExportOpen(true)}
            data-testid="download-data-button"
          >
            <Download size={16} className="mr-2" />
            {t("profile.downloadMyData")}
          </Button>

          <hr className="border-border/60" />

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-destructive">
              {t("profile.deleteAccountTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("profile.deleteAccountDescription")}
            </p>
            <Button
              type="button"
              variant="danger"
              onClick={() => openDeleteDialog()}
              data-testid="delete-account-button"
            >
              <Trash2 size={16} className="mr-2" />
              {t("profile.deleteMyAccount")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <form onSubmit={handleExport}>
            <DialogHeader>
              <DialogTitle>{t("profile.exportDataTitle")}</DialogTitle>
              <DialogDescription>
                {t("profile.exportDataExplanation")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label htmlFor="export-password" className="text-sm font-medium">
                  {t("profile.exportDataPasswordLabel")}
                </label>
                <Input
                  id="export-password"
                  ref={exportPasswordRef}
                  type="password"
                  autoComplete="current-password"
                  required
                  data-testid="export-password-input"
                />
              </div>
              {exportState.kind === "error" && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                  {exportState.message}
                </div>
              )}
              {exportState.kind === "success" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
                  {exportState.message}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setExportOpen(false)}
                disabled={exportState.kind === "loading"}
              >
                {t("profile.cancel")}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={exportState.kind === "loading"}
                data-testid="export-submit-button"
              >
                {exportState.kind === "loading" && (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                )}
                {t("profile.exportDataButton")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => {
        setDeleteOpen(open);
        if (!open) setDeleteIdempotencyKey(null);
      }}>
        <DialogContent>
          <form onSubmit={handleDelete}>
            <DialogHeader>
              <DialogTitle className="text-destructive">
                {t("profile.deleteAccountTitle")}
              </DialogTitle>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{t("profile.deleteAccountGracePeriod")}</p>
                <p>{t("profile.deleteAccountMessagesRetained")}</p>
                <p>{t("profile.deleteAccountAttachmentsRemoved")}</p>
              </div>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label htmlFor="delete-password" className="text-sm font-medium">
                  {t("profile.deleteAccountPasswordLabel")}
                </label>
                <Input
                  id="delete-password"
                  ref={deletePasswordRef}
                  type="password"
                  autoComplete="current-password"
                  required
                  data-testid="delete-password-input"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="delete-phrase" className="text-sm font-medium">
                  {t("profile.deleteAccountConfirmationPhraseLabel")}
                </label>
                <Input
                  id="delete-phrase"
                  ref={deletePhraseRef}
                  type="text"
                  placeholder={t("profile.deleteAccountConfirmationPhraseHint")}
                  required
                  data-testid="delete-phrase-input"
                />
                <p className="text-xs text-muted-foreground">
                  {t("profile.deleteAccountConfirmationPhraseHint")}
                </p>
              </div>
              {deleteState.kind === "error" && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                  {deleteState.message}
                </div>
              )}
              {deleteState.kind === "success" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
                  {deleteState.message}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeleteOpen(false)}
                disabled={deleteState.kind === "loading"}
              >
                {t("profile.cancel")}
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={deleteState.kind === "loading"}
                data-testid="delete-submit-button"
              >
                {deleteState.kind === "loading" && (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                )}
                {t("profile.deleteAccountButton")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
