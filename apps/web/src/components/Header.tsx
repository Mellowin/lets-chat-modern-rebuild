"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function Header() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  return (
    <header className="flex items-center justify-between h-14 px-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
      <Link href="/" className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-zinc-900 dark:bg-zinc-100" />
        <span className="font-semibold text-sm tracking-tight">lets-chat</span>
      </Link>

      <div className="flex items-center gap-3">
        {isLoading ? (
          <span className="text-xs text-zinc-400">Loading…</span>
        ) : isAuthenticated && user ? (
          <>
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              {user.username}
            </span>
            <button
              onClick={() => logout()}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              Create account
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
