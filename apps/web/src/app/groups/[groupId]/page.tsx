"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, MessageSquare, Send, Settings, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MessageContent } from "@/components/MessageContent";
import {
  getGroup,
  listGroupMessages,
  sendGroupMessage,
  markGroupRead,
  getGroupMessageContext,
  type GroupSummary,
  type GroupMessage,
  type GroupMessageContextResult,
} from "@/lib/groups-api";
import { createSocket } from "@/lib/socket-client";
import { useMessageListScroll } from "@/lib/use-message-list-scroll";
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
  const searchParams = useSearchParams();
  const handledQueryMessageIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<MessagesState>({ kind: "idle" });
  const [contextMode, setContextMode] = useState<
    | { kind: "idle" }
    | { kind: "active"; messages: GroupMessage[]; targetId: string }
  >({ kind: "idle" });
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [olderMessagesState, setOlderMessagesState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [group, setGroup] = useState<GroupState>({ kind: "idle" });
  const [content, setContent] = useState("");
  const [sendState, setSendState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scrollPaused, setScrollPaused] = useState(false);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const markReadInFlightRef = useRef<Promise<unknown> | null>(null);
  const {
    scrollRef: hookScrollRef,
    contentRef: messagesContentRef,
    endRef: messagesEndRef,
    scrollToBottom: scrollMessagesToBottom,
    isNearBottom,
    unstick,
  } = useMessageListScroll({
    messagesLoaded: messages.kind === "success",
    disabled: contextMode.kind === "active" || scrollPaused,
  });
  const messagesScrollElementRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      messagesScrollElementRef.current = node;
      hookScrollRef(node);
    },
    [hookScrollRef],
  );

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
          setMessages({ kind: "success", data: msgData.items });
          setNextCursor(msgData.nextCursor);
          setHasMoreMessages(msgData.hasMore);
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
        // Already appended optimistically; keep the composer view at the bottom.
        requestAnimationFrame(() => scrollMessagesToBottom("smooth"));
        return;
      }
      const wasNearBottom = isNearBottom();
      appendMessage(msg);
      if (wasNearBottom) {
        requestAnimationFrame(() => scrollMessagesToBottom("smooth"));
      }
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
  }, [isAuthenticated, groupId, accessToken, user?.id, router, loadGroup, safeMarkGroupRead, isNearBottom, scrollMessagesToBottom]);

  useEffect(() => {
    if (!isAuthenticated || !groupId || !accessToken) return;
    const targetMessageId = searchParams?.get("message");
    if (
      targetMessageId &&
      messages.kind === "success" &&
      contextMode.kind === "idle" &&
      handledQueryMessageIdRef.current !== targetMessageId
    ) {
      handledQueryMessageIdRef.current = targetMessageId;
      const loaded = messages.data.find((m) => m.id === targetMessageId);
      if (loaded) {
        scrollToMessage(targetMessageId);
      } else {
        getGroupMessageContext(accessToken, groupId, targetMessageId)
          .then((result) => {
            handleLoadContext({ ...result, targetId: targetMessageId });
          })
          .catch(() => {
            // ignore: message may not exist or be inaccessible
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, groupId, accessToken, searchParams, messages, contextMode.kind]);

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
        scrollMessagesToBottom("smooth");
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

  async function loadOlderMessages() {
    if (!accessToken || !groupId || !nextCursor) return;
    unstick();
    setScrollPaused(true);
    setOlderMessagesState({ kind: "loading" });

    const scrollEl = messagesScrollElementRef.current;
    const previousScrollHeight = scrollEl?.scrollHeight ?? 0;

    try {
      const result = await listGroupMessages(accessToken, groupId, {
        cursor: nextCursor,
        limit: 50,
      });

      setMessages((prev) => {
        if (prev.kind !== "success") return prev;
        const existingIds = new Set(prev.data.map((m) => m.id));
        const newItems = result.items.filter((m) => !existingIds.has(m.id));
        return { kind: "success", data: [...newItems, ...prev.data] };
      });
      setNextCursor(result.nextCursor);
      setHasMoreMessages(result.hasMore);
      setOlderMessagesState({ kind: "idle" });

      if (scrollEl) {
        let lastHeight = scrollEl.scrollHeight;
        let stableCount = 0;
        let changed = false;
        const start = Date.now();
        const finish = () => {
          setScrollPaused(false);
        };
        const check = () => {
          if (!scrollEl) {
            finish();
            return;
          }
          const currentHeight = scrollEl.scrollHeight;
          if (currentHeight !== lastHeight) {
            changed = true;
            stableCount = 0;
            lastHeight = currentHeight;
          } else if (changed) {
            stableCount += 1;
            if (stableCount >= 3) {
              const heightDelta = currentHeight - previousScrollHeight;
              scrollEl.scrollTop += heightDelta;
              finish();
              return;
            }
          }
          if (Date.now() - start > 1500) {
            const heightDelta = currentHeight - previousScrollHeight;
            scrollEl.scrollTop += heightDelta;
            finish();
            return;
          }
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      } else {
        setScrollPaused(false);
      }
    } catch (err) {
      setScrollPaused(false);
      const message = localizeApiError(err, "groups.failedLoadMessages", t);
      setOlderMessagesState({ kind: "error", message });
    }
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

  function scrollToMessage(messageId: string): boolean {
    const el = document.getElementById(`message-${messageId}`);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current));
    }, 1800);
    return true;
  }

  function handleLoadContext(result: GroupMessageContextResult & { targetId: string }) {
    const combined = [...result.before, result.target, ...result.after];
    setContextMode({ kind: "active", messages: combined, targetId: result.targetId });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToMessage(result.targetId);
      });
    });
  }

  function exitContextMode() {
    setContextMode({ kind: "idle" });
    const scrollEl = messagesScrollElementRef.current;
    if (scrollEl) {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    }
  }

  const isContextMode = contextMode.kind === "active";
  const displayMessages = isContextMode
    ? contextMode.messages
    : messages.kind === "success"
      ? messages.data
      : [];

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
            <div ref={messagesContentRef} className="flex w-full max-w-3xl flex-col">
              {isContextMode && (
                <div className="mb-2 flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={exitContextMode}
                    data-testid="group-back-to-latest"
                  >
                    <ArrowLeft size={14} className="mr-1.5" />
                    {t("channel.backToLatestMessages")}
                  </Button>
                </div>
              )}
              {messages.kind === "success" && hasMoreMessages && !isContextMode && (
                <div className="mb-2 flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={loadOlderMessages}
                    disabled={olderMessagesState.kind === "loading"}
                    data-testid="group-load-older-messages"
                  >
                    {olderMessagesState.kind === "loading" ? (
                      <><Loader2 size={14} className="mr-1.5 animate-spin" />{t("groups.loadingOlderMessages")}</>
                    ) : (
                      t("groups.loadOlderMessages")
                    )}
                  </Button>
                </div>
              )}
              {olderMessagesState.kind === "error" && (
                <div className="mb-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                  {olderMessagesState.message}
                </div>
              )}
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

              {messages.kind === "success" && displayMessages.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {displayMessages.map((msg) => {
                    const isOwnMessage = user?.id === msg.author.id;
                    return (
                      <li
                        key={msg.id}
                        id={`message-${msg.id}`}
                        data-testid={`group-message-row-${msg.id}`}
                        className={`flex items-start gap-3 rounded-xl transition-colors ${
                          highlightedMessageId === msg.id
                            ? "bg-primary/10 ring-2 ring-primary/30"
                            : ""
                        }`}
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
                            <MessageContent content={msg.content} mentions={msg.mentions} />
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
