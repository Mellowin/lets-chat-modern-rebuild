"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, MessageSquare, Send, Settings, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getGroup,
  listGroupMessages,
  sendGroupMessage,
  markGroupRead,
  type GroupSummary,
  type GroupMessage,
} from "@/lib/groups-api";
import { createSocket } from "@/lib/socket-client";
import GroupSettingsModal from "./GroupSettingsModal";

type MessagesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: GroupMessage[] }
  | { kind: "error"; message: string };

type GroupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: GroupSummary }
  | { kind: "error"; message: string };

export default function GroupConversationPage() {
  const params = useParams();
  const groupId = typeof params.groupId === "string" ? params.groupId : "";
  const { isLoading: authLoading, isAuthenticated, user, accessToken } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const [messages, setMessages] = useState<MessagesState>({ kind: "idle" });
  const [group, setGroup] = useState<GroupState>({ kind: "idle" });
  const [content, setContent] = useState("");
  const [sendState, setSendState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const markReadInFlightRef = useRef<Promise<unknown> | null>(null);
  const didInitialScroll = useRef(false);

  const loadGroup = useCallback(
    async (token: string, id: string) => {
      try {
        const data = await getGroup(token, id);
        setGroup({ kind: "success", data });
      } catch (err) {
        const message = localizeApiError(err, "groups.failedLoadGroups", t);
        setGroup({ kind: "error", message });
      }
    },
    [t],
  );

  const safeMarkGroupRead = useCallback(
    (token: string, id: string) => {
      if (markReadInFlightRef.current) return;
      markReadInFlightRef.current = markGroupRead(token, id)
        .then(() => {
          window.dispatchEvent(new CustomEvent("groups:changed"));
        })
        .catch(() => {
          // non-blocking
        })
        .finally(() => {
          markReadInFlightRef.current = null;
        });
    },
    [],
  );

  useEffect(() => {
    if (!isAuthenticated || !groupId || !accessToken) return;

    let cancelled = false;
    async function load(token: string, id: string) {
      setMessages({ kind: "loading" });
      setGroup({ kind: "loading" });
      try {
        const [msgData, groupData] = await Promise.all([
          listGroupMessages(token, id),
          getGroup(token, id),
        ]);
        if (!cancelled) {
          setMessages({ kind: "success", data: msgData });
          setGroup({ kind: "success", data: groupData });
        }
      } catch (err) {
        const message = localizeApiError(err, "groups.failedLoadMessages", t);
        if (!cancelled) {
          setMessages({ kind: "error", message });
          setGroup({ kind: "error", message });
        }
      }
    }

    load(accessToken, groupId).then(() => {
      if (cancelled) return;
      safeMarkGroupRead(accessToken, groupId);
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, groupId, accessToken, t, safeMarkGroupRead]);

  useEffect(() => {
    if (messages.kind === "success" && !didInitialScroll.current) {
      didInitialScroll.current = true;
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [messages.kind]);

  useEffect(() => {
    if (!isAuthenticated || !groupId || !accessToken) return;

    const socket = createSocket(accessToken);
    socketRef.current = socket;

    function joinRoom() {
      socket.emit("group:join", { groupId });
    }

    function appendMessage(msg: GroupMessage) {
      setMessages((prev) => {
        if (prev.kind !== "success") return prev;
        if (prev.data.some((m) => m.id === msg.id)) return prev;
        return { kind: "success", data: [...prev.data, msg] };
      });
    }

    function handleMessageCreated(msg: GroupMessage) {
      if (msg.groupId !== groupId) return;
      if (msg.author.id === user?.id) {
        // Already appended optimistically
        return;
      }
      appendMessage(msg);
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
      if (!accessToken) return;
      safeMarkGroupRead(accessToken, groupId);
    }

    function handleConversationUpdated() {
      if (!accessToken) return;
      void loadGroup(accessToken, groupId);
      window.dispatchEvent(new CustomEvent("groups:changed"));
    }

    function handleMemberRemoved(payload: { groupId: string; userId: string }) {
      if (payload.groupId !== groupId) return;
      if (payload.userId === user?.id) {
        router.push("/groups");
        return;
      }
      if (!accessToken) return;
      void loadGroup(accessToken, groupId);
    }

    function handleServerConnected() {
      joinRoom();
    }

    socket.on("group:message:created", handleMessageCreated);
    socket.on("group:conversation:updated", handleConversationUpdated);
    socket.on("group:member:removed", handleMemberRemoved);
    socket.on("connected", handleServerConnected);

    if (socket.connected) {
      joinRoom();
    }

    return () => {
      socket.off("group:message:created", handleMessageCreated);
      socket.off("group:conversation:updated", handleConversationUpdated);
      socket.off("group:member:removed", handleMemberRemoved);
      socket.off("connected", handleServerConnected);
      socket.emit("group:leave", { groupId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, groupId, accessToken, user?.id, router, loadGroup, safeMarkGroupRead]);

  useEffect(() => {
    if (!groupId) return;
    const frame = window.requestAnimationFrame(() => {
      const textarea = document.getElementById("group-message-input") as HTMLTextAreaElement | null;
      textarea?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [groupId]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setSendState({ kind: "error", message: t("channel.errorMessageEmpty") });
      return;
    }
    if (trimmed.length > 4000) {
      setSendState({ kind: "error", message: t("channel.errorMessageTooLong") });
      return;
    }
    if (!accessToken || !groupId) return;

    setSendState({ kind: "loading" });
    try {
      const msg = await sendGroupMessage(accessToken, groupId, trimmed);
      setContent("");
      setSendState({ kind: "idle" });
      appendMessage(msg);
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        const textarea = document.getElementById("group-message-input") as HTMLTextAreaElement | null;
        textarea?.focus();
      });
      safeMarkGroupRead(accessToken, groupId);
      window.dispatchEvent(new CustomEvent("groups:changed"));
    } catch (err) {
      const message = localizeApiError(err, "groups.failedSendMessage", t);
      setSendState({ kind: "error", message });
    }
  }

  function appendMessage(msg: GroupMessage) {
    setMessages((prev) => {
      if (prev.kind !== "success") return prev;
      if (prev.data.some((m) => m.id === msg.id)) return prev;
      return { kind: "success", data: [...prev.data, msg] };
    });
  }

  function getMessageAuthorName(msg: GroupMessage) {
    return msg.author.displayName || msg.author.username || t("messageAuthor.unknownUser");
  }

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          {t("auth.loadingSession")}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t("auth.authRequired")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.pleaseSignIn")}</p>
          <Button asChild className="mt-4">
            <Link href="/login">{t("auth.signIn")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const groupData = group.kind === "success" ? group.data : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] min-w-0 w-full max-w-none flex-col gap-4 overflow-hidden p-4 sm:p-6">
      <main className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
        <header className="shrink-0 rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-indigo-50/30 p-3 shadow-sm dark:to-indigo-950/10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/groups">
                <ArrowLeft size={16} className="mr-1" />
                {t("groups.backToGroups")}
              </Link>
            </Button>
            {groupData && (
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <Avatar src={null} name={groupData.name} size="md" alt="" className="ring-2 ring-border" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{groupData.name}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Users size={12} />
                    {t("groups.memberCount", String(groupData.memberCount))}
                  </p>
                </div>
              </div>
            )}
            <Button
              data-testid="group-settings-button"
              variant="icon"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              aria-label={t("groups.settings")}
            >
              <Settings size={18} />
            </Button>
          </div>
        </header>

        <div className="mt-4 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-md">
          <div
            ref={messagesScrollRef}
            data-testid="group-messages-scroll"
            className="chat-canvas min-h-0 flex-1 overflow-y-auto px-4 py-3"
          >
            <div className="flex w-full max-w-3xl flex-col">
              {messages.kind === "loading" && (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  {t("groups.loadingMessages")}
                </div>
              )}

              {messages.kind === "error" && (
                <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {messages.message}
                </div>
              )}

              {messages.kind === "success" && messages.data.length === 0 && (
                <div className="mt-4">
                  <EmptyState icon={MessageSquare} title={t("groups.noMessages")} />
                </div>
              )}

              {messages.kind === "success" && messages.data.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {messages.data.map((msg) => {
                    const isOwnMessage = user?.id === msg.author.id;
                    return (
                      <li
                        key={msg.id}
                        data-testid={`group-message-row-${msg.id}`}
                        className="flex items-start gap-3"
                      >
                        <div data-testid={`group-message-avatar-${msg.id}`} className="sticky bottom-3 self-end">
                          <Avatar
                            src={msg.author.avatarUrl}
                            name={getMessageAuthorName(msg)}
                            size="md"
                            alt=""
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span
                              data-testid={`group-message-author-${msg.id}`}
                              className={`text-sm font-semibold ${
                                isOwnMessage ? "text-primary" : "text-foreground"
                              }`}
                            >
                              {getMessageAuthorName(msg)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatTime(msg.createdAt)}
                            </span>
                          </div>
                          <p
                            data-testid={`group-message-content-${msg.id}`}
                            className="whitespace-pre-wrap text-sm text-foreground"
                          >
                            {msg.content}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="shrink-0 border-t border-border/80 bg-card p-3">
            <form onSubmit={handleSendMessage} className="flex items-start gap-2">
              <textarea
                id="group-message-input"
                data-testid="group-message-input"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (sendState.kind === "error") setSendState({ kind: "idle" });
                }}
                placeholder={t("groups.typeMessage")}
                rows={2}
                className="flex min-h-[3rem] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendMessage(e);
                  }
                }}
              />
              <Button
                type="submit"
                data-testid="group-send-button"
                disabled={sendState.kind === "loading"}
                className="shrink-0 self-end"
              >
                {sendState.kind === "loading" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </Button>
            </form>
            {sendState.kind === "error" && (
              <p className="mt-2 text-xs text-destructive">{sendState.message}</p>
            )}
          </div>
        </div>
      </main>

      {settingsOpen && groupData && (
        <GroupSettingsModal
          group={groupData}
          currentUserId={user?.id ?? ""}
          accessToken={accessToken ?? ""}
          onClose={() => setSettingsOpen(false)}
          onUpdate={(updated) => {
            setGroup({ kind: "success", data: updated });
            window.dispatchEvent(new CustomEvent("groups:changed"));
          }}
          onLeave={() => router.push("/groups")}
          onArchive={() => router.push("/groups")}
        />
      )}
    </div>
  );
}
