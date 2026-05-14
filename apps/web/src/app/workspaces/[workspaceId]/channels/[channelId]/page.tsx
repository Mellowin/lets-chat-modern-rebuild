"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getChannel, type Channel } from "@/lib/channels-api";

type ChannelState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Channel }
  | { kind: "error"; message: string };

export default function ChannelDetailPage() {
  const params = useParams();
  const workspaceId =
    typeof params.workspaceId === "string" ? params.workspaceId : "";
  const channelId =
    typeof params.channelId === "string" ? params.channelId : "";
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [channel, setChannel] = useState<ChannelState>({ kind: "idle" });

  useEffect(() => {
    if (!isAuthenticated || !workspaceId || !channelId) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;
    async function load(t: string, ws: string, ch: string) {
      setChannel({ kind: "loading" });
      try {
        const data = await getChannel(t, ws, ch);
        if (!cancelled) setChannel({ kind: "success", data });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load channel";
        if (!cancelled) setChannel({ kind: "error", message });
      }
    }
    load(token, workspaceId, channelId);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, workspaceId, channelId]);

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
            Please sign in to view this channel.
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
        href={`/workspaces/${workspaceId}`}
        className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        ← Back to workspace
      </Link>

      {channel.kind === "loading" && (
        <div className="mt-6 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          Loading channel…
        </div>
      )}

      {channel.kind === "error" && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/30">
          <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {channel.message}
          </div>
        </div>
      )}

      {channel.kind === "success" && (
        <>
          <div className="mt-6 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {channel.data.name}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                channel.data.type === "PUBLIC"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
              }`}
            >
              {channel.data.type}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {channel.data.slug}
          </p>
          {channel.data.description && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {channel.data.description}
            </p>
          )}

          <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">
            <h2 className="text-sm font-semibold">Messages</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Messages will appear here.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
