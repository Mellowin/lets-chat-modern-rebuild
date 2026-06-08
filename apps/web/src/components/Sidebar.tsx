"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaces, type Workspace } from "@/lib/workspaces-api";
import { getChannels, type Channel } from "@/lib/channels-api";
import { listDirectConversations, type DirectConversation } from "@/lib/direct-conversations-api";
import { createSocket } from "@/lib/socket-client";
import { useLocale } from "@/lib/locale";

type WorkspacesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Workspace[] }
  | { kind: "error" };

type WorkspaceChannelsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Channel[] }
  | { kind: "error" };

type DirectConversationsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: DirectConversation[] }
  | { kind: "error" };

type SectionOrder = "direct-first" | "workspaces-first";

function getStoredSectionOrder(): SectionOrder {
  if (typeof window === "undefined") return "direct-first";
  const raw = localStorage.getItem("sidebar:section-order");
  if (raw === "workspaces-first") return "workspaces-first";
  return "direct-first";
}

export default function Sidebar() {
  const { accessToken, isAuthenticated, isLoading: authLoading } = useAuth();
  const pathname = usePathname();
  const { t } = useLocale();


  const [workspaces, setWorkspaces] = useState<WorkspacesState>({ kind: "idle" });
  const [workspaceChannels, setWorkspaceChannels] = useState<Record<string, WorkspaceChannelsState>>({});
  const [directConversations, setDirectConversations] = useState<DirectConversationsState>({ kind: "idle" });

  const [directExpanded, setDirectExpanded] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("sidebar:direct:expanded") !== "false" : true
  );
  const [workspacesExpanded, setWorkspacesExpanded] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("sidebar:workspaces:expanded") !== "false" : true
  );
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [sectionOrder, setSectionOrder] = useState<SectionOrder>(() => getStoredSectionOrder());

  const activeWorkspaceId = pathname?.startsWith("/workspaces/")
    ? pathname.split("/")[2]
    : null;

  const activeChannelId = pathname?.includes("/channels/")
    ? pathname.split("/")[4]
    : null;

  const activeDirectConversationId = pathname?.startsWith("/direct/") && pathname.split("/").length >= 3
    ? pathname.split("/")[2]
    : null;

  // Load workspaces
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    let cancelled = false;
    async function load(token: string) {
      setWorkspaces({ kind: "loading" });
      try {
        const data = await getWorkspaces(token);
        if (!cancelled) setWorkspaces({ kind: "success", data });
      } catch {
        if (!cancelled) setWorkspaces({ kind: "error" });
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

  // Load direct conversations
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    let cancelled = false;
    async function load(token: string) {
      setDirectConversations({ kind: "loading" });
      try {
        const data = await listDirectConversations(token);
        if (!cancelled) setDirectConversations({ kind: "success", data });
      } catch {
        if (!cancelled) setDirectConversations({ kind: "error" });
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
    function handlePresenceOnline(payload: {
      user: { id: string; username: string; displayName?: string | null };
      status: string;
    }) {
      setDirectConversations((prev) => {
        if (prev.kind !== "success") return prev;
        const idx = prev.data.findIndex((c) => c.otherParticipant?.id === payload.user.id);
        if (idx === -1) return prev;
        const updated = [...prev.data];
        updated[idx] = { ...updated[idx], isOnline: true };
        return { kind: "success", data: updated };
      });
    }
    function handlePresenceOffline(payload: {
      user: { id: string; username: string; displayName?: string | null };
      status: string;
    }) {
      setDirectConversations((prev) => {
        if (prev.kind !== "success") return prev;
        const idx = prev.data.findIndex((c) => c.otherParticipant?.id === payload.user.id);
        if (idx === -1) return prev;
        const updated = [...prev.data];
        updated[idx] = { ...updated[idx], isOnline: false };
        return { kind: "success", data: updated };
      });
    }
    socket.on("direct:conversation:updated", handleDirectConversationUpdated);
    socket.on("presence:online", handlePresenceOnline);
    socket.on("presence:offline", handlePresenceOffline);
    return () => {
      cancelled = true;
      window.removeEventListener("direct-conversations:changed", handleDirectConversationsChanged);
      socket.off("direct:conversation:updated", handleDirectConversationUpdated);
      socket.off("presence:online", handlePresenceOnline);
      socket.off("presence:offline", handlePresenceOffline);
      socket.disconnect();
    };
  }, [isAuthenticated, accessToken]);

  const loadChannelsForWorkspace = useCallback(async (token: string, wsId: string, force = false) => {
    if (!force) {
      setWorkspaceChannels((prev) => {
        if (prev[wsId]?.kind === "loading" || prev[wsId]?.kind === "success") return prev;
        return { ...prev, [wsId]: { kind: "loading" } };
      });
    } else {
      setWorkspaceChannels((prev) => ({ ...prev, [wsId]: { kind: "loading" } }));
    }
    try {
      const data = await getChannels(token, wsId);
      setWorkspaceChannels((prev) => ({ ...prev, [wsId]: { kind: "success", data } }));
    } catch {
      setWorkspaceChannels((prev) => ({ ...prev, [wsId]: { kind: "error" } }));
    }
  }, []);

  // Initialize workspace expansion and load active workspace channels
  const workspacesInitialized = useRef(false);
  useEffect(() => {
    if (workspaces.kind === "success" && !workspacesInitialized.current) {
      workspacesInitialized.current = true;
      const initial = new Set<string>();
      workspaces.data.forEach((ws) => {
        const stored = localStorage.getItem(`sidebar:workspace:${ws.id}:expanded`);
        if (stored === "true" || (stored === null && ws.id === activeWorkspaceId)) {
          initial.add(ws.id);
        }
      });
      setExpandedWorkspaces(initial);
      if (activeWorkspaceId && accessToken) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadChannelsForWorkspace(accessToken, activeWorkspaceId, false);
      }
    }
  }, [workspaces, activeWorkspaceId, accessToken, loadChannelsForWorkspace]);

  // Auto-expand active workspace when it changes
  useEffect(() => {
    if (!activeWorkspaceId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedWorkspaces((prev) => {
      if (prev.has(activeWorkspaceId)) return prev;
      const next = new Set(prev);
      next.add(activeWorkspaceId);
      localStorage.setItem(`sidebar:workspace:${activeWorkspaceId}:expanded`, "true");
      return next;
    });
    if (accessToken) {
      loadChannelsForWorkspace(accessToken, activeWorkspaceId, false);
    }
  }, [activeWorkspaceId, accessToken, loadChannelsForWorkspace]);

  // Reload active workspace channels on channels:changed
  useEffect(() => {
    if (!isAuthenticated || !accessToken || !activeWorkspaceId) return;
    function handleChannelsChanged() {
      if (!accessToken || !activeWorkspaceId) return;
      loadChannelsForWorkspace(accessToken, activeWorkspaceId, true);
    }
    window.addEventListener("channels:changed", handleChannelsChanged);
    return () => {
      window.removeEventListener("channels:changed", handleChannelsChanged);
    };
  }, [isAuthenticated, accessToken, activeWorkspaceId, loadChannelsForWorkspace]);

  function toggleDirect() {
    setDirectExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar:direct:expanded", next ? "true" : "false");
      return next;
    });
  }

  function toggleWorkspaces() {
    setWorkspacesExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar:workspaces:expanded", next ? "true" : "false");
      return next;
    });
  }

  function toggleWorkspace(wsId: string) {
    const willExpand = !expandedWorkspaces.has(wsId);
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (willExpand) {
        next.add(wsId);
      } else {
        next.delete(wsId);
      }
      localStorage.setItem(`sidebar:workspace:${wsId}:expanded`, next.has(wsId) ? "true" : "false");
      return next;
    });
    if (willExpand && accessToken) {
      loadChannelsForWorkspace(accessToken, wsId, false);
    }
  }

  function toggleSectionOrder() {
    setSectionOrder((prev) => {
      const next = prev === "direct-first" ? "workspaces-first" : "direct-first";
      localStorage.setItem("sidebar:section-order", next);
      return next;
    });
  }

  if (authLoading || !isAuthenticated) {
    return (
      <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hidden sm:flex flex-col p-3">
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider px-2 py-1">{t("sidebar.workspace")}</div>
        <div className="mt-2 px-2 text-sm text-zinc-400 dark:text-zinc-500">{t("sidebar.signInToSeeWorkspaces")}</div>
      </aside>
    );
  }

  const directUnreadTotal =
    directConversations.kind === "success"
      ? directConversations.data.reduce((sum, c) => sum + c.unreadCount, 0)
      : 0;

  const directSectionHeader = (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleDirect}
        data-testid="sidebar-direct-toggle"
        className="flex flex-1 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-400 uppercase tracking-wider hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
      >
        <span className={`transition-transform ${directExpanded ? "rotate-90" : ""}`}>▸</span>
        <span>{t("sidebar.direct")}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleSectionOrder();
        }}
        data-testid="sidebar-direct-move"
        aria-label={t(sectionOrder === "direct-first" ? "sidebar.moveDown" : "sidebar.moveUp")}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200"
      >
        {sectionOrder === "direct-first" ? "↓" : "↑"}
      </button>
    </div>
  );

  const workspacesSectionHeader = (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleWorkspaces}
        className="flex flex-1 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-400 uppercase tracking-wider hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
      >
        <span className={`transition-transform ${workspacesExpanded ? "rotate-90" : ""}`}>▸</span>
        <span>{t("sidebar.workspaces")}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleSectionOrder();
        }}
        data-testid="sidebar-workspaces-move"
        aria-label={t(sectionOrder === "workspaces-first" ? "sidebar.moveDown" : "sidebar.moveUp")}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200"
      >
        {sectionOrder === "workspaces-first" ? "↓" : "↑"}
      </button>
    </div>
  );

  const directSection = (
    <div data-testid="sidebar-direct-section">
      {directSectionHeader}
      {directExpanded && (
        <div className="mt-1">
          <ul className="space-y-0.5">
            <li>
              <Link
                href="/direct"
                data-testid="sidebar-direct-link"
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                  pathname?.startsWith("/direct")
                    ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
                }`}
              >
                <span className="truncate block">{t("sidebar.directMessages")}</span>
                {directUnreadTotal > 0 && (
                  <span data-testid="sidebar-direct-unread-badge" className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-zinc-900 px-1 text-[9px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                    {directUnreadTotal > 99 ? "99+" : directUnreadTotal}
                  </span>
                )}
              </Link>
            </li>
          </ul>
          {directConversations.kind === "success" && directConversations.data.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {directConversations.data.map((conv) => {
                const isActive = conv.id === activeDirectConversationId;
                const name = conv.otherParticipant?.displayName || conv.otherParticipant?.username || t("sidebar.unknownUser");
                return (
                  <li key={conv.id}>
                    <Link
                      href={`/direct/${conv.id}`}
                      data-testid={`sidebar-direct-conversation-link-${conv.id}`}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive
                          ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <span
                        data-testid={`sidebar-direct-presence-dot-${conv.id}`}
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          conv.isOnline ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                        }`}
                      />
                      <span className="truncate flex-1">{name}</span>
                      {conv.unreadCount > 0 && (
                        <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-zinc-900 px-1 text-[9px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                          {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  const workspacesSection = (
    <div data-testid="sidebar-workspaces-section">
      {workspacesSectionHeader}
      {workspacesExpanded && (
        <div className="mt-1">
          {workspaces.kind === "loading" && (
            <div className="flex items-center gap-2 px-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              {t("sidebar.loading")}
            </div>
          )}
          {workspaces.kind === "error" && (
            <div className="px-2 text-sm text-red-600 dark:text-red-400">{t("sidebar.failedToLoadWorkspaces")}</div>
          )}
          {workspaces.kind === "success" && workspaces.data.length === 0 && (
            <div className="px-2 text-sm text-zinc-500 dark:text-zinc-400">{t("sidebar.noWorkspacesYet")}</div>
          )}
          {workspaces.kind === "success" && workspaces.data.length > 0 && (
            <ul className="space-y-0.5">
              {workspaces.data.map((ws) => {
                const isExpanded = expandedWorkspaces.has(ws.id);
                const isActive = ws.id === activeWorkspaceId;
                return (
                  <li key={ws.id}>
                    <button
                      onClick={() => toggleWorkspace(ws.id)}
                      data-testid={`sidebar-workspace-toggle-${ws.id}`}
                      className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive
                          ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <span className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}>▸</span>
                      <span className="truncate flex-1 text-left">{ws.name}</span>
                    </button>
                    {isExpanded && (
                      <div className="ml-4 mt-0.5 space-y-0.5" data-testid={`sidebar-workspace-channels-${ws.id}`}>
                        <Link
                          href={`/workspaces/${ws.id}`}
                          className={`block rounded-md px-2 py-1 text-sm transition-colors ${
                            pathname === `/workspaces/${ws.id}`
                              ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-100"
                              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
                          }`}
                        >
                          <span className="truncate block">{t("sidebar.overview")}</span>
                        </Link>
                        {workspaceChannels[ws.id]?.kind === "loading" && (
                          <div className="flex items-center gap-2 px-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="inline-block h-2 w-2 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
                            {t("sidebar.loading")}
                          </div>
                        )}
                        {workspaceChannels[ws.id]?.kind === "error" && (
                          <div className="px-2 text-xs text-red-600 dark:text-red-400">{t("sidebar.failedToLoadChannels")}</div>
                        )}
                        {(() => {
                          const chState = workspaceChannels[ws.id];
                          if (chState?.kind !== "success") return null;
                          if (chState.data.length === 0) {
                            return <div className="px-2 text-xs text-zinc-500 dark:text-zinc-400">{t("sidebar.noChannelsYet")}</div>;
                          }
                          return (
                            <ul className="space-y-0.5">
                              {chState.data.map((ch) => {
                              const isChActive = ch.id === activeChannelId;
                              return (
                                <li key={ch.id}>
                                  <Link
                                    href={`/workspaces/${ws.id}/channels/${ch.id}`}
                                    data-testid={`sidebar-channel-link-${ch.id}`}
                                    className={`flex items-center justify-between rounded-md px-2 py-1 text-sm transition-colors ${
                                      isChActive
                                        ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-100"
                                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
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
                                      {ch.type === "PUBLIC" ? t("sidebar.publicShort") : t("sidebar.privateShort")}
                                    </span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        );
                      })()}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  return (
    <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hidden sm:flex flex-col p-3 overflow-y-auto">
      <div className="space-y-4">
        {sectionOrder === "direct-first" ? (
          <>
            {directSection}
            {workspacesSection}
          </>
        ) : (
          <>
            {workspacesSection}
            {directSection}
          </>
        )}
      </div>
    </aside>
  );
}
