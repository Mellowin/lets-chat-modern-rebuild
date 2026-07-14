"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  Download,
  Edit3,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Flag,
  Forward,
  ImageIcon,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pin,
  Presentation,
  Reply,
  Send,
  Smile,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { Avatar } from "@/components/ui/Avatar";
import { BlockUserButton } from "@/components/BlockUserButton";
import { ReportModal } from "@/components/ReportModal";
import { MessageContent } from "@/components/MessageContent";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useMessageListScroll } from "@/lib/use-message-list-scroll";
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
  getDirectMessageContext,
  uploadDirectAttachmentViaProxyWithProgress,
  getDirectAttachmentFileObjectUrl,
  fetchDirectAttachmentFile,
  pinDirectMessage,
  unpinDirectMessage,
  getPinnedDirectMessages,
  type DirectMessage,
  type SendDirectMessageInput,
  type UpdateDirectMessageInput,
  type DirectConversation,
  type DirectMessageReactionSummary,
  type DirectMessageContextResult,
  type DirectMessageAttachment,
  type PinnedDirectMessageSummary,
} from "@/lib/direct-conversations-api";
import { createSocket } from "@/lib/socket-client";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES as ALLOWED_ATTACHMENT_TYPES,
  EXTENSION_TO_MIME_TYPE as EXTENSION_MIME_MAP,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
  MAX_TOTAL_ATTACHMENT_SIZE_BYTES,
  ATTACHMENT_CATEGORY_MAX_SIZE_BYTES,
  getAttachmentCategory,
  getAttachmentMimeType,
  getAttachmentExtension,
  isAllowedAttachmentExtension,
} from "@lets-chat/shared";

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

type ComposerAttachment = {
  id: string;
  file: File;
  status: "ready" | "uploading" | "uploaded" | "failed";
  progress: number;
  error: string | null;
  result?: DirectMessageAttachment;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowedAttachmentFile(file: File): boolean {
  if (ALLOWED_ATTACHMENT_TYPES.includes(file.type)) return true;
  const ext = getAttachmentExtension(file.name);
  if (!isAllowedAttachmentExtension(ext)) return false;
  const mapped = EXTENSION_MIME_MAP[ext];
  return mapped ? ALLOWED_ATTACHMENT_TYPES.includes(mapped) : false;
}

function normalizeAttachmentFile(file: File): File {
  const type = getAttachmentMimeType(file.name, file.type);
  if (type === file.type) return file;
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

type AttachmentTypeLabelKey =
  | "channel.attachmentTypeImage"
  | "channel.attachmentTypePdf"
  | "channel.attachmentTypeWord"
  | "channel.attachmentTypeExcel"
  | "channel.attachmentTypePowerPoint"
  | "channel.attachmentTypeArchive"
  | "channel.attachmentTypeVideo"
  | "channel.attachmentTypeAudio"
  | "channel.attachmentTypeFile";

function getAttachmentTypeInfo(mimeType: string): {
  icon: LucideIcon;
  labelKey: AttachmentTypeLabelKey;
} {
  if (mimeType.startsWith("image/")) {
    return { icon: ImageIcon, labelKey: "channel.attachmentTypeImage" };
  }
  if (
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/vnd.oasis.opendocument.text"
  ) {
    return { icon: FileText, labelKey: "channel.attachmentTypeWord" };
  }
  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    mimeType === "application/vnd.oasis.opendocument.spreadsheet"
  ) {
    return { icon: FileSpreadsheet, labelKey: "channel.attachmentTypeExcel" };
  }
  if (
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mimeType === "application/vnd.oasis.opendocument.presentation"
  ) {
    return { icon: Presentation, labelKey: "channel.attachmentTypePowerPoint" };
  }
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-7z-compressed" ||
    mimeType === "application/vnd.rar" ||
    mimeType === "application/x-rar-compressed"
  ) {
    return { icon: FileArchive, labelKey: "channel.attachmentTypeArchive" };
  }
  if (mimeType.startsWith("video/")) {
    return { icon: FileVideo, labelKey: "channel.attachmentTypeVideo" };
  }
  if (mimeType.startsWith("audio/")) {
    return { icon: FileAudio, labelKey: "channel.attachmentTypeAudio" };
  }
  if (mimeType === "application/pdf") {
    return { icon: FileText, labelKey: "channel.attachmentTypePdf" };
  }
  return { icon: FileIcon, labelKey: "channel.attachmentTypeFile" };
}

