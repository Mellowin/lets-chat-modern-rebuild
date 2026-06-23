"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  Edit3,
  Forward,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Reply,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  listDirectMessages,
  sendDirectMessage,
  markDirectConversationRead,
  listDirectConversations,
  reactToDirectMessage,
  removeDirectMessageReaction,
  updateDirectMessage,
  deleteDirectMessage,
  type DirectMessage,
  type SendDirectMessageInput,
  type UpdateDirectMessageInput,
  type DirectConversation,
  type DirectMessageReactionSummary,
} from "@/lib/direct-conversations-api";
import { createSocket } from "@/lib/socket-client";

type MessagesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: DirectMessage[] }
  | { kind: "error"; message: string };

type ConversationState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: DirectConversation | null }
  | { kind: "error"; message: string };

type MenuPosition = { top: number; left: number };

export default function DirectConversationPage() {
  const params = useParams();
  const conversationId =
    typeof params.conversationId === "string" ? params.conversationId : "";
  const { isLoading: authLoading, isAuthenticated, user, accessToken } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledQueryMessageIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<MessagesState>({ kind: "idle" });
  const [conversation, setConversation] = useState<ConversationState>({ kind: "idle" });
  const conversationRef = useRef<ConversationState>(conversation);
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);
  const [content, setContent] = useState("");
  const [sendState, setSendState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [socketError, setSocketError] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<DirectMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [forwardMessage, setForwardMessage] = useState<DirectMessage | null>(null);
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [messageMenuPosition, setMessageMenuPosition] = useState<MenuPosition | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [reactionPickerPosition, setReactionPickerPosition] = useState<MenuPosition | null>(null);
  const quickEmojis = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
  const [forwardConversations, setForwardConversations] = useState<DirectConversation[]>([]);
  const [forwardState, setForwardState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [editingMessage, setEditingMessage] = useState<DirectMessage | null>(null);
  const [editState, setEditState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [typingUser, setTypingUser] = useState<{ id: string; username: string; displayName: string | null } | null>(null);
  const [presenceStatus, setPresenceStatus] = useState<"online" | "offline">("offline");
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const didInitialScroll = useRef(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const markReadInFlightRef = useRef<Promise<unknown> | null>(null);
  const messageRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoHideTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingEmittedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !conversationId || !accessToken) return;
    const targetMessageId = searchParams?.get("message");
    if (
      targetMessageId &&
      messages.kind === "success" &&
      handledQueryMessageIdRef.current !== targetMessageId
    ) {
      handledQueryMessageIdRef.current = targetMessageId;
      const loaded = messages.data.find((m) => m.id === targetMessageId);
      if (loaded) {
        scrollToMessage(targetMessageId);
      }
    }
  }, [isAuthenticated, conversationId, accessToken, searchParams, messages]);

  function safeMarkDirectConversationRead(token: string, convId: string) {
    if (markReadInFlightRef.current) return;
    markReadInFlightRef.current = markDirectConversationRead(token, convId)
      .then(() => {
        notifyDirectConversationsChanged();
        markAllReadInState();
      })
      .catch(() => {
        // non-blocking
      })
      .finally(() => {
        markReadInFlightRef.current = null;
      });
  }

  function notifyDirectConversationsChanged() {
    window.dispatchEvent(new CustomEvent("direct-conversations:changed"));
  }

  function getMenuPosition(rect: DOMRect): MenuPosition {
    const menuWidth = 180;
    const menuHeight = 180;
    const gap = 8;
    const padding = 12;

    let left = rect.right + gap;
    if (left + menuWidth > window.innerWidth - padding) {
      left = rect.left - menuWidth - gap;
    }
    left = Math.max(padding, Math.min(left, window.innerWidth - menuWidth - padding));

    let top = rect.top;
    if (top + menuHeight > window.innerHeight - padding) {
      top = window.innerHeight - menuHeight - padding;
    }
    top = Math.max(padding, top);

    return { top, left };
  }

  function openMenuForElement(messageId: string, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    setMessageMenuPosition(getMenuPosition(rect));
    setReactionPickerPosition(null);
    setReactionPickerMessageId(null);
    setMessageMenuId(messageId);
  }

  function openReactionPickerAt(messageId: string, position: MenuPosition) {
    setReactionPickerPosition(position);
    setMessageMenuPosition(null);
    setMessageMenuId(null);
    setReactionPickerMessageId(messageId);
  }

  function closeMenuAndPicker() {
    setMessageMenuId(null);
    setMessageMenuPosition(null);
    setReactionPickerMessageId(null);
    setReactionPickerPosition(null);
  }

  function emitTypingStop() {
    const socket = socketRef.current;
    if (socket && isTypingEmittedRef.current && conversationId) {
      socket.emit("direct:typing:stop", { conversationId });
      isTypingEmittedRef.current = false;
    }
  }

  function handleTypingStart() {
    const socket = socketRef.current;
    if (!socket || !conversationId) return;
    if (!isTypingEmittedRef.current) {
      socket.emit("direct:typing:start", { conversationId });
      isTypingEmittedRef.current = true;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      emitTypingStop();
    }, 1200);
  }

  function clearTypingTimeouts() {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (autoHideTypingRef.current) {
      clearTimeout(autoHideTypingRef.current);
      autoHideTypingRef.current = null;
    }
  }

  function handleReply(msg: DirectMessage) {
    closeMenuAndPicker();
    setReplyToMessage(msg);
    requestAnimationFrame(() => composerTextareaRef.current?.focus());
  }

  function handleForward(msg: DirectMessage) {
    closeMenuAndPicker();
    setForwardMessage(msg);
  }

  function handleEditStart(msg: DirectMessage) {
    closeMenuAndPicker();
    setForwardMessage(null);
    setReplyToMessage(null);
    setEditingMessage(msg);
    setContent(msg.content);
    setEditState({ kind: "idle" });
    requestAnimationFrame(() => composerTextareaRef.current?.focus());
  }

  function handleEditCancel() {
    setEditingMessage(null);
    setContent("");
    setEditState({ kind: "idle" });
    requestAnimationFrame(() => composerTextareaRef.current?.focus());
  }

  async function handleEditSubmit() {
    if (!editingMessage || !accessToken || !conversationId) return;
    const trimmed = content.trim();
    if (!trimmed) {
      setEditState({ kind: "error", message: t("channel.errorMessageEmpty") });
      return;
    }
    if (trimmed.length > 4000) {
      setEditState({ kind: "error", message: t("channel.errorMessageTooLong") });
      return;
    }
    setEditState({ kind: "loading" });
    try {
      const input: UpdateDirectMessageInput = { content: trimmed };
      const updated = await updateDirectMessage(accessToken, conversationId, editingMessage.id, input);
      updateMessageInState(updated);
      setEditingMessage(null);
      setContent("");
      setEditState({ kind: "idle" });
      requestAnimationFrame(() => composerTextareaRef.current?.focus());
    } catch (err) {
      const message = localizeApiError(err, "direct.failedEditMessage", t);
      setEditState({ kind: "error", message });
      requestAnimationFrame(() => composerTextareaRef.current?.focus());
    }
  }

  async function handleDelete(msg: DirectMessage) {
    closeMenuAndPicker();
    if (!window.confirm(t("direct.confirmDelete"))) return;
    if (!accessToken || !conversationId) return;
    try {
      await deleteDirectMessage(accessToken, conversationId, msg.id);
      removeMessageFromState(msg.id);
      if (editingMessage?.id === msg.id) {
        setEditingMessage(null);
        setContent("");
        setEditState({ kind: "idle" });
      }
      if (replyToMessage?.id === msg.id) {
        setReplyToMessage(null);
      }
      if (forwardMessage?.id === msg.id) {
        setForwardMessage(null);
      }
    } catch (err) {
      const message = localizeApiError(err, "direct.failedDeleteMessage", t);
      setSocketError(message);
    }
  }

  async function handleCopyText(content: string) {
    closeMenuAndPicker();
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }

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

  function appendMessage(msg: DirectMessage) {
    setMessages((prev) => {
      if (prev.kind !== "success") return prev;
      if (prev.data.some((m) => m.id === msg.id)) return prev;
      return { kind: "success", data: [...prev.data, msg] };
    });
  }

  const markAllReadInState = useCallback(() => {
    setMessages((prev) => {
      if (prev.kind !== "success") return prev;
      return {
        kind: "success",
        data: prev.data.map((m) =>
          m.author.id !== user?.id ? { ...m, isUnreadForMe: false } : m,
        ),
      };
    });
  }, [user?.id]);

  function updateMessageInState(msg: DirectMessage) {
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

  function updateMessageReactions(messageId: string, reactions: DirectMessageReactionSummary[]) {
    setMessages((prev) => {
      if (prev.kind !== "success") return prev;
      return {
        kind: "success",
        data: prev.data.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
      };
    });
  }

  function mergeReactionSummaryForViewer(
    previous: DirectMessageReactionSummary[],
    incoming: Array<{ emoji: string; count: number; reactedByMe?: boolean }>,
    eventUserId: string,
    currentUserId: string | undefined,
  ): DirectMessageReactionSummary[] {
    const incomingMap = new Map(incoming.map((r) => [r.emoji, r]));
    const previousMap = new Map(previous.map((r) => [r.emoji, r]));

    const result: DirectMessageReactionSummary[] = [];
    for (const [emoji, reaction] of incomingMap) {
      let reactedByMe = reaction.reactedByMe ?? false;
      if (eventUserId !== currentUserId) {
        // Backend computed reactedByMe for the actor, not for current viewer.
        // Preserve our own reactedByMe state.
        const prevReaction = previousMap.get(emoji);
        if (prevReaction) {
          reactedByMe = prevReaction.reactedByMe;
        } else {
          reactedByMe = false;
        }
      }
      result.push({ emoji, count: reaction.count, reactedByMe });
    }

    for (const [emoji, prevReaction] of previousMap) {
      if (incomingMap.has(emoji)) continue;
      if (prevReaction.reactedByMe && eventUserId !== currentUserId) {
        // Another user removed their reaction, but current user still has it
        result.push({ emoji, count: 1, reactedByMe: true });
      } else {
        // Current user removed or replaced it, or current user never had it
        continue;
      }
    }

    return result;
  }

  function updateMessageReactionsFromEvent(
    messageId: string,
    incoming: Array<{ emoji: string; count: number; reactedByMe?: boolean }>,
    eventUserId: string,
  ) {
    setMessages((prev) => {
      if (prev.kind !== "success") return prev;
      return {
        kind: "success",
        data: prev.data.map((m) => {
          if (m.id !== messageId) return m;
          const merged = mergeReactionSummaryForViewer(
            m.reactions,
            incoming,
            eventUserId,
            user?.id,
          );
          return { ...m, reactions: merged };
        }),
      };
    });
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
      setConversation({ kind: "loading" });
      try {
        const [msgData, convsData] = await Promise.all([
          listDirectMessages(token, id),
          listDirectConversations(token),
        ]);
        if (!cancelled) {
          setMessages({ kind: "success", data: msgData });
          const conv = convsData.find((c) => c.id === id) ?? null;
          setConversation({ kind: "success", data: conv });
          setForwardConversations(convsData);
          if (conv?.isOnline) {
            setPresenceStatus("online");
          } else {
            setPresenceStatus("offline");
          }
        }
      } catch (err) {
        const message = localizeApiError(err, "direct.failedLoadMessages", t);
        if (!cancelled) {
          setMessages({ kind: "error", message });
          setConversation({ kind: "error", message });
        }
      }
    }
    load(accessToken, conversationId).then(() => {
      if (cancelled) return;
      safeMarkDirectConversationRead(accessToken, conversationId);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, conversationId, accessToken, t, markAllReadInState]);

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
      appendMessage({ ...msg, isUnreadForMe: false });
      if (wasNearBottom) {
        requestAnimationFrame(() => scrollMessagesToBottom("smooth"));
      }
      // Mark as read when receiving message while in open conversation
      if (accessToken) {
        safeMarkDirectConversationRead(accessToken, conversationId);
      }
    }

    function handleDirectMessageUpdated(msg: DirectMessage) {
      if (msg.conversationId !== conversationId) return;
      updateMessageInState(msg);
    }

    function handleDirectMessageDeleted(payload: {
      conversationId: string;
      messageId: string;
    }) {
      if (payload.conversationId !== conversationId) return;
      removeMessageFromState(payload.messageId);
      if (editingMessage?.id === payload.messageId) {
        setEditingMessage(null);
        setContent("");
        setEditState({ kind: "idle" });
      }
      if (replyToMessage?.id === payload.messageId) {
        setReplyToMessage(null);
      }
      if (forwardMessage?.id === payload.messageId) {
        setForwardMessage(null);
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

    function handleDirectReactionAdded(payload: {
      messageId: string;
      conversationId: string;
      emoji: string;
      user: { id: string; username: string };
      reactions: Array<{ emoji: string; count: number; reactedByMe?: boolean }>;
    }) {
      if (payload.conversationId !== conversationId) return;
      updateMessageReactionsFromEvent(payload.messageId, payload.reactions, payload.user.id);
    }

    function handleDirectReactionRemoved(payload: {
      messageId: string;
      conversationId: string;
      emoji: string;
      user: { id: string; username: string };
      reactions: Array<{ emoji: string; count: number; reactedByMe?: boolean }>;
    }) {
      if (payload.conversationId !== conversationId) return;
      updateMessageReactionsFromEvent(payload.messageId, payload.reactions, payload.user.id);
    }

    function handleDirectTyping(payload: {
      conversationId: string;
      user: { id: string; username: string; displayName: string | null };
      isTyping: boolean;
    }) {
      if (payload.conversationId !== conversationId) return;
      if (payload.user.id === user?.id) return;
      if (payload.isTyping) {
        setTypingUser(payload.user);
        if (autoHideTypingRef.current) {
          clearTimeout(autoHideTypingRef.current);
        }
        autoHideTypingRef.current = setTimeout(() => {
          setTypingUser(null);
        }, 3000);
      } else {
        setTypingUser(null);
        if (autoHideTypingRef.current) {
          clearTimeout(autoHideTypingRef.current);
          autoHideTypingRef.current = null;
        }
      }
    }

    function handlePresenceOnline(payload: {
      user: { id: string; username: string; displayName?: string | null };
      status: string;
    }) {
      if (payload.user.id === user?.id) return;
      const conv = conversationRef.current;
      if (
        conv.kind === "success" &&
        (conv.data === null ||
          conv.data.otherParticipant === null ||
          conv.data.otherParticipant.id !== payload.user.id)
      )
        return;
      setPresenceStatus("online");
    }

    function handlePresenceOffline(payload: {
      user: { id: string; username: string; displayName?: string | null };
      status: string;
    }) {
      if (payload.user.id === user?.id) return;
      const conv = conversationRef.current;
      if (
        conv.kind === "success" &&
        (conv.data === null ||
          conv.data.otherParticipant === null ||
          conv.data.otherParticipant.id !== payload.user.id)
      )
        return;
      setPresenceStatus("offline");
    }

    socket.on("direct:message:created", handleDirectMessageCreated);
    socket.on("direct:message:updated", handleDirectMessageUpdated);
    socket.on("direct:message:deleted", handleDirectMessageDeleted);
    socket.on("direct:joined", handleDirectJoined);
    socket.on("direct:error", handleDirectError);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);
    socket.on("connected", handleServerConnected);
    socket.on("direct:reaction:added", handleDirectReactionAdded);
    socket.on("direct:reaction:removed", handleDirectReactionRemoved);
    socket.on("direct:typing", handleDirectTyping);
    socket.on("presence:online", handlePresenceOnline);
    socket.on("presence:offline", handlePresenceOffline);

    function handleDirectConversationRead(payload: {
      conversationId: string;
      userId: string;
      readAt: string;
    }) {
      if (payload.conversationId !== conversationId) return;
      if (payload.userId === user?.id) return;
      setMessages((prev) => {
        if (prev.kind !== "success") return prev;
        return {
          kind: "success",
          data: prev.data.map((m) => {
            if (m.author.id !== user?.id) return m;
            if (m.createdAt <= payload.readAt) {
              return { ...m, readByOtherParticipant: true };
            }
            return m;
          }),
        };
      });
    }

    socket.on("direct:conversation:read", handleDirectConversationRead);

    // If socket is already connected, server auth is complete;
    // emit join immediately. For reconnects, serverConnected will fire.
    if (socket.connected) {
      joinRoom();
    }

    return () => {
      socket.off("direct:message:created", handleDirectMessageCreated);
      socket.off("direct:message:updated", handleDirectMessageUpdated);
      socket.off("direct:message:deleted", handleDirectMessageDeleted);
      socket.off("direct:joined", handleDirectJoined);
      socket.off("direct:error", handleDirectError);
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect", handleDisconnect);
      socket.off("connected", handleServerConnected);
      socket.off("direct:reaction:added", handleDirectReactionAdded);
      socket.off("direct:reaction:removed", handleDirectReactionRemoved);
      socket.off("direct:typing", handleDirectTyping);
      socket.off("presence:online", handlePresenceOnline);
      socket.off("presence:offline", handlePresenceOffline);
      socket.off("direct:conversation:read", handleDirectConversationRead);
      emitTypingStop();
      clearTypingTimeouts();
      socket.emit("direct:leave", { conversationId });
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, conversationId, accessToken]);

  useEffect(() => {
    function handleDocumentClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-testid^="direct-message-menu-"]') ||
        target.closest('[data-testid^="direct-message-menu-trigger-"]') ||
        target.closest('[data-testid^="direct-reaction-picker-"]')
      ) {
        return;
      }
      setMessageMenuId(null);
      setMessageMenuPosition(null);
      setReactionPickerMessageId(null);
      setReactionPickerPosition(null);
    }
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMessageMenuId(null);
        setMessageMenuPosition(null);
        setReactionPickerMessageId(null);
        setReactionPickerPosition(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    const frame = window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationId]);

  async function handleReactionClick(msg: DirectMessage, emoji: string) {
    if (!accessToken || !conversationId) return;
    const existing = msg.reactions.find((r) => r.emoji === emoji);
    try {
      if (existing?.reactedByMe) {
        const reactions = await removeDirectMessageReaction(accessToken, conversationId, msg.id, emoji);
        updateMessageReactions(msg.id, reactions);
      } else {
        const reactions = await reactToDirectMessage(accessToken, conversationId, msg.id, emoji);
        updateMessageReactions(msg.id, reactions);
      }
    } catch {
      // non-blocking
    }
  }

  function getMessageAuthorName(msg: DirectMessage) {
    return msg.author.displayName || msg.author.username || t("messageAuthor.unknownUser");
  }

  function getMessageSnippet(msg: DirectMessage) {
    const singleLine = msg.content.replace(/\s+/g, " ").trim();
    if (singleLine.length <= 120) return singleLine;
    return `${singleLine.slice(0, 117)}...`;
  }

  function scrollToMessage(messageId: string) {
    const el = messageRefs.current[messageId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current));
    }, 1800);
  }

  async function submitMessage() {
    if (editingMessage) {
      await handleEditSubmit();
      emitTypingStop();
      return;
    }
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
      const input: SendDirectMessageInput = {
        content: trimmed,
        ...(replyToMessage ? { parentId: replyToMessage.id } : {}),
      };
      const msg = await sendDirectMessage(accessToken, conversationId, input);
      setContent("");
      setReplyToMessage(null);
      setSendState({ kind: "idle" });
      emitTypingStop();
      appendMessage(msg);
      requestAnimationFrame(() => {
        scrollMessagesToBottom("smooth");
        composerTextareaRef.current?.focus();
      });
    } catch (err) {
      const message = localizeApiError(err, "direct.failedSendMessage", t);
      setSendState({ kind: "error", message });
      requestAnimationFrame(() => composerTextareaRef.current?.focus());
    }
  }

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    submitMessage();
  }

  async function handleForwardSend(targetConversationId: string) {
    if (!forwardMessage || !accessToken) return;
    const forwardedContent = `↪ ${forwardMessage.content}`;
    if (forwardedContent.length > 4000) {
      setForwardState({ kind: "error", message: t("channel.errorMessageTooLong") });
      return;
    }
    setForwardState({ kind: "loading" });
    try {
      await sendDirectMessage(accessToken, targetConversationId, { content: forwardedContent });
      setForwardState({ kind: "idle" });
      setForwardMessage(null);
      notifyDirectConversationsChanged();
      if (targetConversationId !== conversationId) {
        router.push(`/direct/${targetConversationId}`);
        return;
      }
      // If forwarded to current conversation, reload messages to show it
      const refreshed = await listDirectMessages(accessToken, conversationId);
      setMessages({ kind: "success", data: refreshed });
    } catch (err) {
      const message = localizeApiError(err, "direct.failedForwardMessage", t);
      setForwardState({ kind: "error", message });
    }
  }

  const forwardTargets = forwardConversations.filter((c) => c.id !== conversationId);

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
          <p className="mt-2 text-sm text-muted-foreground">
            {t("auth.pleaseSignIn")}
          </p>
          <Button asChild className="mt-4">
            <Link href="/login">{t("auth.signIn")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-w-0 w-full max-w-none flex-col gap-4 overflow-hidden p-4 sm:p-6">
      <main className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
        <header className="shrink-0 rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-indigo-50/30 p-3 shadow-sm dark:to-indigo-950/10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/direct">
                <ArrowLeft size={16} className="mr-1" />
                {t("direct.backToDirectMessages")}
              </Link>
            </Button>
            {conversation.kind === "success" && conversation.data?.otherParticipant && (
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <Avatar
                    src={conversation.data.otherParticipant.avatarUrl}
                    name={conversation.data.otherParticipant.displayName || conversation.data.otherParticipant.username}
                    size="md"
                    alt=""
                    className="ring-2 ring-border"
                  />
                  <span
                    data-testid="direct-presence-dot"
                    className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${
                      presenceStatus === "online"
                        ? "bg-emerald-500"
                        : "bg-muted-foreground"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {conversation.data.otherParticipant.displayName || conversation.data.otherParticipant.username || t("messageAuthor.unknownUser")}
                  </p>
                  <p
                    data-testid="direct-presence-status"
                    className="text-[11px] text-muted-foreground flex items-center gap-1"
                  >
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${presenceStatus === "online" ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                    {presenceStatus === "online" ? t("direct.online") : t("direct.offline")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="mt-4 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-md">
          <div ref={messagesScrollRef} data-testid="direct-messages-scroll" onScroll={() => { setMessageMenuId(null); setMessageMenuPosition(null); setReactionPickerMessageId(null); setReactionPickerPosition(null); }} className="chat-canvas min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="flex w-full max-w-3xl flex-col">
              {messages.kind === "loading" && (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  {t("direct.loadingMessages")}
                </div>
              )}

              {messages.kind === "error" && (
                <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {messages.message}
                </div>
              )}

              {messages.kind === "success" && messages.data.length === 0 && (
                <div className="mt-4">
                  <EmptyState
                    icon={MessageSquare}
                    title={t("direct.noMessages")}
                  />
                </div>
              )}

              {messages.kind === "success" && messages.data.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {(() => {
                    const firstUnreadIndex = messages.data.findIndex((m) => m.isUnreadForMe && m.author.id !== user?.id);
                    return messages.data.map((msg, index) => {
                      const isOwnMessage = user?.id === msg.author.id;
                      const showSeparator = index === firstUnreadIndex;
                      return [
                        showSeparator ? (
                          <li key="unread-separator" data-testid="direct-unread-separator" className="flex justify-center py-2">
                            <span className="text-xs font-medium text-amber-700 px-3 py-1 rounded-full bg-amber-100 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-900/60">
                              {t("direct.unreadMessages")}
                            </span>
                          </li>
                        ) : null,
                        (
                          <li
                            key={msg.id}
                        id={`message-${msg.id}`}
                        data-testid={`direct-message-row-${msg.id}`}
                        ref={(el) => {
                          messageRefs.current[msg.id] = el;
                        }}
                        className={`flex items-start gap-3 rounded-xl transition-colors ${
                          highlightedMessageId === msg.id
                            ? "bg-primary/10 ring-2 ring-primary/30"
                            : ""
                        }`}
                      >
                        <div
                          data-testid={`direct-message-avatar-${msg.id}`}
                          className="sticky bottom-3 self-end"
                        >
                          <Avatar
                            src={msg.author.avatarUrl}
                            name={msg.author.displayName || msg.author.username}
                            size="md"
                            alt=""
                          />
                        </div>
                        <div
                          data-testid={`direct-message-body-${msg.id}`}
                          className="min-w-0 max-w-[92%] sm:max-w-[80%]"
                        >
                          <div className="relative flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-semibold text-foreground truncate">
                              {msg.author.displayName || msg.author.username || t("messageAuthor.unknownUser")}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(msg.createdAt).toLocaleString()}
                            </span>
                            {msg.editedAt && (
                              <Badge variant="muted" className="text-[10px]">
                                {t("channel.edited")}
                              </Badge>
                            )}
                            {isOwnMessage && (
                              <span
                                data-testid={`direct-read-receipt-${msg.id}`}
                                className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
                              >
                                {msg.readByOtherParticipant ? (
                                  <>
                                    <CheckCheck size={12} />
                                    {t("direct.seen")}
                                  </>
                                ) : (
                                  <>
                                    <Check size={12} />
                                    {t("direct.sent")}
                                  </>
                                )}
                              </span>
                            )}
                            <Button
                              variant="icon"
                              size="sm"
                              onClick={(e) => openMenuForElement(msg.id, e.currentTarget)}
                              data-testid={`direct-message-menu-trigger-${msg.id}`}
                              className="ml-auto h-6 w-6"
                              aria-label={t("direct.messageMenu")}
                              aria-haspopup="menu"
                              aria-expanded={messageMenuId === msg.id}
                            >
                              <MoreHorizontal size={14} />
                            </Button>
                          </div>
                          <div data-testid={`direct-message-bubble-wrap-${msg.id}`} className={isOwnMessage ? "ml-4 sm:ml-32 md:ml-44" : ""}>
                            <div
                              data-testid={`direct-message-bubble-${msg.id}`}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                openMenuForElement(msg.id, e.currentTarget);
                              }}
                              className={`mt-1 w-fit max-w-full rounded-2xl border px-3 py-2 shadow-sm ${
                                isOwnMessage
                                  ? "bg-gradient-to-br from-indigo-500 to-violet-600 border-indigo-400 text-white shadow-indigo-200 dark:from-indigo-600 dark:to-violet-700 dark:border-indigo-700 dark:shadow-indigo-950/30"
                                  : "bg-card text-foreground border-border/80 shadow-sm"
                              }`}
                            >
                              {msg.parentId && (
                                <div className="mb-1.5" data-testid={`direct-quote-preview-${msg.id}`}>
                                  {(() => {
                                    const parent = messages.kind === "success"
                                      ? messages.data.find((m) => m.id === msg.parentId)
                                      : undefined;
                                    if (parent) {
                                      return (
                                        <button
                                          onClick={() => { closeMenuAndPicker(); scrollToMessage(parent.id); }}
                                          className="flex w-full flex-col gap-0.5 rounded-lg border-l-4 border-border bg-muted/50 px-2.5 py-1.5 text-left hover:bg-accent/50 transition-colors"
                                        >
                                          <span className="text-[11px] font-semibold text-foreground">
                                            {getMessageAuthorName(parent)}
                                          </span>
                                          <span className="text-xs text-muted-foreground line-clamp-2">
                                            {getMessageSnippet(parent)}
                                          </span>
                                        </button>
                                      );
                                    }
                                    return (
                                      <div className="flex flex-col gap-0.5 rounded-lg border-l-4 border-border bg-muted/50 px-2.5 py-1.5">
                                        <span className="text-[11px] font-semibold text-muted-foreground">
                                          {t("direct.reply")}
                                        </span>
                                        <span className="text-xs text-muted-foreground/80">
                                          {t("direct.originalMessageMissing")}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                              <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${isOwnMessage ? "text-white" : "text-foreground"}`}>
                                {msg.content}
                              </p>
                              {msg.reactions && msg.reactions.length > 0 && (
                                <div data-testid={`direct-reactions-${msg.id}`} className="mt-1.5 flex flex-wrap gap-1">
                                  {msg.reactions.map((reaction) => (
                                    <button
                                      key={reaction.emoji}
                                      onClick={() => handleReactionClick(msg, reaction.emoji)}
                                      data-testid={`direct-reaction-chip-${msg.id}-${reaction.emoji}`}
                                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                                        reaction.reactedByMe
                                          ? "bg-primary/10 border-primary/20 text-primary"
                                          : "bg-card border-border text-muted-foreground"
                                      }`}
                                    >
                                      <span>{reaction.emoji}</span>
                                      <span className="text-[10px] font-medium">{reaction.count}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                          </div>
                        </div>
                          </li>
                        ),
                      ];
                    });
                  })()}
                </ul>
              )}

              <div ref={messagesEndRef} className="h-1" />
            </div>
          </div>

          <form onSubmit={handleSendMessage} data-testid="direct-composer" className="shrink-0 flex flex-col gap-2 border-t border-indigo-200/60 bg-gradient-to-b from-card to-indigo-100/60 dark:from-card dark:to-indigo-950/30 p-4 shadow-lg">
            {socketError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {socketError}
              </div>
            )}
            {editingMessage && (
              <div data-testid="direct-edit-preview" className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {t("direct.editingMessage")}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground truncate">
                    {getMessageSnippet(editingMessage)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={handleEditCancel}
                  data-testid="direct-cancel-edit"
                  className="h-6 w-6"
                  aria-label={t("direct.cancelEdit")}
                >
                  <X size={14} />
                </Button>
              </div>
            )}
            {replyToMessage && (
              <div data-testid="direct-reply-preview" className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {t("direct.replyingTo")} {getMessageAuthorName(replyToMessage)}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground truncate">
                    {getMessageSnippet(replyToMessage)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={() => setReplyToMessage(null)}
                  data-testid="direct-cancel-reply"
                  className="h-6 w-6"
                  aria-label={t("direct.cancelReply")}
                >
                  <X size={14} />
                </Button>
              </div>
            )}
            {typingUser && (
              <div data-testid="direct-typing-indicator" className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                {t("direct.typing", typingUser.displayName || typingUser.username)}
              </div>
            )}
            <textarea
              id="direct-message-input"
              name="direct-message-input"
              aria-label={t("direct.typeMessage")}
              ref={composerTextareaRef}
              rows={2}
              placeholder={t("direct.typeMessage")}
              value={content}
              onChange={(e) => {
                const value = e.target.value;
                setContent(value);
                if (value.trim().length > 0) {
                  handleTypingStart();
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
              disabled={sendState.kind === "loading" || editState.kind === "loading"}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] text-muted-foreground">
                {content.length > 0 && `${content.length} / 4000`}
              </div>
              <Button
                type="submit"
                disabled={sendState.kind === "loading" || editState.kind === "loading"}
              >
                {editingMessage
                  ? editState.kind === "loading"
                    ? <><Loader2 size={16} className="mr-1.5 animate-spin" />{t("channel.savingEdit")}</>
                    : t("direct.saveEdit")
                  : sendState.kind === "loading"
                    ? <><Loader2 size={16} className="mr-1.5 animate-spin" />{t("direct.sending")}</>
                    : <><Send size={16} className="mr-1.5" />{t("direct.send")}</>}
              </Button>
            </div>
            {editState.kind === "error" && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {editState.message}
              </div>
            )}
            {sendState.kind === "error" && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {sendState.message}
              </div>
            )}
          </form>
        </div>
      </main>

      {messageMenuId && messageMenuPosition && (
        <div
          data-testid={`direct-message-menu-${messageMenuId}`}
          style={{ top: messageMenuPosition.top, left: messageMenuPosition.left }}
          className="fixed z-50 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg"
          role="menu"
        >
          {(() => {
            const activeMenuMessage =
              messages.kind === "success"
                ? messages.data.find((m) => m.id === messageMenuId) ?? null
                : null;
            if (!activeMenuMessage) return null;
            return (
              <>
                {activeMenuMessage.author.id === user?.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditStart(activeMenuMessage)}
                    data-testid={`direct-edit-action-${activeMenuMessage.id}`}
                    className="w-full justify-start"
                    role="menuitem"
                  >
                    <Edit3 size={14} className="mr-2" />
                    {t("direct.edit")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleReply(activeMenuMessage)}
                  data-testid={`direct-reply-action-${activeMenuMessage.id}`}
                  className="w-full justify-start"
                  role="menuitem"
                >
                  <Reply size={14} className="mr-2" />
                  {t("direct.reply")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (messageMenuPosition) {
                      openReactionPickerAt(activeMenuMessage.id, messageMenuPosition);
                    }
                  }}
                  data-testid={`direct-react-action-${activeMenuMessage.id}`}
                  className="w-full justify-start"
                  role="menuitem"
                >
                  <Smile size={14} className="mr-2" />
                  {t("direct.react")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleForward(activeMenuMessage)}
                  data-testid={`direct-forward-action-${activeMenuMessage.id}`}
                  className="w-full justify-start"
                  role="menuitem"
                >
                  <Forward size={14} className="mr-2" />
                  {t("direct.forward")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyText(activeMenuMessage.content)}
                  data-testid={`direct-copy-text-action-${activeMenuMessage.id}`}
                  className="w-full justify-start"
                  role="menuitem"
                >
                  <Copy size={14} className="mr-2" />
                  {t("direct.copyText")}
                </Button>
                {activeMenuMessage.author.id === user?.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(activeMenuMessage)}
                    data-testid={`direct-delete-action-${activeMenuMessage.id}`}
                    className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
                    role="menuitem"
                  >
                    <Trash2 size={14} className="mr-2" />
                    {t("direct.delete")}
                  </Button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {reactionPickerMessageId && reactionPickerPosition && (
        <div
          data-testid={`direct-reaction-picker-${reactionPickerMessageId}`}
          style={{ top: reactionPickerPosition.top, left: reactionPickerPosition.left }}
          className="fixed z-50 flex flex-wrap gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-sm"
        >
          {quickEmojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                const msg =
                  messages.kind === "success"
                    ? messages.data.find((m) => m.id === reactionPickerMessageId)
                    : undefined;
                if (msg) {
                  handleReactionClick(msg, emoji);
                }
                closeMenuAndPicker();
              }}
              data-testid={`direct-reaction-option-${reactionPickerMessageId}-${emoji}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              aria-label={`${t("direct.react")} ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {forwardMessage && (
        <div
          data-testid="direct-forward-picker"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setForwardMessage(null);
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold text-card-foreground">
                {t("direct.forwardMessage")}
              </h2>
              <Button
                type="button"
                variant="icon"
                size="sm"
                onClick={() => setForwardMessage(null)}
                data-testid="direct-cancel-forward"
                className="h-6 w-6"
                aria-label={t("direct.cancelForward")}
              >
                <X size={14} />
              </Button>
            </div>

            <div className="mb-4 rounded-lg border border-border bg-muted/50 px-3 py-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                {getMessageAuthorName(forwardMessage)}
              </p>
              <p className="mt-0.5 text-xs text-foreground line-clamp-3">
                {getMessageSnippet(forwardMessage)}
              </p>
            </div>

            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t("direct.forwardTo")}
            </p>

            {forwardTargets.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("direct.noForwardTargets")}
              </p>
            )}

            <ul className="max-h-60 overflow-y-auto space-y-1">
              {forwardTargets.map((conv) => (
                <li key={conv.id}>
                  <button
                    type="button"
                    onClick={() => handleForwardSend(conv.id)}
                    disabled={forwardState.kind === "loading"}
                    data-testid={`direct-forward-target-${conv.id}`}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-60"
                  >
                    <Avatar
                      src={conv.otherParticipant?.avatarUrl}
                      name={conv.otherParticipant?.displayName || conv.otherParticipant?.username}
                      size="md"
                      alt=""
                    />
                    <span className="text-sm text-foreground truncate">
                      {conv.otherParticipant?.displayName || conv.otherParticipant?.username || t("messageAuthor.unknownUser")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {forwardState.kind === "error" && (
              <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {forwardState.message}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
