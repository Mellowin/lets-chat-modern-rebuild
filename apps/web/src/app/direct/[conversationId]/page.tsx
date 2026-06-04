"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { getAvatarUrl } from "@/lib/avatar-url";
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
  const messageRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoHideTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingEmittedRef = useRef(false);

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
      const message = err instanceof Error ? err.message : t("direct.failedEditMessage");
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
      const message = err instanceof Error ? err.message : t("direct.failedDeleteMessage");
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
        const message = err instanceof Error ? err.message : t("direct.failedLoadMessages");
        if (!cancelled) {
          setMessages({ kind: "error", message });
          setConversation({ kind: "error", message });
        }
      }
    }
    load(accessToken, conversationId).then(() => {
      if (cancelled) return;
      markDirectConversationRead(accessToken, conversationId)
        .then(() => {
          notifyDirectConversationsChanged();
          markAllReadInState();
        })
        .catch(() => {
          // non-blocking
        });
    });
    return () => {
      cancelled = true;
    };
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
        markDirectConversationRead(accessToken, conversationId)
          .then(() => {
            notifyDirectConversationsChanged();
            markAllReadInState();
          })
          .catch(() => {
            // non-blocking
          });
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
      const message = err instanceof Error ? err.message : t("direct.failedSendMessage");
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
      const message = err instanceof Error ? err.message : t("direct.failedForwardMessage");
      setForwardState({ kind: "error", message });
    }
  }

  const forwardTargets = forwardConversations.filter((c) => c.id !== conversationId);

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
        <header className="shrink-0 flex items-center gap-3">
          <Link
            href="/direct"
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            {t("direct.backToDirectMessages")}
          </Link>
          {conversation.kind === "success" && conversation.data?.otherParticipant && (
            <div className="flex items-center gap-2">
              <div className="relative h-8 w-8 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                {conversation.data.otherParticipant.avatarUrl ? (
                  <Image
                    src={getAvatarUrl(conversation.data.otherParticipant.avatarUrl) || ""}
                    alt=""
                    fill
                    sizes="32px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {(conversation.data.otherParticipant.displayName || conversation.data.otherParticipant.username || "?").slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {conversation.data.otherParticipant.displayName || conversation.data.otherParticipant.username || t("messageAuthor.unknownUser")}
                </p>
                <p
                  data-testid="direct-presence-status"
                  className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1"
                >
                  <span
                    data-testid="direct-presence-dot"
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      presenceStatus === "online"
                        ? "bg-emerald-500"
                        : "bg-zinc-400 dark:bg-zinc-500"
                    }`}
                  />
                  {presenceStatus === "online" ? t("direct.online") : t("direct.offline")}
                </p>
              </div>
            </div>
          )}
        </header>

        <div className="mt-4 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
          <div ref={messagesScrollRef} data-testid="direct-messages-scroll" onScroll={() => { setMessageMenuId(null); setMessageMenuPosition(null); setReactionPickerMessageId(null); setReactionPickerPosition(null); }} className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-[#e4efc4] via-[#c9e2bf] to-[#9cc7b2] px-4 py-3 dark:from-zinc-950 dark:via-emerald-950/40 dark:to-zinc-900">
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
                  {(() => {
                    const firstUnreadIndex = messages.data.findIndex((m) => m.isUnreadForMe && m.author.id !== user?.id);
                    return messages.data.map((msg, index) => {
                      const isOwnMessage = user?.id === msg.author.id;
                      const showSeparator = index === firstUnreadIndex;
                      return [
                        showSeparator ? (
                          <li key="unread-separator" data-testid="direct-unread-separator" className="flex justify-center py-2">
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
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
                            ? "bg-yellow-100/70 dark:bg-yellow-900/30 ring-2 ring-yellow-300/80 dark:ring-yellow-700/70"
                            : ""
                        }`}
                      >
                        <div
                          data-testid={`direct-message-avatar-${msg.id}`}
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
                          data-testid={`direct-message-body-${msg.id}`}
                          className="min-w-0 max-w-[80%]"
                        >
                          <div className="relative flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
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
                            {isOwnMessage && (
                              <span
                                data-testid={`direct-read-receipt-${msg.id}`}
                                className="text-[10px] text-zinc-400 dark:text-zinc-500"
                              >
                                {msg.readByOtherParticipant ? t("direct.seen") : t("direct.sent")}
                              </span>
                            )}
                            <button
                              onClick={(e) => openMenuForElement(msg.id, e.currentTarget)}
                              data-testid={`direct-message-menu-trigger-${msg.id}`}
                              className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                              aria-label={t("direct.messageMenu")}
                              aria-haspopup="menu"
                              aria-expanded={messageMenuId === msg.id}
                            >
                              ⋯
                            </button>
                          </div>
                          <div data-testid={`direct-message-bubble-wrap-${msg.id}`} className={isOwnMessage ? "ml-28 sm:ml-44" : ""}>
                            <div
                              data-testid={`direct-message-bubble-${msg.id}`}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                openMenuForElement(msg.id, e.currentTarget);
                              }}
                              className={`mt-1 w-fit max-w-full rounded-2xl border px-3 py-2 shadow-sm ${
                                isOwnMessage
                                  ? "bg-emerald-50 border-emerald-200 text-zinc-900 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-zinc-100"
                                  : "bg-white/95 dark:bg-zinc-900/95 border-zinc-200 dark:border-zinc-800"
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
                                          className="flex w-full flex-col gap-0.5 rounded-lg border-l-4 border-zinc-400 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900/60 px-2.5 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                                        >
                                          <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                                            {getMessageAuthorName(parent)}
                                          </span>
                                          <span className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                                            {getMessageSnippet(parent)}
                                          </span>
                                        </button>
                                      );
                                    }
                                    return (
                                      <div className="flex flex-col gap-0.5 rounded-lg border-l-4 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60 px-2.5 py-1.5">
                                        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                          {t("direct.reply")}
                                        </span>
                                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                          {t("direct.originalMessageMissing")}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800 dark:text-zinc-200">
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
                                          ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-400"
                                          : "bg-white/80 border-zinc-200 text-zinc-600 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-300"
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

          <form onSubmit={handleSendMessage} data-testid="direct-composer" className="shrink-0 flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm">
            {socketError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {socketError}
                </div>
              </div>
            )}
            {editingMessage && (
              <div data-testid="direct-edit-preview" className="flex items-start justify-between gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    {t("direct.editingMessage")}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300 truncate">
                    {getMessageSnippet(editingMessage)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleEditCancel}
                  data-testid="direct-cancel-edit"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  aria-label={t("direct.cancelEdit")}
                >
                  ×
                </button>
              </div>
            )}
            {replyToMessage && (
              <div data-testid="direct-reply-preview" className="flex items-start justify-between gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    {t("direct.replyingTo")} {getMessageAuthorName(replyToMessage)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300 truncate">
                    {getMessageSnippet(replyToMessage)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyToMessage(null)}
                  data-testid="direct-cancel-reply"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  aria-label={t("direct.cancelReply")}
                >
                  ×
                </button>
              </div>
            )}
            {typingUser && (
              <div data-testid="direct-typing-indicator" className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t("direct.typing", typingUser.displayName || typingUser.username)}
              </div>
            )}
            <textarea
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
              className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100 disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {content.length > 0 && `${content.length} / 4000`}
              </div>
              <button
                type="submit"
                disabled={sendState.kind === "loading" || editState.kind === "loading"}
                className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {editingMessage
                  ? editState.kind === "loading"
                    ? t("channel.savingEdit")
                    : t("direct.saveEdit")
                  : sendState.kind === "loading"
                    ? t("direct.sending")
                    : t("direct.send")}
              </button>
            </div>
            {editState.kind === "error" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {editState.message}
                </div>
              </div>
            )}
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

      {messageMenuId && messageMenuPosition && (
        <div
          data-testid={`direct-message-menu-${messageMenuId}`}
          style={{ top: messageMenuPosition.top, left: messageMenuPosition.left }}
          className="fixed z-50 w-44 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1 shadow-lg"
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
                  <button
                    onClick={() => handleEditStart(activeMenuMessage)}
                    data-testid={`direct-edit-action-${activeMenuMessage.id}`}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    role="menuitem"
                  >
                    <span className="text-base">✏️</span>
                    <span>{t("direct.edit")}</span>
                  </button>
                )}
                <button
                  onClick={() => handleReply(activeMenuMessage)}
                  data-testid={`direct-reply-action-${activeMenuMessage.id}`}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  role="menuitem"
                >
                  <span className="text-base">↩</span>
                  <span>{t("direct.reply")}</span>
                </button>
                <button
                  onClick={() => {
                    if (messageMenuPosition) {
                      openReactionPickerAt(activeMenuMessage.id, messageMenuPosition);
                    }
                  }}
                  data-testid={`direct-react-action-${activeMenuMessage.id}`}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  role="menuitem"
                >
                  <span className="text-base">😊</span>
                  <span>{t("direct.react")}</span>
                </button>
                <button
                  onClick={() => handleForward(activeMenuMessage)}
                  data-testid={`direct-forward-action-${activeMenuMessage.id}`}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  role="menuitem"
                >
                  <span className="text-base">↪</span>
                  <span>{t("direct.forward")}</span>
                </button>
                <button
                  onClick={() => handleCopyText(activeMenuMessage.content)}
                  data-testid={`direct-copy-text-action-${activeMenuMessage.id}`}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  role="menuitem"
                >
                  <span className="text-base">📋</span>
                  <span>{t("direct.copyText")}</span>
                </button>
                {activeMenuMessage.author.id === user?.id && (
                  <button
                    onClick={() => handleDelete(activeMenuMessage)}
                    data-testid={`direct-delete-action-${activeMenuMessage.id}`}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    role="menuitem"
                  >
                    <span className="text-base">🗑️</span>
                    <span>{t("direct.delete")}</span>
                  </button>
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
          className="fixed z-50 flex flex-wrap gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1.5 shadow-sm"
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
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
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
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xl">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t("direct.forwardMessage")}
              </h2>
              <button
                type="button"
                onClick={() => setForwardMessage(null)}
                data-testid="direct-cancel-forward"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label={t("direct.cancelForward")}
              >
                ×
              </button>
            </div>

            <div className="mb-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-3 py-2">
              <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                {getMessageAuthorName(forwardMessage)}
              </p>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-3">
                {getMessageSnippet(forwardMessage)}
              </p>
            </div>

            <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {t("direct.forwardTo")}
            </p>

            {forwardTargets.length === 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-60"
                  >
                    <div className="relative h-8 w-8 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                      {conv.otherParticipant?.avatarUrl ? (
                        <Image
                          src={getAvatarUrl(conv.otherParticipant.avatarUrl) || ""}
                          alt=""
                          fill
                          sizes="32px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          {(conv.otherParticipant?.displayName || conv.otherParticipant?.username || "?").slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                      {conv.otherParticipant?.displayName || conv.otherParticipant?.username || t("messageAuthor.unknownUser")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {forwardState.kind === "error" && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {forwardState.message}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
