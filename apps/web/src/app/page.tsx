"use client";

import { useState } from "react";
import Link from "next/link";
import { getHealth, type HealthResponse } from "@/lib/api";
import { getApiOrigin } from "@/lib/env";

type HealthState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: HealthResponse }
  | { kind: "error"; message: string };

export default function Home() {
  const [health, setHealth] = useState<HealthState>({ kind: "idle" });

  async function handleCheck() {
    setHealth({ kind: "loading" });
    try {
      const data = await getHealth();
      setHealth({ kind: "success", data });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error occurred";
      setHealth({ kind: "error", message });
    }
  }

  return (
    <div className="flex flex-col items-start p-6 sm:p-10 max-w-3xl">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
        lets-chat — Modern Rebuild
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Secure team collaboration platform. Backend infrastructure is
        bootstrapped and ready.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Create account
        </Link>
      </div>

      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Backend Status</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Verify the API is reachable
            </p>
          </div>
          <button
            onClick={handleCheck}
            disabled={health.kind === "loading"}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {health.kind === "loading" ? "Checking…" : "Check API Health"}
          </button>
        </div>

        <div className="mt-4">
          {health.kind === "idle" && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Click the button to run a health check against{" "}
              <code className="rounded bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 text-xs">
                /health
              </code>
              .
            </p>
          )}

          {health.kind === "loading" && (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              Contacting backend…
            </div>
          )}

          {health.kind === "success" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {health.data.status === "ok" ? "Healthy" : "Degraded"}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                <dt className="text-zinc-500 dark:text-zinc-500">Environment</dt>
                <dd className="font-mono">{health.data.environment}</dd>
                <dt className="text-zinc-500 dark:text-zinc-500">Database</dt>
                <dd className="font-mono">{health.data.database}</dd>
                <dt className="text-zinc-500 dark:text-zinc-500">Uptime</dt>
                <dd className="font-mono">
                  {Math.floor(health.data.uptime)}s
                </dd>
                <dt className="text-zinc-500 dark:text-zinc-500">Timestamp</dt>
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
                Unreachable
              </div>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                {health.message}
              </p>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                Make sure the backend is running on{" "}
                <code className="rounded bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5">
                  {getApiOrigin()}
                </code>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
