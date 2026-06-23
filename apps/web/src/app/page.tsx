"use client";

import { useState } from "react";
import Link from "next/link";
import { getHealth, type HealthResponse } from "@/lib/api";
import { getApiOrigin } from "@/lib/env";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";

type HealthState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: HealthResponse }
  | { kind: "error"; message: string };

export default function Home() {
  const { t } = useLocale();
  const [health, setHealth] = useState<HealthState>({ kind: "idle" });

  async function handleCheck() {
    setHealth({ kind: "loading" });
    try {
      const data = await getHealth();
      setHealth({ kind: "success", data });
    } catch (err) {
      const message = localizeApiError(err, "home.unknownError", t);
      setHealth({ kind: "error", message });
    }
  }

  return (
    <div className="flex flex-col items-start p-6 sm:p-10 max-w-3xl">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
        {t("home.title")}
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {t("home.description")}
      </p>

      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
        >
          {t("header.signIn")}
        </Link>
        <Link
          href="/register"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          {t("header.createAccount")}
        </Link>
        <Link
          href="/project-status"
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          {t("home.projectStatus")}
        </Link>
      </div>

      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">{t("home.backendStatus")}</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {t("home.verifyApi")}
            </p>
          </div>
          <button
            onClick={handleCheck}
            disabled={health.kind === "loading"}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {health.kind === "loading" ? t("home.checking") : t("home.checkApiHealth")}
          </button>
        </div>

        <div className="mt-4">
          {health.kind === "idle" && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {t("home.clickToCheck")}
            </p>
          )}

          {health.kind === "loading" && (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              {t("home.contactingBackend")}
            </div>
          )}

          {health.kind === "success" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {health.data.status === "ok" ? t("home.healthy") : t("home.degraded")}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                <dt className="text-zinc-500 dark:text-zinc-500">{t("home.environment")}</dt>
                <dd className="font-mono">{health.data.environment}</dd>
                <dt className="text-zinc-500 dark:text-zinc-500">{t("home.database")}</dt>
                <dd className="font-mono">{health.data.database}</dd>
                <dt className="text-zinc-500 dark:text-zinc-500">{t("home.uptime")}</dt>
                <dd className="font-mono">
                  {Math.floor(health.data.uptime)}s
                </dd>
                <dt className="text-zinc-500 dark:text-zinc-500">{t("home.timestamp")}</dt>
                <dd className="font-mono">
                  {new Date(health.data.timestamp).toLocaleTimeString()}
                </dd>
              </dl>
            </div>
          )}

          {health.kind === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
              <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {t("home.unreachable")}
              </div>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                {health.message}
              </p>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                {t("home.makeSureBackend", getApiOrigin())}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
