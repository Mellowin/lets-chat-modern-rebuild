"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaces, type Workspace } from "@/lib/workspaces-api";
import { getChannels, type Channel } from "@/lib/channels-api";
import { listDirectConversations, type DirectConversation } from "@/lib/direct-conversations-api";
import { createSocket } from "@/lib/socket-client";

type WorkspacesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Workspace[] }
  | { kind: "error" };

type ChannelsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Channel[] }
  | { kind: "error" };

type DirectConversationsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: DirectConversation[] }
  | { kind: "error" };

export default function Sidebar() {
  const { accessToken, isAuthenticated, isLoading: authLoading } = useAuth();
  const pathname = usePathname();

  const [workspaces, setWorkspaces] = useState<WorkspacesState>({ kind: "idle" });
  const [channels, setChannels] = useState<ChannelsState>({ kind: "idle" });
  const [directConversations, setDirectConversations] = useState<DirectConversationsState>({ kind: "idle" });

  const activeWorkspaceId = pathname?.startsWith("/workspaces/")
    ? pathname.split("/")[2]
    : null;

  const activeChannelId = pathname?.includes("/channels/")
    ? pathname.split("/")[4]
    : null;

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    let cancelled = false;
    async function load(token: string) {
      setWorkspaces({ kind: "loading" });
      try {
        const data = await getWorkspaces(token);
        if (!cancelled) {
          setWorkspaces({ kind: "success", data });
        }
      } catch {
        if (!cancelled) {
          setWorkspaces({ kind: "error" });
        }
      }
    }
    load(accessToken);

    function handleWorkspacesChanged() {
      if (!accessToken) return;
      load(accessToken);
    }

    window.addEventListener("workspaces:changed", handleWorkspacesChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("workspaces:changed", handleWorkspacesChanged);
    };
  }, [isAuthenticated, accessToken]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    let cancelled = false;
    async function load(token: string) {
      setDirectConversations({ kind: "loading" });
      try {
        const data = await listDirectConversations(token);
        if (!cancelled) {
          setDirectConversations({ kind: "success", data });
        }
      } catch {
        if (!cancelled) {
          setDirectConversations({ kind: "error" });
        }
      }
    }
    load(accessToken);

    function handleDirectConversationsChanged() {
      if (!accessToken) return;
      load(accessToken);
    }

    window.addEventListener("direct-conversations:changed", handleDirectConversationsChanged);

    const token = accessToken;
    const socket = createSocket(token);
    function handleDirectConversationUpdated() {
      load(token);
    }
    socket.on("direct:conversation:updated", handleDirectConversationUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("direct-conversations:changed", handleDirectConversationsChanged);
      socket.off("direct:conversation:updated", handleDirectConversationUpdated);
      socket.disconnect();
    };
  }, [isAuthenticated, accessToken]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken || !activeWorkspaceId) return;

    let cancelled = false;
    async function load(token: string, wsId: string) {
      setChannels({ kind: "loading" });
      try {
        const data = await getChannels(token, wsId);
        if (!cancelled) {
          setChannels({ kind: "success", data });
        }
      } catch {
        if (!cancelled) {
          setChannels({ kind: "error" });
        }
      }
    }
    load(accessToken, activeWorkspaceId);

    function handleChannelsChanged() {
      if (!accessToken || !activeWorkspaceId) return;
      load(accessToken, activeWorkspaceId);
    }

    window.addEventListener("channels:changed", handleChannelsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("channels:changed", handleChannelsChanged);
    };
  }, [isAuthenticated, accessToken, activeWorkspaceId]);

  if (authLoading || !isAuthenticated) {
    return (
      <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hidden sm:flex flex-col p-3">
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider px-2 py-1">
          Workspace
        </div>
        <div className="mt-2 px-2 text-sm text-zinc-400 dark:text-zinc-500">
          Sign in to see your workspaces
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hidden sm:flex flex-col p-3 overflow-y-auto">
      {/* Workspaces */}
      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider px-2 py-1">
        Workspaces
      </div>

      {workspaces.kind === "loading" && (
        <div className="mt-2 flex items-center gap-2 px-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          Loading…
        </div>
      )}

      {workspaces.kind === "error" && (
        <div className="mt-2 px-2 text-sm text-red-600 dark:text-red-400">
          Failed to load workspaces
        </div>
      )}

      {workspaces.kind === "success" && workspaces.data.length === 0 && (
        <div className="mt-2 px-2 text-sm text-zinc-500 dark:text-zinc-400">
          No workspaces yet
        </div>
      )}

      {workspaces.kind === "success" && workspaces.data.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {workspaces.data.map((ws) => {
            const isActive = ws.id === activeWorkspaceId;
            return (
              <li key={ws.id}>
                <Link
                  href={`/workspaces/${ws.id}`}
                  className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-100"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span className="truncate block">{ws.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Direct Messages */}
      <div className="mt-6 text-xs font-medium text-zinc-400 uppercase tracking-wider px-2 py-1">
        Direct
      </div>
      <ul className="mt-1 space-y-0.5">
        <li>
          <Link
            href="/direct"
            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
              pathname?.startsWith("/direct")
                ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-100"
                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
            }`}
          >
            <span className="truncate block">Direct messages</span>
            {directConversations.kind === "success" &&
              directConversations.data.reduce((sum, c) => sum + c.unreadCount, 0) > 0 && (
                <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-zinc-900 px-1 text-[9px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {directConversations.data.reduce((sum, c) => sum + c.unreadCount, 0) > 99
                    ? "99+"
                    : directConversations.data.reduce((sum, c) => sum + c.unreadCount, 0)}
                </span>
              )}
          </Link>
        </li>
      </ul>

      {/* Channels */}
      {activeWorkspaceId && (
        <>
          <div className="mt-6 text-xs font-medium text-zinc-400 uppercase tracking-wider px-2 py-1">
            Channels
          </div>

          {channels.kind === "loading" && (
            <div className="mt-2 flex items-center gap-2 px-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              Loading…
            </div>
          )}

          {channels.kind === "error" && (
            <div className="mt-2 px-2 text-sm text-red-600 dark:text-red-400">
              Failed to load channels
            </div>
          )}

          {channels.kind === "success" && channels.data.length === 0 && (
            <div className="mt-2 px-2 text-sm text-zinc-500 dark:text-zinc-400">
              No channels yet
            </div>
          )}

          {channels.kind === "success" && channels.data.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {channels.data.map((ch) => {
                const isActive = ch.id === activeChannelId;
                return (
                  <li key={ch.id}>
                    <Link
                      href={`/workspaces/${ch.workspaceId}/channels/${ch.id}`}
                      className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive
                          ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <span className="truncate"># {ch.name}</span>
                      <span
                        className={`shrink-0 ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
                          ch.type === "PUBLIC"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                        }`}
                      >
                        {ch.type === "PUBLIC" ? "Pub" : "Prv"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}
