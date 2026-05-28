"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getChannel, getChannelMembers, removeChannelMember, archiveChannel, leaveChannel, type Channel, type ChannelMember } from "@/lib/channels-api";
import { createChannelInvite } from "@/lib/channel-invites-api";

import { getMessages, createMessage, updateMessage, deleteMessage, type Message, type CreateMessageInput, type UpdateMessageInput } from "@/lib/messages-api";
import { createSocket } from "@/lib/socket-client";
import { MessageAuthor } from "@/components/MessageAuthor";


type ChannelState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Channel }
  | { kind: "error"; message: string };

type MessagesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Message[] }
  | { kind: "error"; message: string };

type MembersState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: ChannelMember[] }
  | { kind: "error"; message: string };

export default function ChannelDetailPage() {
  const params = useParams();
  const workspaceId =
    typeof params.workspaceId === "string" ? params.workspaceId : "";
  const channelId =
    typeof params.channelId === "string" ? params.channelId : "";
  const { isLoading: authLoading, isAuthenticated, user, accessToken } = useAuth();
  const router = useRouter();
  const [channel, setChannel] = useState<ChannelState>({ kind: "idle" });
  const [messages, setMessages] = useState<MessagesState>({ kind: "idle" });
  const [members, setMembers] = useState<MembersState>({ kind: "idle" });
  const [content, setContent] = useState("");
  const [sendState, setSendState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [socketStatus, setSocketStatus] = useState<
    "disconnected" | "connecting" | "connected" | "joined" | "error"
  >("disconnected");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editState, setEditState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [archiveState, setArchiveState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [leaveState, setLeaveState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [addMemberIdentifier, setAddMemberIdentifier] = useState("");
  const [addMemberRole, setAddMemberRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [addMemberState, setAddMemberState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "success" }
  >({ kind: "idle" });
  const [removeMemberState, setRemoveMemberState] = useState<
    | { kind: "idle" }
    | { kind: "loading"; memberId: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [typingUsers, setTypingUsers] = useState<Record<string, { username: string; timeout: number }>>({});
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId || !channelId || !accessToken) return;

    let cancelled = false;
    async function load(t: string, ws: string, ch: string) {
      setChannel({ kind: "loading" });
      setMessages({ kind: "loading" });
      try {
        const [chData, msgData] = await Promise.all([
          getChannel(t, ws, ch),
          getMessages(t, ws, ch),
        ]);
        if (!cancelled) {
          setChannel({ kind: "success", data: chData });
          setMessages({ kind: "success", data: msgData });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load channel";
        if (!cancelled) {
          setChannel({ kind: "error", message });
          setMessages({ kind: "error", message });
          const lower = message.toLowerCase();
          if (
            lower.includes("channel not found") ||
            lower.includes("workspace not found") ||
            lower.includes("forbidden")
          ) {
            window.dispatchEvent(new Event("channels:changed"));
            if (workspaceId) {
              router.push(`/workspaces/${workspaceId}`);
            } else {
              router.push("/dashboard");
            }
          }
        }
      }
    }
    load(accessToken, workspaceId, channelId);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, workspaceId, channelId, accessToken, router]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId || !channelId || !accessToken) return;

    let cancelled = false;
    async function loadMembers(t: string, ws: string, ch: string) {
      setMembers({ kind: "loading" });
      try {
        const memData = await getChannelMembers(t, ws, ch);
        if (!cancelled) {
          setMembers({ kind: "success", data: memData });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load members";
        if (!cancelled) {
          setMembers({ kind: "error", message });
        }
      }
    }
    loadMembers(accessToken, workspaceId, channelId);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, workspaceId, channelId, accessToken]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId || !channelId) return;
    if (!accessToken) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocketStatus("connecting");
    const socket = createSocket(accessToken);
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketStatus("connected");
    });

    socket.on("disconnect", () => {
      setSocketStatus("disconnected");
    });

    socket.on("connected", () => {
      setSocketStatus("connected");
      socket.emit("channel:join", { workspaceId, channelId });
    });

    socket.on("channel:joined", () => {
      setSocketStatus("joined");
    });

    socket.on("channel:error", (data: { message?: string }) => {
      const msg = (data?.message ?? "").toLowerCase();
      const isAccessLoss =
        msg.includes("channel not found") ||
        msg.includes("workspace not found") ||
        msg.includes("forbidden") ||
        msg.includes("insufficient permissions");

      if (isAccessLoss) {
        setSocketStatus("error");
        socket.disconnect();
        window.dispatchEvent(new Event("channels:changed"));
        router.push(`/workspaces/${workspaceId}`);
      } else {
        setSocketStatus("error");
        console.error("Channel error:", data?.message);
      }
    });

    socket.on("auth:error", () => {
      setSocketStatus("error");
      socket.disconnect();
    });

    socket.on("auth:expired", () => {
      setSocketStatus("error");
      socket.disconnect();
    });

    socket.on("message:created", (msg: Message) => {
      if (msg.channelId !== channelId) return;
      appendMessage(msg);
    });

    socket.on("message:updated", (msg: Message) => {
      if (msg.channelId !== channelId) return;
      updateMessageInState(msg);
    });

    socket.on("message:deleted", (payload: { id: string; channelId: string; deletedAt: string }) => {
      if (payload.channelId !== channelId) return;
      removeMessageFromState(payload.id);
    });

    socket.on("typing:started", (payload: { channelId: string; user: { id: string; username: string } }) => {
      if (payload.channelId !== channelId) return;
      if (payload.user.id === user?.id) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (next[payload.user.id]?.timeout) {
          window.clearTimeout(next[payload.user.id].timeout);
        }
        const timeout = window.setTimeout(() => {
          setTypingUsers((prev2) => {
            const next2 = { ...prev2 };
            delete next2[payload.user.id];
            return next2;
          });
        }, 5000);
        next[payload.user.id] = { username: payload.user.username, timeout };
        return next;
      });
    });

    socket.on("typing:stopped", (payload: { channelId: string; user: { id: string; username: string } }) => {
      if (payload.channelId !== channelId) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (next[payload.user.id]?.timeout) {
          window.clearTimeout(next[payload.user.id].timeout);
        }
        delete next[payload.user.id];
        return next;
      });
    });

    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      Object.values(typingUsers).forEach((u) => {
        if (u.timeout) window.clearTimeout(u.timeout);
      });
      setTypingUsers({});
      socket.emit("channel:leave", { channelId });
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, workspaceId, channelId, accessToken]);

  function appendMessage(msg: Message) {
    setMessages((prev) => {
      if (prev.kind !== "success") return prev;
      if (prev.data.some((m) => m.id === msg.id)) return prev;
      return { kind: "success", data: [...prev.data, msg] };
    });
  }

  function updateMessageInState(msg: Message) {
    setMessages((prev) => {
      if (prev.kind !== "success") return prev;
      return {
        kind: "success",
        data: prev.data.map((m) => (m.id === msg.id ? msg : m)),
      };
    });
  }

  function removeMessageFromState(messageId: string) {
    setMessages((prev) => {
      if (prev.kind !== "success") return prev;
      return {
        kind: "success",
        data: prev.data.filter((m) => m.id !== messageId),
      };
    });
  }

  function isEditable(msg: Message) {
    const editWindowMs = 15 * 60 * 1000;
    return Date.now() - new Date(msg.createdAt).getTime() <= editWindowMs;
  }

  function handleEditStart(msg: Message) {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
    setEditState({ kind: "idle" });
  }

  function handleEditCancel() {
    setEditingMessageId(null);
    setEditContent("");
    setEditState({ kind: "idle" });
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = editContent.trim();
    if (!trimmed) {
      setEditState({ kind: "error", message: "Message cannot be empty" });
      return;
    }
    if (trimmed.length > 4000) {
      setEditState({ kind: "error", message: "Message is too long (max 4000 characters)" });
      return;
    }
    if (!accessToken || !workspaceId || !channelId || !editingMessageId) return;

    setEditState({ kind: "loading" });
    try {
      const input: UpdateMessageInput = { content: trimmed };
      const msg = await updateMessage(accessToken, workspaceId, channelId, editingMessageId, input);
      setEditState({ kind: "idle" });
      setEditingMessageId(null);
      setEditContent("");
      updateMessageInState(msg);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update message";
      setEditState({ kind: "error", message });
    }
  }

  async function handleDelete(messageId: string) {
    if (!window.confirm("Delete this message?")) return;
    if (!accessToken || !workspaceId || !channelId) return;
    try {
      await deleteMessage(accessToken, workspaceId, channelId, messageId);
      removeMessageFromState(messageId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete message";
      alert(message);
    }
  }

  async function submitMessage() {
    const trimmed = content.trim();
    if (!trimmed) {
      setSendState({ kind: "error", message: "Message cannot be empty" });
      return;
    }
    if (trimmed.length > 4000) {
      setSendState({ kind: "error", message: "Message is too long (max 4000 characters)" });
      return;
    }
    if (!accessToken || !workspaceId || !channelId) return;

    setSendState({ kind: "loading" });
    try {
      const input: CreateMessageInput = { content: trimmed };
      const msg = await createMessage(accessToken, workspaceId, channelId, input);
      setContent("");
      setSendState({ kind: "idle" });
      appendMessage(msg);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      setSendState({ kind: "error", message });
    }
  }

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    submitMessage();
  }

  function emitTypingStart() {
    const socket = socketRef.current;
    if (!socket || !workspaceId || !channelId) return;
    socket.emit("typing:start", { workspaceId, channelId });
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      socket.emit("typing:stop", { workspaceId, channelId });
      typingTimeoutRef.current = null;
    }, 2000);
  }

  function emitTypingStop() {
    const socket = socketRef.current;
    if (!socket || !workspaceId || !channelId) return;
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    socket.emit("typing:stop", { workspaceId, channelId });
  }

  const myChannelRole =
    members.kind === "success"
      ? members.data.find((m) => m.user.id === user?.id)?.role
      : undefined;
  const canManageMembers = myChannelRole === "OWNER" || myChannelRole === "ADMIN";
  const canArchiveChannel = myChannelRole === "OWNER";
  const canLeaveChannel = myChannelRole === "MEMBER" || myChannelRole === "ADMIN";

  function canRemoveMember(targetRole: string, targetUserId: string) {
    if (myChannelRole === "OWNER") {
      if (targetUserId === user?.id) return false;
      return targetRole === "ADMIN" || targetRole === "MEMBER";
    }
    if (myChannelRole === "ADMIN") {
      return targetRole === "MEMBER";
    }
    return false;
  }

  async function handleArchive() {
    if (!channelId || !accessToken || !workspaceId) return;
    const name = channel.kind === "success" ? channel.data.name : "this channel";
    if (!window.confirm(`Archive channel "${name}"?\nThis will hide the channel from the workspace. Only the channel owner can do this.`)) {
      return;
    }
    setArchiveState({ kind: "loading" });
    try {
      await archiveChannel(accessToken, workspaceId, channelId);
      setArchiveState({ kind: "idle" });
      window.dispatchEvent(new Event("channels:changed"));
      router.push(`/workspaces/${workspaceId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to archive channel";
      setArchiveState({ kind: "error", message });
    }
  }

  async function handleLeave() {
    if (!channelId || !accessToken || !workspaceId) return;
    const name = channel.kind === "success" ? channel.data.name : "this channel";
    if (!window.confirm(`Leave channel "${name}"?`)) {
      return;
    }
    setLeaveState({ kind: "loading" });
    try {
      await leaveChannel(accessToken, workspaceId, channelId);
      setLeaveState({ kind: "idle" });
      window.dispatchEvent(new Event("channels:changed"));
      router.push(`/workspaces/${workspaceId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to leave channel";
      setLeaveState({ kind: "error", message });
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = addMemberIdentifier.trim();
    if (!trimmed) {
      setAddMemberState({ kind: "error", message: "Username or email is required" });
      return;
    }
    if (!accessToken || !workspaceId || !channelId) return;

    setAddMemberState({ kind: "loading" });
    try {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
      const role = myChannelRole === "OWNER" ? addMemberRole : "MEMBER";
      const input = isEmail
        ? { email: trimmed, role }
        : { identifier: trimmed.replace(/^@/, ""), role };
      await createChannelInvite(accessToken, workspaceId, channelId, input);
      setAddMemberIdentifier("");
      setAddMemberState({ kind: "success" });
      window.setTimeout(() => setAddMemberState({ kind: "idle" }), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send invitation";
      setAddMemberState({ kind: "error", message });
    }
  }

  async function handleRemoveMember(memberId: string, username: string) {
    if (!window.confirm(`Remove member "${username}" from this channel?`)) return;
    if (!accessToken || !workspaceId || !channelId) return;

    setRemoveMemberState({ kind: "loading", memberId });
    try {
      await removeChannelMember(accessToken, workspaceId, channelId, memberId);
      setRemoveMemberState({ kind: "idle" });
      setMembers((prev) => {
        if (prev.kind !== "success") return prev;
        return { kind: "success", data: prev.data.filter((m) => m.id !== memberId) };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove member";
      setRemoveMemberState({ kind: "error", message });
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
          <div className="mt-6 flex items-center gap-3 flex-wrap">
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
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                socketStatus === "joined"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                  : socketStatus === "connected"
                    ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    : socketStatus === "connecting"
                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                      : socketStatus === "error"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
              }`}
            >
              {socketStatus}
            </span>
            {canArchiveChannel && (
              <button
                onClick={handleArchive}
                disabled={archiveState.kind === "loading"}
                className="ml-auto inline-flex items-center justify-center rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {archiveState.kind === "loading" ? "Archiving…" : "Archive"}
              </button>
            )}
            {canLeaveChannel && (
              <button
                onClick={handleLeave}
                disabled={leaveState.kind === "loading"}
                className="ml-auto inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {leaveState.kind === "loading" ? "Leaving…" : "Leave channel"}
              </button>
            )}
          </div>
          {archiveState.kind === "error" && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
              <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {archiveState.message}
              </div>
            </div>
          )}
          {leaveState.kind === "error" && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
              <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {leaveState.message}
              </div>
            </div>
          )}
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {channel.data.slug}
          </p>
          {channel.data.description && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {channel.data.description}
            </p>
          )}
        </>
      )}

      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold">Messages</h2>

        {/* Typing indicator */}
        {Object.keys(typingUsers).length > 0 && (
          <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {Object.values(typingUsers).map((u, i, arr) => (
              <span key={u.username}>
                {u.username}
                {i < arr.length - 1 ? ", " : " "}
              </span>
            ))}
            {Object.keys(typingUsers).length === 1 ? "is typing…" : "are typing…"}
          </div>
        )}

        {/* Composer */}
        {channel.kind === "success" && (
          <form onSubmit={handleSendMessage} className="mt-4 flex flex-col gap-2">
            <textarea
              rows={2}
              placeholder="Type a message…"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (e.target.value.trim()) {
                  emitTypingStart();
                } else {
                  emitTypingStop();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitMessage();
                }
              }}
              disabled={sendState.kind === "loading"}
              className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100 disabled:opacity-60"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {content.length}/4000
              </span>
              <button
                type="submit"
                disabled={sendState.kind === "loading"}
                className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {sendState.kind === "loading" ? "Sending…" : "Send"}
              </button>
            </div>
            {sendState.kind === "error" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {sendState.message}
                </div>
              </div>
            )}
          </form>
        )}

        {messages.kind === "loading" && (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
            Loading messages…
          </div>
        )}

        {messages.kind === "error" && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {messages.message}
            </div>
          </div>
        )}

        {messages.kind === "success" && messages.data.length === 0 && (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            No messages yet.
          </p>
        )}

        {messages.kind === "success" && messages.data.length > 0 && (
          <ul className="mt-4 space-y-4">
            {messages.data.map((msg) => (
              <li key={msg.id} className="flex gap-3">
                <MessageAuthor author={msg.author} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {new Date(msg.createdAt).toLocaleString()}
                    </span>
                    {msg.editedAt && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                        edited
                      </span>
                    )}
                    {msg.parentId && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                        reply
                      </span>
                    )}
                    {user?.id === msg.author.id && editingMessageId !== msg.id && (
                      <>
                        {isEditable(msg) && (
                          <button
                            onClick={() => handleEditStart(msg)}
                            className="text-[10px] text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 underline"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(msg.id)}
                          className="text-[10px] text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 underline"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                  {editingMessageId === msg.id ? (
                    <form onSubmit={handleEditSubmit} className="mt-1 flex flex-col gap-2">
                      <textarea
                        rows={2}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        disabled={editState.kind === "loading"}
                        className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100 disabled:opacity-60"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={editState.kind === "loading"}
                          className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                        >
                          {editState.kind === "loading" ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={handleEditCancel}
                          disabled={editState.kind === "loading"}
                          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-60 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                      {editState.kind === "error" && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs dark:border-red-900 dark:bg-red-950/30">
                          <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            {editState.message}
                          </div>
                        </div>
                      )}
                    </form>
                  ) : (
                    <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                      {msg.content}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Members */}
      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Members</h2>

        {canManageMembers && (
          <form onSubmit={handleAddMember} className="mt-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Username or email"
                value={addMemberIdentifier}
                onChange={(e) => {
                  setAddMemberIdentifier(e.target.value);
                  if (addMemberState.kind === "error") {
                    setAddMemberState({ kind: "idle" });
                  }
                }}
                disabled={addMemberState.kind === "loading"}
                className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={addMemberState.kind === "loading"}
                className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {addMemberState.kind === "loading" ? "Adding…" : "Add"}
              </button>
            </div>
            {myChannelRole === "OWNER" && (
              <select
                value={addMemberRole}
                onChange={(e) => setAddMemberRole(e.target.value as "MEMBER" | "ADMIN")}
                disabled={addMemberState.kind === "loading"}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100 disabled:opacity-60"
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
            )}
            {addMemberState.kind === "error" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {addMemberState.message}
                </div>
              </div>
            )}
            {addMemberState.kind === "success" && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Channel invitation sent
                </div>
              </div>
            )}
          </form>
        )}

        {members.kind === "loading" && (
          <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
            Loading members…
          </div>
        )}

        {members.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {members.message}
            </div>
          </div>
        )}

        {members.kind === "success" && members.data.length === 0 && (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No members yet.
          </p>
        )}

        {members.kind === "success" && members.data.length > 0 && (
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {members.data.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{m.user.displayName?.trim() ? m.user.displayName : `@${m.user.username}`}</span>
                  {m.user.displayName?.trim() && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">@{m.user.username}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      m.role === "OWNER"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400"
                        : m.role === "ADMIN"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {m.role}
                  </span>
                  {canRemoveMember(m.role, m.user.id) && (
                    <button
                      onClick={() => handleRemoveMember(m.id, m.user.username)}
                      disabled={removeMemberState.kind === "loading" && removeMemberState.memberId === m.id}
                      className="text-[10px] text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 underline disabled:opacity-50"
                    >
                      {removeMemberState.kind === "loading" && removeMemberState.memberId === m.id ? "Removing…" : "Remove"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {removeMemberState.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {removeMemberState.message}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
