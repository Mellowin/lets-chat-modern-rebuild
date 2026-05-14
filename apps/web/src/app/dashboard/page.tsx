"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaces, type Workspace } from "@/lib/workspaces-api";

type WorkspacesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Workspace[] }
  | { kind: "error"; message: string };

export default function DashboardPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspacesState>({ kind: "idle" });

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;
    async function load(t: string) {
      setWorkspaces({ kind: "loading" });
      try {
        const data = await getWorkspaces(t);
        if (!cancelled) setWorkspaces({ kind: "success", data });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load workspaces";
        if (!cancelled) setWorkspaces({ kind: "error", message });
      }
    }
    load(token);
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          Loading session…
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Authentication required</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Please sign in to view your dashboard.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-6 sm:p-10 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome, {user?.username}
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        You are signed in as {user?.email}.
      </p>

      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your Workspaces</h2>
        </div>

        <div className="mt-3">
          {workspaces.kind === "idle" || workspaces.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 py-4">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              Loading workspaces…
            </div>
          ) : workspaces.kind === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
              <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {workspaces.message}
              </div>
            </div>
          ) : workspaces.data.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">
              No workspaces yet. Create one to get started.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {workspaces.data.map((ws) => (
                <li
                  key={ws.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{ws.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {ws.slug}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {new Date(ws.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
