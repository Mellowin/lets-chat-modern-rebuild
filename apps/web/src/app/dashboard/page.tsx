"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  if (isLoading) {
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
        <h2 className="text-sm font-semibold">Dashboard</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Workspace list and chat will be available in upcoming phases.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => logout()}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
