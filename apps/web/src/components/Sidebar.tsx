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
  Lock,
  Shield,
  Activity,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaces, type Workspace } from "@/lib/workspaces-api";
import { getChannels, type Channel } from "@/lib/channels-api";
import { listDirectConversations, type DirectConversation } from "@/lib/direct-conversations-api";
import { listGroups, type GroupSummary } from "@/lib/groups-api";
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

type GroupsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: GroupSummary[] }
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
    <Badge
      variant="default"
      className="ml-1.5 shrink-0 !border-transparent !bg-sidebar-active !px-1.5 !py-0 !text-[10px] font-semibold !text-sidebar-active-foreground shadow-sm"
      data-testid={testId}
    >
      {count > 99 ? "99+" : count}
    </Badge>
  );
}

function channelTypeBadge(type: Channel["type"], label: string) {
  return (
    <Badge
      variant={type === "PUBLIC" ? "success" : "warning"}
      className="shrink-0 !px-1.5 !py-0 !text-[10px]"
    >
      {type === "PUBLIC" ? label : <span className="flex items-center gap-0.5"><Lock size={9} />{label}</span>}
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
  const [groups, setGroups] = useState<GroupsState>({ kind: "idle" });

  const [directExpanded, setDirectExpanded] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("sidebar:direct:expanded") !== "false" : true
  );
  const [groupsExpanded, setGroupsExpanded] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("sidebar:groups:expanded") !== "false" : true
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

  const activeGroupId = pathname?.startsWith("/groups/") && pathname.split("/").length >= 3
    ? pathname.split("/")[2]
    : null;

  const activeContacts = pathname?.startsWith("/contacts") ?? false;

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

  // Load groups
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    let cancelled = false;
    async function load(token: string) {
      setGroups({ kind: "loading" });
      try {
        const data = await listGroups(token);
        if (!cancelled) setGroups({ kind: "success", data });
      } catch {
        if (!cancelled) setGroups({ kind: "error" });
      }
    }
    load(accessToken);
    function handleGroupsChanged() {
      if (!accessToken) return;
      load(accessToken);
    }
    window.addEventListener("groups:changed", handleGroupsChanged);
    const token = accessToken;
    const socket = createSocket(token);
    function handleGroupConversationUpdated() {
      load(token);
    }
    socket.on("group:conversation:updated", handleGroupConversationUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("groups:changed", handleGroupsChanged);
      socket.off("group:conversation:updated", handleGroupConversationUpdated);
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

  // Initialize workspace expansion from localStorage / active route
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
    }
  }, [workspaces, activeWorkspaceId]);

  // Hydrate the active workspace channel list on direct route entry without
  // requiring the user to visit the Overview page first.
  useEffect(() => {
    if (!accessToken || !activeWorkspaceId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedWorkspaces((prev) => {
      if (prev.has(activeWorkspaceId)) return prev;
      const next = new Set(prev);
      next.add(activeWorkspaceId);
      localStorage.setItem(`sidebar:workspace:${activeWorkspaceId}:expanded`, "true");
      return next;
    });
    loadChannelsForWorkspace(accessToken, activeWorkspaceId, true);
  }, [accessToken, activeWorkspaceId, loadChannelsForWorkspace]);

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
      listGroups(token)
        .then((data) => {
          setGroups({ kind: "success", data });
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

  function toggleGroups() {
    setGroupsExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar:groups:expanded", next ? "true" : "false");
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

  const groupUnreadTotal =
    groups.kind === "success"
      ? groups.data.reduce((sum, g) => sum + g.unreadCount, 0)
      : 0;

  const totalUnread = channelUnreadTotal + directUnreadTotal + groupUnreadTotal;

  useEffect(() => {
    updateDocumentTitle(totalUnread);
    dispatchGlobalUnread(totalUnread);
  }, [totalUnread]);

  if (authLoading || !isAuthenticated) {
    return (
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/50 bg-gradient-to-b from-sidebar via-sidebar to-indigo-950/30 p-3 text-sidebar-foreground sm:flex">
        <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
          <Users size={14} />
          {t("sidebar.workspace")}
        </div>
        <div className="mt-2 px-2 text-sm text-sidebar-muted">{t("sidebar.signInToSeeWorkspaces")}</div>
      </aside>
    );
  }

  const directSectionHeader = (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleDirect}
        data-testid="sidebar-direct-toggle"
        className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-sidebar-muted transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm"
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
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sidebar-muted transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm"
      >
        {sectionOrder === "direct-first" ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
      </button>
    </div>
  );

  const workspacesSectionHeader = (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleWorkspaces}
        className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-sidebar-muted transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm"
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
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sidebar-muted transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm"
      >
        {sectionOrder === "workspaces-first" ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
      </button>
    </div>
  );

  const groupsSectionHeader = (
    <button
      onClick={toggleGroups}
      data-testid="sidebar-groups-toggle"
      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-sidebar-muted transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm"
    >
      <ChevronRight
        size={14}
        className={`shrink-0 transition-transform ${groupsExpanded ? "rotate-90" : ""}`}
      />
      <Users size={14} />
      <span>{t("sidebar.groups")}</span>
    </button>
  );

  const baseItem = "flex items-center rounded-md px-2 py-1.5 text-sm transition-all";
  const activeItem = "bg-gradient-to-r from-sidebar-active to-sidebar-active/90 text-sidebar-active-foreground font-semibold shadow-sm ring-1 ring-white/10";
  const hoverItem = "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm";

  const contactsSection = (
    <div data-testid="sidebar-contacts-section">
      <Link
        href="/contacts"
        data-testid="sidebar-contacts-link"
        data-active={activeContacts ? "true" : undefined}
        className={`${baseItem} gap-1.5 ${
          activeContacts
            ? activeItem
            : `text-sidebar-foreground/90 ${hoverItem}`
        }`}
      >
        <Users size={14} />
        <span>{t("sidebar.contacts")}</span>
      </Link>
    </div>
  );

  const isAdmin = user?.role === "ADMIN" || user?.role === "MODERATOR";

  const adminSection = isAdmin ? (
    <div data-testid="sidebar-admin-section">
      <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
        <Shield size={14} />
        <span>Admin</span>
      </div>
      <div className="mt-1 space-y-0.5">
        <Link
          href="/admin/reports"
          data-testid="sidebar-admin-reports-link"
          data-active={pathname?.startsWith("/admin/reports") ? "true" : undefined}
          className={`${baseItem} gap-1.5 ${
            pathname?.startsWith("/admin/reports")
              ? activeItem
              : `text-sidebar-foreground/90 ${hoverItem}`
          }`}
        >
          <Shield size={14} />
          <span>Moderation</span>
        </Link>
        <Link
          href="/admin/diagnostics"
          data-testid="sidebar-admin-diagnostics-link"
          data-active={pathname?.startsWith("/admin/diagnostics") ? "true" : undefined}
          className={`${baseItem} gap-1.5 ${
            pathname?.startsWith("/admin/diagnostics")
              ? activeItem
              : `text-sidebar-foreground/90 ${hoverItem}`
          }`}
        >
          <Activity size={14} />
          <span>Diagnostics</span>
        </Link>
      </div>
    </div>
  ) : null;

  const groupsSection = (
    <div data-testid="sidebar-groups-section">
      {groupsSectionHeader}
      {groupsExpanded && (
        <div className="mt-1">
          <ul className="space-y-0.5">
            <li>
              <Link
                href="/groups"
                data-testid="sidebar-groups-link"
                data-active={pathname?.startsWith("/groups") ? "true" : undefined}
                className={`${baseItem} justify-between ${
                  pathname?.startsWith("/groups") ? activeItem : `text-sidebar-foreground/90 ${hoverItem}`
                }`}
              >
                <span className="block truncate">{t("sidebar.groups")}</span>
                {unreadBadge(groupUnreadTotal, "sidebar-groups-unread-badge")}
              </Link>
            </li>
          </ul>
          {groups.kind === "success" && groups.data.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {groups.data.map((g) => {
                const isActive = g.id === activeGroupId;
                return (
                  <li key={g.id}>
                    <Link
                      href={`/groups/${g.id}`}
                      data-testid={`sidebar-group-link-${g.id}`}
                      data-active={isActive ? "true" : undefined}
                      className={`${baseItem} gap-2 ${
                        isActive
                          ? activeItem
                          : g.hasUnread
                            ? `font-medium text-sidebar-foreground ${hoverItem}`
                            : `text-sidebar-foreground/80 ${hoverItem}`
                      }`}
                    >
                      <span className="flex-1 truncate">{g.name}</span>
                      {unreadBadge(g.unreadCount)}
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
                data-active={pathname?.startsWith("/direct") ? "true" : undefined}
                className={`${baseItem} justify-between ${
                  pathname?.startsWith("/direct") ? activeItem : `text-sidebar-foreground/90 ${hoverItem}`
                }`}
              >
                <span className="block truncate">{t("sidebar.directMessages")}</span>
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
                      data-active={isActive ? "true" : undefined}
                      className={`${baseItem} gap-2 ${
                        isActive
                          ? activeItem
                          : conv.hasUnread
                            ? `font-medium text-sidebar-foreground ${hoverItem}`
                            : `text-sidebar-foreground/80 ${hoverItem}`
                      }`}
                    >
                      <span
                        data-testid={`sidebar-direct-presence-dot-${conv.id}`}
                        className={`h-2 w-2 shrink-0 rounded-full ring-1 ring-white/10 ${
                          conv.isOnline ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "bg-zinc-300 dark:bg-zinc-600"
                        }`}
                      />
                      <span className="flex-1 truncate">{name}</span>
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
            <div className="flex items-center gap-2 px-2 text-sm text-sidebar-muted">
              <Loader2 size={14} className="animate-spin" />
              {t("sidebar.loading")}
            </div>
          )}
          {workspaces.kind === "error" && (
            <div className="px-2 text-sm text-destructive">{t("sidebar.failedToLoadWorkspaces")}</div>
          )}
          {workspaces.kind === "success" && workspaces.data.length === 0 && (
            <div className="px-2 text-sm text-sidebar-muted">{t("sidebar.noWorkspacesYet")}</div>
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
                      data-active={isActive ? "true" : undefined}
                      className={`${baseItem} w-full gap-1 ${
                        isActive ? activeItem : `text-sidebar-foreground/90 ${hoverItem}`
                      }`}
                    >
                      <ChevronRight
                        size={14}
                        className={`shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                      <span className="flex-1 truncate text-left">{ws.name}</span>
                      {unreadBadge(workspaceChannelUnread[ws.id] ?? 0, `sidebar-workspace-unread-${ws.id}`)}
                    </button>
                    {isExpanded && (
                      <div className="ml-3 mt-0.5 space-y-0.5 border-l border-sidebar-accent/50 pl-2" data-testid={`sidebar-workspace-channels-${ws.id}`}>
                        <Link
                          href={`/workspaces/${ws.id}`}
                          data-active={pathname === `/workspaces/${ws.id}` ? "true" : undefined}
                          className={`${baseItem} gap-1.5 ${
                            pathname === `/workspaces/${ws.id}`
                              ? activeItem
                              : `text-sidebar-muted ${hoverItem}`
                          }`}
                        >
                          <Globe size={12} />
                          <span className="block truncate">{t("sidebar.overview")}</span>
                        </Link>
                        {workspaceChannels[ws.id]?.kind === "loading" && (
                          <div className="flex items-center gap-2 px-2 text-xs text-sidebar-muted">
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
                            return <div className="px-2 text-xs text-sidebar-muted">{t("sidebar.noChannelsYet")}</div>;
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
                                      data-active={isChActive ? "true" : undefined}
                                      className={`${baseItem} justify-between ${
                                        isChActive
                                          ? activeItem
                                          : ch.hasUnread
                                            ? `font-medium text-sidebar-foreground ${hoverItem}`
                                            : `text-sidebar-muted ${hoverItem}`
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5 truncate">
                                        <Hash size={12} />
                                        {ch.name}
                                      </span>
                                      <span className="ml-1 flex shrink-0 items-center gap-1">
                                        {unreadBadge(ch.unreadCount ?? 0, `sidebar-channel-unread-${ch.id}`)}
                                        {channelTypeBadge(ch.type, ch.type === "PUBLIC" ? t("sidebar.publicShort") : t("sidebar.privateShort"))}
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
      className={`fixed inset-y-0 left-0 top-14 z-40 flex w-64 -translate-x-full transform flex-col overflow-y-auto border-r border-indigo-500/20 bg-gradient-to-b from-sidebar via-sidebar to-indigo-950/30 p-3 text-sidebar-foreground shadow-xl transition-transform duration-200 ease-in-out sm:static sm:inset-auto sm:top-auto sm:z-auto sm:w-60 sm:translate-x-0 sm:shrink-0 sm:shadow-none ${mobileOpen ? "translate-x-0" : ""}`}
      data-testid="sidebar"
    >
      <div className="space-y-5">
        {totalUnread > 0 && (
          <div
            data-testid="sidebar-global-unread"
            className="flex items-center justify-between rounded-lg bg-gradient-to-r from-sidebar-active to-sidebar-active/90 px-3 py-2 shadow-sm ring-1 ring-white/10"
          >
            <span className="text-xs font-medium text-sidebar-active-foreground">
              {t("sidebar.unread")}
            </span>
            {unreadBadge(totalUnread)}
          </div>
        )}
        {adminSection}
        {sectionOrder === "direct-first" ? (
          <>
            {directSection}
            {groupsSection}
            {contactsSection}
            {workspacesSection}
          </>
        ) : (
          <>
            {workspacesSection}
            {directSection}
            {groupsSection}
            {contactsSection}
          </>
        )}
      </div>
    </aside>
  );
}
