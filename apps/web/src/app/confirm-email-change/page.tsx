"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { confirmEmailChange } from "@/lib/auth-api";
import { useLocale } from "@/lib/locale";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function ConfirmEmailChangeContent() {
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const token = searchParams.get("token");
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: "error", message: t("auth.emailChangeFailed") });
      return;
    }
    setState({ kind: "loading" });
    confirmEmailChange({ token })
      .then(() => setState({ kind: "success" }))
      .catch((err) => {
        const message = err instanceof Error ? err.message : t("auth.emailChangeFailed");
        setState({ kind: "error", message });
      });
  }, [token, t]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{t("auth.confirmEmailChangeTitle")}</h1>

        {state.kind === "loading" && (
          <div className="mt-5 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
            {t("auth.loading")}
          </div>
        )}

        {state.kind === "success" && (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t("auth.emailChanged")}
            </div>
            <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
              <Link
                href="/login"
                className="underline underline-offset-2 hover:text-emerald-900 dark:hover:text-emerald-200"
              >
                {t("auth.backToSignIn")}
              </Link>
            </p>
          </div>
        )}

        {state.kind === "error" && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {state.message}
            </div>
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">
              <Link
                href="/login"
                className="underline underline-offset-2 hover:text-red-900 dark:hover:text-red-200"
              >
                {t("auth.backToSignIn")}
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConfirmEmailChangePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
            <h1 className="text-xl font-semibold tracking-tight">Confirm email change</h1>
            <div className="mt-5 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              Loading…
            </div>
          </div>
        </div>
      }
    >
      <ConfirmEmailChangeContent />
    </Suspense>
  );
}
