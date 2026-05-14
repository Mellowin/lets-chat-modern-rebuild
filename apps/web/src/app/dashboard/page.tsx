"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaces, createWorkspace, type Workspace } from "@/lib/workspaces-api";

type WorkspacesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Workspace[] }
  | { kind: "error"; message: string };

type CreateState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export default function DashboardPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspacesState>({ kind: "idle" });
  const [createState, setCreateState] = useState<CreateState>({ kind: "idle" });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const loadWorkspaces = useCallback(async (token: string) => {
    setWorkspaces({ kind: "loading" });
    try {
      const data = await getWorkspaces(token);
      setWorkspaces({ kind: "success", data });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load workspaces";
      setWorkspaces({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    loadWorkspaces(token);
  }, [isAuthenticated, loadWorkspaces]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName || !trimmedSlug) {
      setCreateState({ kind: "error", message: "Name and slug are required" });
      return;
    }
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    setCreateState({ kind: "loading" });
    try {
      await createWorkspace(token, { name: trimmedName, slug: trimmedSlug });
      setName("");
      setSlug("");
      setCreateState({ kind: "idle" });
      await loadWorkspaces(token);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create workspace";
      setCreateState({ kind: "error", message });
    }
  }

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

      {/* Create workspace form */}
      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Create workspace</h2>
        <form onSubmit={handleCreate} className="mt-4 flex flex-col sm:flex-row items-start gap-3">
          <input
            type="text"
            placeholder="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
          <input
            type="text"
            placeholder="slug (e.g. my-team)"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="flex-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
          <button
            type="submit"
            disabled={createState.kind === "loading"}
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {createState.kind === "loading" ? "Creating…" : "Create"}
          </button>
        </form>
        {createState.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {createState.message}
            </div>
          </div>
        )}
      </div>

      {/* Workspace list */}
      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">
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
