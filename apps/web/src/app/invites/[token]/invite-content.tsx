"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { previewInvite, acceptInviteByToken, type AcceptInviteResult } from "@/lib/invites-api";

type PreviewState =
  | { kind: "loading" }
  | { kind: "success"; data: { workspaceName: string | null; expiresAt: string; valid: boolean } }
  | { kind: "error"; message: string };

type AcceptState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; result: AcceptInviteResult }
  | { kind: "error"; message: string };

export default function InviteAcceptContent() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const { t } = useLocale();
  const { isLoading: authLoading, isAuthenticated, accessToken } = useAuth();


  const [preview, setPreview] = useState<PreviewState>({ kind: "loading" });
  const [acceptState, setAcceptState] = useState<AcceptState>({ kind: "idle" });

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview({ kind: "error", message: t("invite.invalidOrExpired") });
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const data = await previewInvite(token);
        if (!cancelled) setPreview({ kind: "success", data });
      } catch (err) {
        const message = err instanceof Error ? err.message : t("invite.invalidOrExpired");
        if (!cancelled) setPreview({ kind: "error", message });
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token, t]);

  async function handleAccept() {
    if (!accessToken || !token) return;
    setAcceptState({ kind: "loading" });
    try {
      const result = await acceptInviteByToken(accessToken, token);
      setAcceptState({ kind: "success", result });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("invite.acceptFailed");
      setAcceptState({ kind: "error", message });
    }
  }

  const expiresAt = preview.kind === "success" ? new Date(preview.data.expiresAt) : null;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">
          {t("invite.acceptInvite")}
        </h1>

        <div className="mt-5 space-y-4">
          {preview.kind === "loading" && (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              {t("invite.loadingInvite")}
            </div>
          )}

          {preview.kind === "error" && (
            <>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {preview.message}
                </div>
              </div>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {t("invite.goToLogin")}
              </Link>
            </>
          )}

          {preview.kind === "success" && !preview.data.valid && (
            <>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {t("invite.invalidOrExpired")}
                </div>
              </div>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {t("invite.goToLogin")}
              </Link>
            </>
          )}

          {preview.kind === "success" && preview.data.valid && (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                {t("invite.invitedToJoin")}{" "}
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {preview.data.workspaceName || t("workspace.fallbackThisWorkspace")}
                </span>
                .
              </p>

              {expiresAt && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {t("invite.inviteExpires")}:{" "}
                  {expiresAt.toLocaleDateString()}{" "}
                  {expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}

              {acceptState.kind === "success" ? (
                <>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                    <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      {t("invite.inviteAccepted")}
                    </div>
                  </div>
                  <Link
                    href={`/workspaces/${acceptState.result.workspaceId}`}
                    className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                  >
                    {t("invite.goToWorkspace")}
                  </Link>
                </>
              ) : authLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
                  {t("auth.loadingSession")}
                </div>
              ) : isAuthenticated ? (
                <>
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={acceptState.kind === "loading"}
                    className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                  >
                    {acceptState.kind === "loading" ? t("invite.acceptingInvite") : t("invite.acceptInvite")}
                  </button>

                  {acceptState.kind === "error" && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                      <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        {acceptState.message}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
                    <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-400">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      {t("invite.signInToAccept")}
                    </div>
                  </div>
                  <Link
                    href="/login"
                    className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                  >
                    {t("invite.goToLogin")}
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
