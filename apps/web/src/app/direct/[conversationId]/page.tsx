"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { getAvatarUrl } from "@/lib/avatar-url";
import {
  listDirectMessages,
  sendDirectMessage,
  markDirectConversationRead,
  type DirectMessage,
  type SendDirectMessageInput,
} from "@/lib/direct-conversations-api";
import { createSocket } from "@/lib/socket-client";

type MessagesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: DirectMessage[] }
  | { kind: "error"; message: string };

export default function DirectConversationPage() {
  const params = useParams();
  const conversationId =
    typeof params.conversationId === "string" ? params.conversationId : "";
  const { isLoading: authLoading, isAuthenticated, user, accessToken } = useAuth();
  const { t } = useLocale();
  const [messages, setMessages] = useState<MessagesState>({ kind: "idle" });
  const [content, setContent] = useState("");
  const [sendState, setSendState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [socketError, setSocketError] = useState<string | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const didInitialScroll = useRef(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);

  function scrollMessagesToBottom(behavior: ScrollBehavior = "smooth") {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
    }
  }

  function isNearBottom() {
    const el = messagesScrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  }

  useEffect(() => {
    if (messages.kind === "success" && !didInitialScroll.current) {
      didInitialScroll.current = true;
      scrollMessagesToBottom("auto");
    }
  }, [messages.kind]);

  useEffect(() => {
    if (!isAuthenticated || !conversationId || !accessToken) return;

    let cancelled = false;
    async function load(token: string, id: string) {
      setMessages({ kind: "loading" });
      try {
        const data = await listDirectMessages(token, id);
        if (!cancelled) {
          setMessages({ kind: "success", data });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : t("direct.failedLoadMessages");
        if (!cancelled) {
          setMessages({ kind: "error", message });
        }
      }
    }
    load(accessToken, conversationId);
    // Mark as read when opening conversation
    markDirectConversationRead(accessToken, conversationId).catch(() => {
      // non-blocking
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, conversationId, accessToken, t]);

  useEffect(() => {
    if (!isAuthenticated || !conversationId || !accessToken) return;

    const socket = createSocket(accessToken);
    socketRef.current = socket;

    function joinRoom() {
      socket.emit("direct:join", { conversationId });
    }

    function handleDirectMessageCreated(msg: DirectMessage) {
      if (msg.conversationId !== conversationId) return;
      if (msg.author.id === user?.id) {
        appendMessage(msg);
        requestAnimationFrame(() => scrollMessagesToBottom("smooth"));
        return;
      }
      const wasNearBottom = isNearBottom();
      appendMessage(msg);
      if (wasNearBottom) {
        requestAnimationFrame(() => scrollMessagesToBottom("smooth"));
      }
      // Mark as read when receiving message while in open conversation
      if (accessToken) {
        markDirectConversationRead(accessToken, conversationId).catch(() => {
          // non-blocking
        });
      }
    }

    function handleDirectJoined() {
      setSocketError(null);
    }

    function handleDirectError(err: { message?: string }) {
      const message = err?.message || t("channel.socketError");
      setSocketError(message);
    }

    function handleConnectError(err: Error) {
      setSocketError(err.message || t("channel.socketError"));
    }

    function handleDisconnect() {
      // disconnected state is normal; keep last error if any
    }

    function handleServerConnected() {
      setSocketError(null);
      joinRoom();
    }

    socket.on("direct:message:created", handleDirectMessageCreated);
    socket.on("direct:joined", handleDirectJoined);
    socket.on("direct:error", handleDirectError);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);
    socket.on("connected", handleServerConnected);

    // If socket is already connected, server auth is complete;
    // emit join immediately. For reconnects, serverConnected will fire.
    if (socket.connected) {
      joinRoom();
    }

    return () => {
      socket.off("direct:message:created", handleDirectMessageCreated);
      socket.off("direct:joined", handleDirectJoined);
      socket.off("direct:error", handleDirectError);
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect", handleDisconnect);
      socket.off("connected", handleServerConnected);
      socket.emit("direct:leave", { conversationId });
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, conversationId, accessToken]);

  useEffect(() => {
    if (!conversationId) return;
    const frame = window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationId]);

  function appendMessage(msg: DirectMessage) {
    setMessages((prev) => {
      if (prev.kind !== "success") return prev;
      if (prev.data.some((m) => m.id === msg.id)) return prev;
      return { kind: "success", data: [...prev.data, msg] };
    });
  }

  async function submitMessage() {
    const trimmed = content.trim();
    if (!trimmed) {
      setSendState({ kind: "error", message: t("channel.errorMessageEmpty") });
      return;
    }
    if (trimmed.length > 4000) {
      setSendState({ kind: "error", message: t("channel.errorMessageTooLong") });
      return;
    }
    if (!accessToken || !conversationId) return;

    setSendState({ kind: "loading" });
    try {
      const input: SendDirectMessageInput = { content: trimmed };
      const msg = await sendDirectMessage(accessToken, conversationId, input);
      setContent("");
      setSendState({ kind: "idle" });
      appendMessage(msg);
      requestAnimationFrame(() => {
        scrollMessagesToBottom("smooth");
        composerTextareaRef.current?.focus();
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("direct.failedSendMessage");
      setSendState({ kind: "error", message });
      requestAnimationFrame(() => composerTextareaRef.current?.focus());
    }
  }

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    submitMessage();
  }

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          {t("auth.loadingSession")}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t("auth.authRequired")}</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t("auth.pleaseSignIn")}
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {t("auth.signIn")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-w-0 w-full max-w-none flex-col gap-4 overflow-hidden p-4 sm:p-6">
      <main className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
        <Link
          href="/direct"
          className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          {t("direct.backToDirectMessages")}
        </Link>

        <div className="mt-4 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
          <div ref={messagesScrollRef} className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-[#e4efc4] via-[#c9e2bf] to-[#9cc7b2] px-4 py-3 dark:from-zinc-950 dark:via-emerald-950/40 dark:to-zinc-900">
            <div className="flex w-full max-w-3xl flex-col">
              {messages.kind === "loading" && (
                <div className="mt-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
                  {t("direct.loadingMessages")}
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
                  {t("direct.noMessages")}
                </p>
              )}

              {messages.kind === "success" && messages.data.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {messages.data.map((msg) => {
                    const isOwnMessage = user?.id === msg.author.id;
                    return (
                      <li
                        key={msg.id}
                        id={`message-${msg.id}`}
                        data-testid={`message-row-${msg.id}`}
                        className="flex items-start gap-3 rounded-xl"
                      >
                        <div
                          data-testid={`message-avatar-${msg.id}`}
                          className="sticky bottom-3 self-end relative h-8 w-8 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden"
                        >
                          {msg.author.avatarUrl ? (
                            <Image src={getAvatarUrl(msg.author.avatarUrl) || ""} alt="" fill sizes="32px" className="object-cover" unoptimized />
                          ) : (
                            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                              {(msg.author.displayName || msg.author.username || "?").slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div
                          data-testid={`message-body-${msg.id}`}
                          className="min-w-0 max-w-[80%]"
                        >
                          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 truncate">
                              {msg.author.displayName || msg.author.username || t("messageAuthor.unknownUser")}
                            </span>
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">
                              {new Date(msg.createdAt).toLocaleString()}
                            </span>
                            {msg.editedAt && (
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                                {t("channel.edited")}
                              </span>
                            )}
                          </div>
                          <div data-testid={`message-bubble-wrap-${msg.id}`} className={isOwnMessage ? "ml-28 sm:ml-44" : ""}>
                            <div
                              data-testid={`message-bubble-${msg.id}`}
                              className={`mt-1 w-fit max-w-full rounded-2xl border px-3 py-2 shadow-sm ${
                                isOwnMessage
                                  ? "bg-emerald-50 border-emerald-200 text-zinc-900 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-zinc-100"
                                  : "bg-white/95 dark:bg-zinc-900/95 border-zinc-200 dark:border-zinc-800"
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800 dark:text-zinc-200">
                                {msg.content}
                              </p>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div ref={messagesEndRef} className="h-1" />
            </div>
          </div>

          <form onSubmit={handleSendMessage} className="shrink-0 flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm">
            {socketError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {socketError}
                </div>
              </div>
            )}
            <textarea
              ref={composerTextareaRef}
              rows={2}
              placeholder={t("direct.typeMessage")}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitMessage();
                }
              }}
              disabled={sendState.kind === "loading"}
              className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100 disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {content.length > 0 && `${content.length} / 4000`}
              </div>
              <button
                type="submit"
                disabled={sendState.kind === "loading"}
                className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {sendState.kind === "loading" ? t("direct.sending") : t("direct.send")}
              </button>
            </div>
            {sendState.kind === "error" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {sendState.message}
                </div>
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