function DirectAttachmentFileCard({
  attachment,
  message,
  onDownload,
}: {
  attachment: DirectMessageAttachment;
  message: DirectMessage;
  onDownload: (msg: DirectMessage, att: DirectMessageAttachment) => void;
}) {
  const { t } = useLocale();
  const { icon: Icon, labelKey } = getAttachmentTypeInfo(attachment.mimeType);

  return (
    <button
      key={attachment.id}
      onClick={() => onDownload(message, attachment)}
      data-testid={`direct-message-attachment-${message.id}-${attachment.id}`}
      className="group flex w-full max-w-[16rem] sm:max-w-[20rem] items-center gap-3 rounded-xl border border-border/80 bg-card/70 px-3 py-2 text-left shadow-sm transition-all hover:border-primary/40 hover:bg-accent/40 hover:shadow-md"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10 transition-colors group-hover:bg-primary/15">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{attachment.fileName}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatFileSize(attachment.sizeBytes)}</span>
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {t(labelKey)}
          </span>
        </div>
      </div>
      <Download size={16} className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function DirectAttachmentImagePreview({
  attachment,
  messageId,
  conversationId,
  accessToken,
}: {
  attachment: DirectMessageAttachment;
  messageId: string;
  conversationId: string;
  accessToken: string;
}) {
  const { t } = useLocale();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    async function load() {
      try {
        const url = await getDirectAttachmentFileObjectUrl(
          accessToken,
          conversationId,
          messageId,
          attachment.id,
        );
        if (!cancelled) {
          createdUrl = url;
          setObjectUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [accessToken, conversationId, messageId, attachment.id]);

  return (
    <button
      type="button"
      data-testid={`direct-message-attachment-image-${messageId}-${attachment.id}`}
      className="block w-fit max-w-full rounded-lg border border-border bg-muted/50 p-1 text-left hover:bg-accent/50 transition-colors"
    >
      {loading ? (
        <div className="flex min-h-[8rem] items-center justify-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">{t("channel.attachmentLoading")}</span>
        </div>
      ) : failed || !objectUrl ? (
        <div className="flex min-h-[8rem] items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs">
          <ImageIcon size={16} className="text-muted-foreground" />
          <span className="truncate font-medium text-foreground">{attachment.fileName}</span>
          <span className="shrink-0 text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</span>
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- attachment file is streamed through the API proxy */}
          <img
            src={objectUrl}
            alt={attachment.fileName}
            draggable={false}
            loading="lazy"
            decoding="async"
            className="pointer-events-none max-h-60 rounded-lg object-cover shadow-sm"
            onError={() => setFailed(true)}
          />
          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate font-medium text-foreground">{attachment.fileName}</span>
            <span className="shrink-0">{formatFileSize(attachment.sizeBytes)}</span>
          </div>
        </>
      )}
    </button>
  );
}

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
  const [contextMode, setContextMode] = useState<
    | { kind: "idle" }
    | { kind: "active"; messages: DirectMessage[]; targetId: string }
  >({ kind: "idle" });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [olderMessagesState, setOlderMessagesState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });
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
  const [reportTarget, setReportTarget] = useState<{ userId: string; name: string } | null>(null);
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
  const [pinnedMessages, setPinnedMessages] = useState<PinnedDirectMessageSummary[]>([]);
  const [pinsPanelOpen, setPinsPanelOpen] = useState(false);
  const [pinsState, setPinsState] = useState<{ kind: "idle" | "loading" | "error"; message?: string }>({ kind: "idle" });
  const [typingUser, setTypingUser] = useState<{ id: string; username: string; displayName: string | null } | null>(null);
  const [presenceStatus, setPresenceStatus] = useState<"online" | "offline">("offline");
  const [scrollPaused, setScrollPaused] = useState(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const composerAttachmentsRef = useRef<ComposerAttachment[]>([]);
  useEffect(() => {
    composerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);
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
      contextMode.kind === "idle" &&
      handledQueryMessageIdRef.current !== targetMessageId
    ) {
      handledQueryMessageIdRef.current = targetMessageId;
      const loaded = messages.data.find((m) => m.id === targetMessageId);
      if (loaded) {
        scrollToMessage(targetMessageId);
      } else {
        getDirectMessageContext(accessToken, conversationId, targetMessageId)
          .then((result) => {
            handleLoadContext({ ...result, targetId: targetMessageId });
          })
          .catch(() => {
            // ignore: message may not exist or be inaccessible
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, conversationId, accessToken, searchParams, messages, contextMode.kind]);

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
    setComposerAttachments([]);
    composerAttachmentsRef.current = [];
    setAttachmentError(null);
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

  async function handlePinDirectMessage(msg: DirectMessage) {
    closeMenuAndPicker();
    if (!accessToken || !conversationId) return;
    try {
      const pin = await pinDirectMessage(accessToken, conversationId, msg.id);
      updateMessagePinState(msg.id, true, { pinnedAt: pin.pinnedAt, pinnedByUserId: pin.pinnedBy?.id });
      setPinnedMessages((prev) => {
        const filtered = prev.filter((p) => p.message.id !== msg.id);
        return [pin, ...filtered];
      });
    } catch (err) {
      const message = localizeApiError(err, "direct.pinFailed", t);
      setSocketError(message);
    }
  }

  async function handleUnpinDirectMessage(msg: DirectMessage) {
    closeMenuAndPicker();
    if (!accessToken || !conversationId) return;
    try {
      await unpinDirectMessage(accessToken, conversationId, msg.id);
      updateMessagePinState(msg.id, false, null);
      removePinFromState(msg.id);
    } catch (err) {
      const message = localizeApiError(err, "direct.unpinFailed", t);
      setSocketError(message);
    }
  }

  function appendMessage(msg: DirectMessage) {
    setMessages((prev) => {
      if (prev.kind !== "success") return prev;
      if (prev.data.some((m) => m.id === msg.id)) return prev;
      return { kind: "success", data: [...prev.data, msg] };
    });
  }

  async function loadOlderMessages() {
    if (!accessToken || !conversationId || !nextCursor) return;
    unstick();
    setScrollPaused(true);
    setOlderMessagesState({ kind: "loading" });

    const scrollEl = messagesScrollElementRef.current;
    const previousScrollHeight = scrollEl?.scrollHeight ?? 0;

    try {
      const result = await listDirectMessages(accessToken, conversationId, {
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
      const message = localizeApiError(err, "direct.failedLoadMessages", t);
      setOlderMessagesState({ kind: "error", message });
    }
  }

  async function loadPins(token: string, id: string) {
    setPinsState({ kind: "loading" });
    try {
      const result = await getPinnedDirectMessages(token, id, { limit: 50 });
      setPinnedMessages(result.items);
      setPinsState({ kind: "idle" });
    } catch {
      setPinsState({ kind: "error", message: t("direct.pinFailed") });
    }
  }

  function updateMessagePinState(messageId: string, isPinned: boolean, pin?: DirectMessage["pin"]) {
    setMessages((prev) => {
      if (prev.kind !== "success") return prev;
      return {
        kind: "success",
        data: prev.data.map((m) => (m.id === messageId ? { ...m, isPinned, pin } : m)),
      };
    });
  }

  function removePinFromState(messageId: string) {
    setPinnedMessages((prev) => prev.filter((p) => p.message.id !== messageId));
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
          setMessages({ kind: "success", data: msgData.items });
          setNextCursor(msgData.nextCursor);
          setHasMoreMessages(msgData.hasMore);
          loadPins(token, id);
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
      removePinFromState(payload.messageId);
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

    function handleDirectMessagePinned(payload: {
      messageId: string;
      conversationId: string;
      pinnedAt: string;
      pinnedByUserId: string;
    }) {
      if (payload.conversationId !== conversationId) return;
      updateMessagePinState(payload.messageId, true, { pinnedAt: payload.pinnedAt, pinnedByUserId: payload.pinnedByUserId });
      if (accessToken) {
        loadPins(accessToken, conversationId);
      }
    }

    function handleDirectMessageUnpinned(payload: {
      messageId: string;
      conversationId: string;
    }) {
      if (payload.conversationId !== conversationId) return;
      updateMessagePinState(payload.messageId, false, null);
      removePinFromState(payload.messageId);
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
    socket.on("direct:message:pinned", handleDirectMessagePinned);
    socket.on("direct:message:unpinned", handleDirectMessageUnpinned);

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
      socket.off("direct:message:pinned", handleDirectMessagePinned);
      socket.off("direct:message:unpinned", handleDirectMessageUnpinned);
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
    if (singleLine.length === 0 && msg.attachments && msg.attachments.length > 0) {
      return t("direct.replyAttachmentIndicator");
    }
    if (singleLine.length <= 120) return singleLine;
    return `${singleLine.slice(0, 117)}...`;
  }

  function getPinnedMessageSnippet(pin: PinnedDirectMessageSummary) {
    const content = pin.message.content ?? "";
    const singleLine = content.replace(/\s+/g, " ").trim();
    if (singleLine.length === 0 && pin.message.attachmentCount > 0) {
      return t("direct.attachmentOnly");
    }
    if (singleLine.length <= 120) return singleLine;
    return `${singleLine.slice(0, 117)}...`;
  }

  function renderReplyContent(content: string | null) {
    if (content === null) return null;
    const singleLine = content.replace(/\s+/g, " ").trim();
    if (singleLine.length === 0) return t("direct.replyAttachmentIndicator");
    return singleLine;
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

  function handleLoadContext(result: DirectMessageContextResult & { targetId: string }) {
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

  function getFileCategoryMaxSize(file: File): number {
    const mime = getAttachmentMimeType(file.name, file.type);
    const category = getAttachmentCategory(mime);
    return ATTACHMENT_CATEGORY_MAX_SIZE_BYTES[category];
  }

  function validateAndAddFiles(files: File[]) {
    setAttachmentError(null);

    if (files.length === 0) return;

    const normalizedFiles = files.map(normalizeAttachmentFile);
    const accepted: File[] = [];
    let hasTypeReject = false;
    let hasSizeReject = false;

    for (const file of normalizedFiles) {
      if (!isAllowedAttachmentFile(file)) {
        hasTypeReject = true;
        continue;
      }
      if (file.size > getFileCategoryMaxSize(file)) {
        hasSizeReject = true;
        continue;
      }
      accepted.push(file);
    }

    const projectedCount = composerAttachments.length + accepted.length;
    const existingAllImage = composerAttachments.every(
      (att) =>
        getAttachmentCategory(
          getAttachmentMimeType(att.file.name, att.file.type),
        ) === "image",
    );
    const acceptedAllImage = accepted.every(
      (file) =>
        getAttachmentCategory(getAttachmentMimeType(file.name, file.type)) ===
        "image",
    );
    const allImage = existingAllImage && acceptedAllImage;
    const countLimit = allImage
      ? MAX_IMAGE_ATTACHMENTS_PER_MESSAGE
      : MAX_ATTACHMENTS_PER_MESSAGE;

    if (projectedCount > countLimit) {
      setAttachmentError(t("channel.errorTooManyAttachments"));
      return;
    }

    const existingTotalSize = composerAttachments.reduce(
      (sum, att) => sum + att.file.size,
      0,
    );
    const acceptedTotalSize = accepted.reduce((sum, file) => sum + file.size, 0);
    const projectedTotalSize = existingTotalSize + acceptedTotalSize;
    if (projectedTotalSize > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
      setAttachmentError(t("channel.errorAttachmentsTotalTooLarge"));
      return;
    }

    if (accepted.length === 0) {
      if (hasTypeReject) {
        setAttachmentError(t("channel.errorInvalidAttachmentType"));
      } else {
        setAttachmentError(t("channel.errorAttachmentTooLargeByCategory"));
      }
      return;
    }

    if (hasTypeReject) {
      setAttachmentError(t("channel.errorInvalidAttachmentType"));
    } else if (hasSizeReject) {
      setAttachmentError(t("channel.errorAttachmentTooLargeByCategory"));
    }

    const addFiles = (prev: ComposerAttachment[]) => [
      ...prev,
      ...accepted.map((file): ComposerAttachment => ({
        id: crypto.randomUUID(),
        file,
        status: "ready",
        progress: 0,
        error: null,
      })),
    ];
    setComposerAttachments(addFiles);
    composerAttachmentsRef.current = addFiles(composerAttachmentsRef.current);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    validateAndAddFiles(files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      setIsDragOver(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    validateAndAddFiles(files);
  }

  function handleRemoveAttachment(id: string) {
    const remove = (prev: ComposerAttachment[]) => prev.filter((a) => a.id !== id);
    setComposerAttachments(remove);
    composerAttachmentsRef.current = remove(composerAttachmentsRef.current);
    setAttachmentError(null);
  }

  async function uploadOneAttachment(id: string): Promise<boolean> {
    if (!accessToken || !conversationId) return false;
    const att = composerAttachmentsRef.current.find((a) => a.id === id);
    if (!att || att.status === "uploaded") return true;

    const setUploading = (prev: ComposerAttachment[]) =>
      prev.map((a): ComposerAttachment => (a.id === id ? { ...a, status: "uploading", progress: 0, error: null } : a));
    setComposerAttachments(setUploading);
    composerAttachmentsRef.current = setUploading(composerAttachmentsRef.current);

    try {
      const uploadResult = await uploadDirectAttachmentViaProxyWithProgress(
        accessToken,
        conversationId,
        att.file,
        (percent) => {
          const setProgress = (prev: ComposerAttachment[]) =>
            prev.map((a): ComposerAttachment => (a.id === id ? { ...a, progress: percent } : a));
          setComposerAttachments(setProgress);
          composerAttachmentsRef.current = setProgress(composerAttachmentsRef.current);
        },
      );

      const setUploaded = (prev: ComposerAttachment[]) =>
        prev.map((a): ComposerAttachment =>
          a.id === id
            ? {
                ...a,
                status: "uploaded",
                progress: 100,
                error: null,
                result: {
                  id: uploadResult.id,
                  fileName: uploadResult.fileName,
                  mimeType: uploadResult.mimeType,
                  sizeBytes: uploadResult.sizeBytes,
                  kind: uploadResult.kind,
                  createdAt: uploadResult.createdAt,
                },
              }
            : a,
        );
      setComposerAttachments(setUploaded);
      composerAttachmentsRef.current = setUploaded(composerAttachmentsRef.current);
      return true;
    } catch (err) {
      const message = localizeApiError(err, "channel.errorAttachmentUploadFailed", t);
      const setFailed = (prev: ComposerAttachment[]) =>
        prev.map((a): ComposerAttachment => (a.id === id ? { ...a, status: "failed", progress: 0, error: message } : a));
      setComposerAttachments(setFailed);
      composerAttachmentsRef.current = setFailed(composerAttachmentsRef.current);
      return false;
    }
  }

  function handleRetryAttachment(id: string) {
    void uploadOneAttachment(id);
  }

  async function handleDownloadAttachment(msg: DirectMessage, att: DirectMessageAttachment) {
    if (!accessToken || !conversationId) return;
    try {
      const blob = await fetchDirectAttachmentFile(accessToken, conversationId, msg.id, att.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = localizeApiError(err, "channel.errorDownloadFailed", t);
      setSocketError(message);
    }
  }

  async function submitMessage() {
    if (editingMessage) {
      await handleEditSubmit();
      emitTypingStop();
      return;
    }
    const trimmed = content.trim();
    const hasContent = trimmed.length > 0;
    const hasAttachments = composerAttachments.length > 0;

    if (!hasContent && !hasAttachments) {
      setSendState({ kind: "error", message: t("channel.errorMessageEmpty") });
      return;
    }
    if (hasContent && trimmed.length > 4000) {
      setSendState({ kind: "error", message: t("channel.errorMessageTooLong") });
      return;
    }
    if (!accessToken || !conversationId) return;

    setSendState({ kind: "loading" });
    setAttachmentError(null);

    try {
      const needsUpload = composerAttachmentsRef.current.filter(
        (a) => a.status === "ready" || a.status === "failed",
      );

      if (needsUpload.length > 0) {
        const results = await Promise.all(needsUpload.map((a) => uploadOneAttachment(a.id)));
        if (!results.every((r) => r)) {
          const failedAttachment = composerAttachmentsRef.current.find((a) => a.status === "failed" && a.error);
          const detail = failedAttachment?.error;
          const message = detail
            ? `${t("channel.errorAttachmentUploadFailed")} ${detail}`
            : t("channel.errorAttachmentUploadFailed");
          setSendState({ kind: "error", message });
          return;
        }
      }

      const current = composerAttachmentsRef.current;
      const allUploaded = current.every((a) => a.status === "uploaded");
      if (!allUploaded) {
        setSendState({ kind: "error", message: t("channel.errorAttachmentUploadFailed") });
        return;
      }

      const attachmentIds = current.map((a) => a.result?.id).filter((id): id is string => !!id);

      const input: SendDirectMessageInput = {
        ...(hasContent ? { content: trimmed } : {}),
        ...(replyToMessage ? { replyToMessageId: replyToMessage.id } : {}),
        ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
      };
      const msg = await sendDirectMessage(accessToken, conversationId, input);
      setContent("");
      setComposerAttachments([]);
      composerAttachmentsRef.current = [];
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
      setMessages({ kind: "success", data: refreshed.items });
      setNextCursor(refreshed.nextCursor);
      setHasMoreMessages(refreshed.hasMore);
    } catch (err) {
      const message = localizeApiError(err, "direct.failedForwardMessage", t);
      setForwardState({ kind: "error", message });
    }
  }

  const isUploadingAttachments = composerAttachments.some((a) => a.status === "uploading");
  const filePreviews = useMemo(() => {
    const map = new Map<string, string>();
    composerAttachments.forEach((att) => {
      if (att.file.type.startsWith("image/")) {
        map.set(att.id, URL.createObjectURL(att.file));
      }
    });
    return map;
  }, [composerAttachments]);

  useEffect(() => {
    return () => {
      filePreviews.forEach((url: string) => URL.revokeObjectURL(url));
    };
  }, [filePreviews]);

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
                <div className="ml-auto flex items-center gap-2">
                  <BlockUserButton
                    accessToken={accessToken ?? ""}
                    userId={conversation.data?.otherParticipant?.id ?? ""}
                    userName={
                      conversation.data?.otherParticipant?.displayName ||
                      conversation.data?.otherParticipant?.username ||
                      ""
                    }
                    variant="ghost"
                    size="sm"
                    showLabel={false}
                    onBlocked={() => {
                      void listDirectMessages(accessToken ?? "", conversationId).then((data) => {
                        setMessages({ kind: "success", data: data.items });
                        setNextCursor(data.nextCursor);
                        setHasMoreMessages(data.hasMore);
                      }).catch(() => {
                        // non-blocking
                      });
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={t("direct.report")}
                    onClick={() =>
                      setReportTarget({
                        userId: conversation.data?.otherParticipant?.id ?? "",
                        name:
                          conversation.data?.otherParticipant?.displayName ||
                          conversation.data?.otherParticipant?.username ||
                          "",
                      })
                    }
                  >
                    <Flag size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </header>

        {pinnedMessages.length > 0 && (
          <div data-testid="direct-pinned-header" className="mt-3 rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                <Pin size={16} className="shrink-0 text-primary" />
                <span className="font-medium">{t("direct.pinnedMessages")}</span>
                <span className="text-muted-foreground">({pinnedMessages.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => scrollToMessage(pinnedMessages[0].message.id)}
                  data-testid="direct-pinned-jump-latest"
                >
                  {t("channel.jumpToMessage")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPinsPanelOpen((prev) => !prev)}
                  data-testid="direct-pins-toggle"
                >
                  {pinsPanelOpen ? t("channel.cancel") : t("direct.pinnedMessages")}
                </Button>
              </div>
            </div>
            <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{getPinnedMessageSnippet(pinnedMessages[0])}</span>
              <span className="shrink-0">— {pinnedMessages[0].message.author.displayName || pinnedMessages[0].message.author.username}</span>
            </div>
            {pinsPanelOpen && (
              <div data-testid="direct-pins-panel" className="mt-3 space-y-2 border-t border-border/50 pt-3">
                {pinsState.kind === "loading" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" />
                    {t("direct.loadingMessages")}
                  </div>
                )}
                {pinsState.kind === "error" && (
                  <div className="text-sm text-destructive">{pinsState.message}</div>
                )}
                {pinnedMessages.map((pin) => (
                  <div
                    key={pin.id}
                    data-testid={`direct-pinned-item-${pin.message.id}`}
                    className="flex items-start justify-between gap-2 rounded-md bg-muted/50 p-2"
                  >
                    <button
                      onClick={() => {
                        setPinsPanelOpen(false);
                        scrollToMessage(pin.message.id);
                      }}
                      className="min-w-0 text-left text-sm"
                    >
                      <p className="truncate text-foreground">{getPinnedMessageSnippet(pin)}</p>
                      <p className="text-xs text-muted-foreground">
                        {pin.message.author.displayName || pin.message.author.username}
                        {" "}•{" "}
                        {new Date(pin.pinnedAt).toLocaleString()}
                        {pin.pinnedBy && (
                          <span className="ml-1">
                            • {t("direct.pinnedBy")} {pin.pinnedBy.displayName || pin.pinnedBy.username}
                          </span>
                        )}
                      </p>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnpinDirectMessage({ id: pin.message.id, isPinned: true } as DirectMessage)}
                      data-testid={`direct-pinned-unpin-${pin.message.id}`}
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {t("direct.unpinMessage")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          data-testid="direct-chat-panel"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="relative mt-4 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-md"
        >
          <div ref={messagesScrollRef} data-testid="direct-messages-scroll" onScroll={() => { setMessageMenuId(null); setMessageMenuPosition(null); setReactionPickerMessageId(null); setReactionPickerPosition(null); }} className="chat-canvas min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div ref={messagesContentRef} className="flex w-full max-w-3xl flex-col">
              {isContextMode && (
                <div className="mb-2 flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={exitContextMode}
                    data-testid="direct-back-to-latest"
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
                    data-testid="direct-load-older-messages"
                  >
                    {olderMessagesState.kind === "loading" ? (
                      <><Loader2 size={14} className="mr-1.5 animate-spin" />{t("direct.loadingOlderMessages")}</>
                    ) : (
                      t("direct.loadOlderMessages")
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

              {messages.kind === "success" && displayMessages.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {(() => {
                    const firstUnreadIndex = displayMessages.findIndex((m) => m.isUnreadForMe && m.author.id !== user?.id);
                    return displayMessages.map((msg, index) => {
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
                            {msg.isPinned && (
                              <Badge
                                variant="info"
                                className="text-[10px]"
                                data-testid={`message-pinned-indicator-${msg.id}`}
                              >
                                <Pin size={10} className="mr-0.5" />
                                {t("direct.pinnedMessage")}
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
                              {msg.replyTo && (
                                <div className="mb-1.5" data-testid={`direct-reply-to-preview-${msg.id}`}>
                                  {msg.replyTo.content !== null && msg.replyTo.author !== null ? (
                                    <button
                                      onClick={() => { closeMenuAndPicker(); scrollToMessage(msg.replyTo!.id); }}
                                      className="flex w-full flex-col gap-0.5 rounded-lg border-l-4 border-muted-foreground bg-muted/50 px-2.5 py-1.5 text-left hover:bg-accent/50 transition-colors"
                                    >
                                      <span className="text-[11px] font-semibold text-foreground">
                                        {msg.replyTo.author.displayName || msg.replyTo.author.username || t("messageAuthor.unknownUser")}
                                      </span>
                                      <span className="text-xs text-muted-foreground line-clamp-2">
                                        {renderReplyContent(msg.replyTo.content)}
                                      </span>
                                    </button>
                                  ) : (
                                    <div className="flex flex-col gap-0.5 rounded-lg border-l-4 border-border bg-muted/50 px-2.5 py-1.5">
                                      <span className="text-[11px] font-semibold text-muted-foreground">
                                        {t("direct.reply")}
                                      </span>
                                      <span className="text-xs text-muted-foreground/80">
                                        {t("direct.originalMessageMissing")}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {msg.parentId && (
                                <div className="mb-1.5" data-testid={`direct-quote-preview-${msg.id}`}>
                                  {(() => {
                                    const parent = messages.kind === "success"
                                      ? displayMessages.find((m) => m.id === msg.parentId)
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
                              {msg.content.trim().length > 0 && (
                                <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${isOwnMessage ? "text-white" : "text-foreground"}`}>
                                  <MessageContent content={msg.content} mentions={msg.mentions} />
                                </p>
                              )}
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div data-testid={`direct-message-attachments-${msg.id}`} className="mt-2 flex flex-col gap-1.5">
                                  {msg.attachments.map((att) =>
                                    att.kind === "image" ? (
                                      <DirectAttachmentImagePreview
                                        key={`${att.id}-${accessToken}`}
                                        attachment={att}
                                        messageId={msg.id}
                                        conversationId={conversationId}
                                        accessToken={accessToken || ""}
                                      />
                                    ) : (
                                      <DirectAttachmentFileCard
                                        key={att.id}
                                        attachment={att}
                                        message={msg}
                                        onDownload={handleDownloadAttachment}
                                      />
                                    ),
                                  )}
                                </div>
                              )}
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

          {isDragOver && (
            <div
              data-testid="direct-drop-overlay"
              className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm"
            >
              <UploadCloud size={48} className="text-primary" />
              <span className="text-lg font-semibold text-primary">
                {t("channel.dropFilesHere")}
              </span>
            </div>
          )}

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
            {composerAttachments.length > 0 && (
              <div data-testid="direct-composer-attachments" className="flex flex-wrap gap-2">
                {composerAttachments.map((att, index) => {
                  const previewUrl = filePreviews.get(att.id);
                  const isUploading = att.status === "uploading";
                  const isFailed = att.status === "failed";
                  const isUploaded = att.status === "uploaded";
                  const canRemove = att.status === "ready" || att.status === "failed";

                  return previewUrl ? (
                    <div
                      key={att.id}
                      data-testid={`direct-composer-attachment-preview-${index}`}
                      className="relative inline-flex flex-col gap-1 rounded-lg border border-border bg-muted/50 p-1"
                    >
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element -- blob preview URLs are intentionally rendered with native img */}
                        <img src={previewUrl} alt={att.file.name} className="h-16 w-16 rounded object-cover" />
                        {canRemove && (
                          <Button
                            type="button"
                            variant="icon"
                            size="sm"
                            onClick={() => handleRemoveAttachment(att.id)}
                            data-testid={`direct-composer-attachment-remove-${index}`}
                            className="absolute -right-1.5 -top-1.5 h-4 w-4"
                            aria-label={t("channel.removeAttachment")}
                          >
                            <X size={10} />
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1 px-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {formatFileSize(att.file.size)}
                        </span>
                        <span
                          className={`text-[10px] font-medium ${
                            isFailed
                              ? "text-destructive"
                              : isUploaded
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}
                          data-testid={`direct-composer-attachment-status-${index}`}
                        >
                          {isUploading
                            ? t("channel.attachmentUploading")
                            : isFailed
                            ? t("channel.attachmentUploadFailed")
                            : isUploaded
                            ? t("channel.attachmentUploaded")
                            : t("channel.attachmentReady")}
                        </span>
                      </div>
                      {isUploading && (
                        <div className="w-full px-0.5">
                          <div className="h-1 w-full rounded-full bg-muted">
                            <div
                              className="h-1 rounded-full bg-primary transition-all"
                              style={{ width: `${att.progress}%` }}
                              data-testid={`direct-composer-attachment-progress-${index}`}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{att.progress}%</span>
                        </div>
                      )}
                      {isFailed && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRetryAttachment(att.id)}
                          data-testid={`direct-composer-attachment-retry-${index}`}
                          className="h-auto px-0.5 py-0 text-xs"
                        >
                          {t("channel.retryUpload")}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div
                      key={att.id}
                      data-testid={`direct-composer-attachment-chip-${index}`}
                      className="inline-flex flex-col gap-1 rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <Paperclip size={12} className="text-muted-foreground" />
                        <span className="truncate max-w-[6rem]">{att.file.name}</span>
                        {canRemove && (
                          <Button
                            type="button"
                            variant="icon"
                            size="sm"
                            onClick={() => handleRemoveAttachment(att.id)}
                            data-testid={`direct-composer-attachment-remove-${index}`}
                            className="h-4 w-4"
                            aria-label={t("channel.removeAttachment")}
                          >
                            <X size={10} />
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {formatFileSize(att.file.size)}
                        </span>
                        <span
                          className={`text-[10px] font-medium ${
                            isFailed
                              ? "text-destructive"
                              : isUploaded
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}
                          data-testid={`direct-composer-attachment-status-${index}`}
                        >
                          {isUploading
                            ? t("channel.attachmentUploading")
                            : isFailed
                            ? t("channel.attachmentUploadFailed")
                            : isUploaded
                            ? t("channel.attachmentUploaded")
                            : t("channel.attachmentReady")}
                        </span>
                      </div>
                      {isUploading && (
                        <div className="w-full">
                          <div className="h-1 w-full rounded-full bg-muted">
                            <div
                              className="h-1 rounded-full bg-primary transition-all"
                              style={{ width: `${att.progress}%` }}
                              data-testid={`direct-composer-attachment-progress-${index}`}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{att.progress}%</span>
                        </div>
                      )}
                      {isFailed && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRetryAttachment(att.id)}
                          data-testid={`direct-composer-attachment-retry-${index}`}
                          className="h-auto px-0 py-0 text-xs"
                        >
                          {t("channel.retryUpload")}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendState.kind === "loading" || editState.kind === "loading" || isUploadingAttachments}
                  data-testid="direct-composer-attach-button"
                  aria-label={t("channel.attachFile")}
                >
                  <Paperclip size={16} />
                </Button>
                <input
                  id="direct-file-input"
                  name="direct-file-input"
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,application/rtf,text/rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/csv,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.oasis.opendocument.text,application/vnd.oasis.opendocument.spreadsheet,application/vnd.oasis.opendocument.presentation,application/zip,application/x-7z-compressed,application/vnd.rar,application/x-rar-compressed,video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,audio/mpeg,audio/wav,audio/ogg,audio/mp4,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.odt,.ods,.odp,.zip,.7z,.rar,.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.rtf,.mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.ogg,.m4a"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="direct-composer-file-input"
                  aria-label={t("channel.attachFile")}
                />
                <span className="text-xs text-muted-foreground">
                  {content.length}/4000
                </span>
              </div>
              <Button
                type="submit"
                disabled={sendState.kind === "loading" || editState.kind === "loading" || isUploadingAttachments}
              >
                {editingMessage
                  ? editState.kind === "loading"
                    ? <><Loader2 size={16} className="mr-1.5 animate-spin" />{t("channel.savingEdit")}</>
                    : t("direct.saveEdit")
                  : sendState.kind === "loading" || isUploadingAttachments
                    ? <><Loader2 size={16} className="mr-1.5 animate-spin" />{t("direct.sending")}</>
                    : <><Send size={16} className="mr-1.5" />{t("direct.send")}</>}
              </Button>
            </div>
            {attachmentError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive">
                {attachmentError}
              </div>
            )}
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
                ? displayMessages.find((m) => m.id === messageMenuId) ?? null
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
                {!activeMenuMessage.isPinned && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePinDirectMessage(activeMenuMessage)}
                    data-testid={`direct-pin-action-${activeMenuMessage.id}`}
                    className="w-full justify-start"
                    role="menuitem"
                  >
                    <Pin size={14} className="mr-2" />
                    {t("direct.pinMessage")}
                  </Button>
                )}
                {activeMenuMessage.isPinned && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnpinDirectMessage(activeMenuMessage)}
                    data-testid={`direct-unpin-action-${activeMenuMessage.id}`}
                    className="w-full justify-start"
                    role="menuitem"
                  >
                    <Pin size={14} className="mr-2" />
                    {t("direct.unpinMessage")}
                  </Button>
                )}
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
                    ? displayMessages.find((m) => m.id === reactionPickerMessageId)
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

      <ReportModal
        isOpen={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        accessToken={accessToken ?? ""}
        reportedUserId={reportTarget?.userId ?? ""}
        reportedUserName={reportTarget?.name ?? ""}
        directConversationId={conversationId}
        onSubmitted={() => {
          setTimeout(() => setReportTarget(null), 1500);
        }}
      />
    </div>
  );
}
