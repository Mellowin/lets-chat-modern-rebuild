"use client";

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { updateDisplayName } from "@/lib/auth-api";

type DisplayNameState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function ProfilePage() {
  const { user, accessToken, isLoading: authLoading, isAuthenticated, setUser } = useAuth();
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [displayNameState, setDisplayNameState] = useState<DisplayNameState>({ kind: "idle" });

  useLayoutEffect(() => {
    if (user?.displayName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayNameInput(user.displayName);
    }
  }, [user?.displayName]);

  async function handleUpdateDisplayName(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setDisplayNameState({ kind: "loading" });
    try {
      const updated = await updateDisplayName(accessToken, displayNameInput);
      setUser(updated);
      setDisplayNameState({ kind: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update display name";
      setDisplayNameState({ kind: "error", message });
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
            Please sign in to view your profile.
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
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        ← Back to dashboard
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Profile</h1>

      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Account information</h2>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 dark:text-zinc-400 w-20">Email</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 dark:text-zinc-400 w-20">Username</span>
            <span className="font-medium">{user?.username}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 dark:text-zinc-400 w-20">Display name</span>
            <span className="font-medium">{user?.displayName ?? "—"}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Edit display name</h2>
        <form onSubmit={handleUpdateDisplayName} className="mt-3 flex flex-col sm:flex-row items-start gap-3">
          <input
            type="text"
            placeholder="Your display name"
            value={displayNameInput}
            onChange={(e) => setDisplayNameInput(e.target.value)}
            disabled={displayNameState.kind === "loading"}
            className="flex-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={displayNameState.kind === "loading"}
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {displayNameState.kind === "loading" ? "Saving…" : "Save"}
          </button>
        </form>
        {displayNameState.kind === "success" && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Display name updated.
            </div>
          </div>
        )}
        {displayNameState.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {displayNameState.message}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
