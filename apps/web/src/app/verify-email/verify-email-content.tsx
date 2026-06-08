"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { verifyEmail, resendVerification } from "@/lib/auth-api";
import { useLocale } from "@/lib/locale";

type VerifyState =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "success" }
  | { kind: "error"; message: string }
  | { kind: "missing-token" }
  | { kind: "resend-loading" }
  | { kind: "resend-success"; message: string };

export default function VerifyEmailPage() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [verifyState, setVerifyState] = useState<VerifyState>({ kind: "idle" });
  const [emailInput, setEmailInput] = useState("");

  const doVerify = useCallback(async (verifyToken: string) => {
    setVerifyState({ kind: "verifying" });
    try {
      await verifyEmail({ token: verifyToken });
      setVerifyState({ kind: "success" });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("auth.emailVerificationFailed");
      setVerifyState({ kind: "error", message });
    }
  }, [t]);

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVerifyState({ kind: "missing-token" });
      return;
    }
    void doVerify(token);
  }, [token, doVerify]);

  async function handleResend() {
    const email = emailInput.trim();
    if (!email) return;
    setVerifyState({ kind: "resend-loading" });
    try {
      const data = await resendVerification({ email });
      setVerifyState({ kind: "resend-success", message: data.message });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("auth.emailVerificationFailed");
      setVerifyState({ kind: "error", message });
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">
          {t("auth.verifyEmailTitle")}
        </h1>

        <div className="mt-5 space-y-4">
          {verifyState.kind === "verifying" && (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              {t("auth.verifyingEmail")}
            </div>
          )}

          {verifyState.kind === "success" && (
            <>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {t("auth.emailVerified")}
                </div>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                {t("auth.signInAfterVerification")}
              </p>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {t("auth.signIn")}
              </Link>
            </>
          )}

          {verifyState.kind === "missing-token" && (
            <>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {t("auth.emailVerificationMissingToken")}
                </div>
              </div>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {t("auth.backToSignIn")}
              </Link>
            </>
          )}

          {verifyState.kind === "error" && (
            <>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {verifyState.message}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {t("auth.resendVerification")}
                </p>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="block w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
                />
                <button
                  type="button"
                  onClick={handleResend}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {t("auth.resendVerification")}
                </button>
              </div>

              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {t("auth.backToSignIn")}
              </Link>
            </>
          )}

          {verifyState.kind === "resend-success" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {verifyState.message}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
