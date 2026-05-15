"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getWorkspace, type Workspace } from "@/lib/workspaces-api";
import { getChannels, createChannel, type Channel, type CreateChannelInput } from "@/lib/channels-api";

type DetailState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Workspace }
  | { kind: "error"; message: string };

type ChannelsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Channel[] }
  | { kind: "error"; message: string };

export default function WorkspaceDetailPage() {
  const params = useParams();
  const workspaceId = typeof params.workspaceId === "string" ? params.workspaceId : "";
  const { accessToken, isLoading: authLoading, isAuthenticated } = useAuth();
  const [detail, setDetail] = useState<DetailState>({ kind: "idle" });
  const [channels, setChannels] = useState<ChannelsState>({ kind: "idle" });
  const [channelName, setChannelName] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [channelType, setChannelType] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [createChannelState, setCreateChannelState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    if (!isAuthenticated || !workspaceId) return;
    if (!accessToken) return;

    let cancelled = false;
    async function load(t: string, id: string) {
      setDetail({ kind: "loading" });
      setChannels({ kind: "loading" });
      try {
        const [wsData, chData] = await Promise.all([
          getWorkspace(t, id),
          getChannels(t, id),
        ]);
        if (!cancelled) {
          setDetail({ kind: "success", data: wsData });
          setChannels({ kind: "success", data: chData });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load workspace";
        if (!cancelled) {
          setDetail({ kind: "error", message });
          setChannels({ kind: "error", message });
        }
      }
    }
    load(accessToken, workspaceId);
    return () => { cancelled = true; };
  }, [isAuthenticated, accessToken, workspaceId]);

  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = channelName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setCreateChannelState({ kind: "error", message: "Channel name must be at least 2 characters" });
      return;
    }
    if (!accessToken || !workspaceId) return;

    setCreateChannelState({ kind: "loading" });
    try {
      const input: CreateChannelInput = {
        name: trimmedName,
        description: channelDescription.trim() || undefined,
        type: channelType,
      };
      await createChannel(accessToken, workspaceId, input);
      setChannelName("");
      setChannelDescription("");
      setChannelType("PUBLIC");
      setCreateChannelState({ kind: "idle" });
      // refresh channel list
      const refreshed = await getChannels(accessToken, workspaceId);
      setChannels({ kind: "success", data: refreshed });
      window.dispatchEvent(new Event("channels:changed"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create channel";
      setCreateChannelState({ kind: "error", message });
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
            Please sign in to view this workspace.
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

      {detail.kind === "loading" && (
        <div className="mt-6 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          Loading workspace…
        </div>
      )}

      {detail.kind === "error" && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/30">
          <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {detail.message}
          </div>
        </div>
      )}

      {detail.kind === "success" && (
        <>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            {detail.data.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {detail.data.slug}
          </p>
        </>
      )}

      {/* Create channel */}
      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Create channel</h2>
        <form onSubmit={handleCreateChannel} className="mt-4 flex flex-col gap-3">
          <input
            type="text"
            placeholder="Channel name"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={channelDescription}
            onChange={(e) => setChannelDescription(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
          <div className="flex items-center gap-3">
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value as "PUBLIC" | "PRIVATE")}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
            >
              <option value="PUBLIC">Public</option>
              <option value="PRIVATE">Private</option>
            </select>
            <button
              type="submit"
              disabled={createChannelState.kind === "loading"}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              {createChannelState.kind === "loading" ? "Creating…" : "Create channel"}
            </button>
          </div>
        </form>
        {createChannelState.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {createChannelState.message}
            </div>
          </div>
        )}
      </div>

      {/* Channel list */}
      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold">Channels</h2>

        {channels.kind === "loading" && (
          <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
            Loading channels…
          </div>
        )}

        {channels.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {channels.message}
            </div>
          </div>
        )}

        {channels.kind === "success" && channels.data.length === 0 && (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No channels yet.
          </p>
        )}

        {channels.kind === "success" && channels.data.length > 0 && (
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {channels.data.map((ch) => (
              <li key={ch.id}>
                <Link
                  href={`/workspaces/${workspaceId}/channels/${ch.id}`}
                  className="flex items-center justify-between py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 -mx-2 px-2 rounded-md transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{ch.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {ch.slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ch.description && (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate max-w-[12rem]">
                        {ch.description}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        ch.type === "PUBLIC"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                      }`}
                    >
                      {ch.type}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
