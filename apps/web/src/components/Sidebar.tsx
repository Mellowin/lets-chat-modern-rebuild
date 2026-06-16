"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Users,
  ChevronRight,
  Hash,
  Globe,
  ArrowUp,
  ArrowDown,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaces, type Workspace } from "@/lib/workspaces-api";
import { getChannels, type Channel } from "@/lib/channels-api";
import { listDirectConversations, type DirectConversation } from "@/lib/direct-conversations-api";
import { type Message } from "@/lib/messages-api";
import { createSocket } from "@/lib/socket-client";
import { useLocale } from "@/lib/locale";
import { dispatchGlobalUnread, updateDocumentTitle } from "@/lib/global-unread";
import { Badge } from "@/components/ui/Badge";

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

function unreadBadge(count: number, testId?: string) {
  if (count <= 0) return null;
  return (
    <Badge variant="muted" className="ml-1.5" data-testid={testId}>
      {count > 99 ? "99+" : count}
    </Badge>
  );
}

interface SidebarProps {
  mobileOpen?: boolean;
}

export default function Sidebar({ mobileOpen = false }: SidebarProps) {
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

  const { user } = useAuth();
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const joinedChannelRoomsRef = useRef<Set<string>>(new Set());
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const activeChannelIdRef = useRef(activeChannelId);
  const userIdRef = useRef(user?.id);
  const accessTokenRef = useRef(accessToken);
  const loadChannelsForWorkspaceRef = useRef<(token: string, wsId: string, force?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);
  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

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

  function syncChannelRooms(channels: Channel[], wsId: string) {
    const socket = socketRef.current;
    if (!socket) return;
    for (const roomId of joinedChannelRoomsRef.current) {
      if (!channels.some((ch) => ch.id === roomId)) {
        socket.emit("channel:leave", { channelId: roomId });
        joinedChannelRoomsRef.current.delete(roomId);
      }
    }
    for (const ch of channels) {
      if (!joinedChannelRoomsRef.current.has(ch.id)) {
        socket.emit("channel:join", { workspaceId: wsId, channelId: ch.id });
        joinedChannelRoomsRef.current.add(ch.id);
      }
    }
  }

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
    socketRef.current = socket;
    const joinedRooms = joinedChannelRoomsRef.current;
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
    function handleMessageCreated(msg: Message) {
      if (msg.author.id === userIdRef.current) return;
      const activeCh = activeChannelIdRef.current;
      if (msg.channelId === activeCh) return;
      const activeWs = activeWorkspaceIdRef.current;
      if (!activeWs) return;
      setWorkspaceChannels((prev) => {
        const wsState = prev[activeWs];
        if (wsState?.kind !== "success") return prev;
        const idx = wsState.data.findIndex((ch) => ch.id === msg.channelId);
        if (idx === -1) return prev;
        const next = [...wsState.data];
        const ch = next[idx];
        next[idx] = {
          ...ch,
          unreadCount: (ch.unreadCount ?? 0) + 1,
          hasUnread: true,
        };
        return { ...prev, [activeWs]: { kind: "success", data: next } };
      });
    }
    function handleConnect() {
      const activeWs = activeWorkspaceIdRef.current;
      if (activeWs) {
        loadChannelsForWorkspaceRef.current(token, activeWs, true);
      }
      load(token);
    }
    socket.on("connect", handleConnect);
    socket.on("direct:conversation:updated", handleDirectConversationUpdated);
    socket.on("presence:online", handlePresenceOnline);
    socket.on("presence:offline", handlePresenceOffline);
    socket.on("message:created", handleMessageCreated);
    return () => {
      cancelled = true;
      window.removeEventListener("direct-conversations:changed", handleDirectConversationsChanged);
      socket.off("connect", handleConnect);
      socket.off("direct:conversation:updated", handleDirectConversationUpdated);
      socket.off("presence:online", handlePresenceOnline);
      socket.off("presence:offline", handlePresenceOffline);
      socket.off("message:created", handleMessageCreated);
      for (const roomId of joinedRooms) {
        socket.emit("channel:leave", { channelId: roomId });
      }
      joinedRooms.clear();
      socket.disconnect();
      socketRef.current = null;
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
      if (wsId === activeWorkspaceIdRef.current) {
        syncChannelRooms(data, wsId);
      }
    } catch {
      setWorkspaceChannels((prev) => ({ ...prev, [wsId]: { kind: "error" } }));
    }
  }, []);

  useEffect(() => {
    loadChannelsForWorkspaceRef.current = loadChannelsForWorkspace;
  }, [loadChannelsForWorkspace]);

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

  // Clear unread badge locally when current channel is marked as read
  useEffect(() => {
    function handleChannelRead(event: Event) {
      const detail = (event as CustomEvent<{ channelId: string } | undefined>).detail;
      if (!detail?.channelId) return;
      const wsId = activeWorkspaceIdRef.current;
      if (!wsId) return;
      setWorkspaceChannels((prev) => {
        const wsState = prev[wsId];
        if (wsState?.kind !== "success") return prev;
        const idx = wsState.data.findIndex((ch) => ch.id === detail.channelId);
        if (idx === -1) return prev;
        const next = [...wsState.data];
        next[idx] = { ...next[idx], unreadCount: 0, hasUnread: false };
        return { ...prev, [wsId]: { kind: "success", data: next } };
      });
    }
    window.addEventListener("channel:read", handleChannelRead);
    return () => window.removeEventListener("channel:read", handleChannelRead);
  }, []);

  // Resync unread counts when app regains focus
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      const wsId = activeWorkspaceIdRef.current;
      const token = accessTokenRef.current;
      if (!token) return;
      if (wsId) {
        loadChannelsForWorkspaceRef.current(token, wsId, true);
      }
      listDirectConversations(token)
        .then((data) => {
          setDirectConversations({ kind: "success", data });
        })
        .catch(() => {
          // ignore
        });
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

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

  const directUnreadTotal =
    directConversations.kind === "success"
      ? directConversations.data.reduce((sum, c) => sum + c.unreadCount, 0)
      : 0;

  const workspaceChannelUnread = Object.entries(workspaceChannels).reduce(
    (acc, [wsId, wsState]) => {
      if (wsState?.kind !== "success") return acc;
      acc[wsId] = wsState.data.reduce((sum, ch) => sum + (ch.unreadCount ?? 0), 0);
      return acc;
    },
    {} as Record<string, number>,
  );

  const channelUnreadTotal = Object.values(workspaceChannelUnread).reduce(
    (sum, count) => sum + count,
    0,
  );

  const totalUnread = channelUnreadTotal + directUnreadTotal;

  useEffect(() => {
    updateDocumentTitle(totalUnread);
    dispatchGlobalUnread(totalUnread);
  }, [totalUnread]);

  if (authLoading || !isAuthenticated) {
    return (
      <aside className="hidden sm:flex w-60 shrink-0 border-r border-border bg-card/50 flex-col p-3">
        <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Users size={14} />
          {t("sidebar.workspace")}
        </div>
        <div className="mt-2 px-2 text-sm text-muted-foreground">{t("sidebar.signInToSeeWorkspaces")}</div>
      </aside>
    );
  }

  const directSectionHeader = (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleDirect}
        data-testid="sidebar-direct-toggle"
        className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <ChevronRight
          size={14}
          className={`shrink-0 transition-transform ${directExpanded ? "rotate-90" : ""}`}
        />
        <MessageSquare size={14} />
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
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        {sectionOrder === "direct-first" ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
      </button>
    </div>
  );

  const workspacesSectionHeader = (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleWorkspaces}
        className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <ChevronRight
          size={14}
          className={`shrink-0 transition-transform ${workspacesExpanded ? "rotate-90" : ""}`}
        />
        <Users size={14} />
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
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        {sectionOrder === "workspaces-first" ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
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
                    ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-foreground"
                    : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <span className="truncate block">{t("sidebar.directMessages")}</span>
                {unreadBadge(directUnreadTotal, "sidebar-direct-unread-badge")}
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
                          ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-foreground"
                          : conv.hasUnread
                            ? "font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
                            : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      <span
                        data-testid={`sidebar-direct-presence-dot-${conv.id}`}
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          conv.isOnline ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                        }`}
                      />
                      <span className="truncate flex-1">{name}</span>
                      {unreadBadge(conv.unreadCount)}
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
            <div className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              {t("sidebar.loading")}
            </div>
          )}
          {workspaces.kind === "error" && (
            <div className="px-2 text-sm text-destructive">{t("sidebar.failedToLoadWorkspaces")}</div>
          )}
          {workspaces.kind === "success" && workspaces.data.length === 0 && (
            <div className="px-2 text-sm text-muted-foreground">{t("sidebar.noWorkspacesYet")}</div>
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
                          ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-foreground"
                          : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      <ChevronRight
                        size={14}
                        className={`shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                      <span className="truncate flex-1 text-left">{ws.name}</span>
                      {unreadBadge(workspaceChannelUnread[ws.id] ?? 0, `sidebar-workspace-unread-${ws.id}`)}
                    </button>
                    {isExpanded && (
                      <div className="ml-4 mt-0.5 space-y-0.5" data-testid={`sidebar-workspace-channels-${ws.id}`}>
                        <Link
                          href={`/workspaces/${ws.id}`}
                          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors ${
                            pathname === `/workspaces/${ws.id}`
                              ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          }`}
                        >
                          <Globe size={12} />
                          <span className="truncate block">{t("sidebar.overview")}</span>
                        </Link>
                        {workspaceChannels[ws.id]?.kind === "loading" && (
                          <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                            <Loader2 size={12} className="animate-spin" />
                            {t("sidebar.loading")}
                          </div>
                        )}
                        {workspaceChannels[ws.id]?.kind === "error" && (
                          <div className="px-2 text-xs text-destructive">{t("sidebar.failedToLoadChannels")}</div>
                        )}
                        {(() => {
                          const chState = workspaceChannels[ws.id];
                          if (chState?.kind !== "success") return null;
                          if (chState.data.length === 0) {
                            return <div className="px-2 text-xs text-muted-foreground">{t("sidebar.noChannelsYet")}</div>;
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
                                          ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-foreground"
                                          : ch.hasUnread
                                            ? "font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
                                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5 truncate">
                                        <Hash size={12} />
                                        {ch.name}
                                      </span>
                                      <span className="flex items-center gap-1 shrink-0 ml-1">
                                        {unreadBadge(ch.unreadCount ?? 0, `sidebar-channel-unread-${ch.id}`)}
                                        <Badge variant={ch.type === "PUBLIC" ? "success" : "warning"}>
                                          {ch.type === "PUBLIC" ? t("sidebar.publicShort") : t("sidebar.privateShort")}
                                        </Badge>
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
    <aside
      className={`fixed inset-y-0 left-0 top-14 z-40 w-64 -translate-x-full transform transition-transform duration-200 ease-in-out border-r border-border bg-card/50 flex flex-col p-3 overflow-y-auto sm:static sm:inset-auto sm:top-auto sm:z-auto sm:translate-x-0 sm:w-60 sm:shrink-0 ${mobileOpen ? "translate-x-0" : ""}`}
      data-testid="sidebar"
    >
      <div className="space-y-5">
        {totalUnread > 0 && (
          <div
            data-testid="sidebar-global-unread"
            className="flex items-center justify-between rounded-lg bg-accent px-3 py-2"
          >
            <span className="text-xs font-medium text-accent-foreground">
              {t("sidebar.unread")}
            </span>
            {unreadBadge(totalUnread)}
          </div>
        )}
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
