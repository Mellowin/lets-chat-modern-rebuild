"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Check,
  Copy,
  Edit3,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Forward,
  ImageIcon,
  Loader2,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Presentation,
  Reply,
  Send,
  Smile,
  Trash2,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale, translate, getLocale } from "@/lib/locale";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { getChannel, getChannelMembers, removeChannelMember, archiveChannel, leaveChannel, markChannelRead, type Channel, type ChannelMember } from "@/lib/channels-api";
import { createChannelInvite } from "@/lib/channel-invites-api";

import { getMessages, createMessage, updateMessage, deleteMessage, addMessageReaction, removeMessageReaction, uploadAttachmentViaProxyWithProgress, fetchAttachmentFile, getAttachmentFileObjectUrl, getMessageContext, type Message, type CreateMessageInput, type UpdateMessageInput, type ReactionSummary, type Attachment, type MessageContextResult, CreateMessageAttachmentInput } from "@/lib/messages-api";
import { sendDirectMessage, listDirectConversations, type DirectConversation } from "@/lib/direct-conversations-api";
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
import { MessageAuthor } from "@/components/MessageAuthor";
import ChannelMessageSearch from "@/components/ChannelMessageSearch";
import ImageLightbox from "@/components/ImageLightbox";


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

type ComposerAttachment = {
  id: string;
  file: File;
  status: "ready" | "uploading" | "uploaded" | "failed";
  progress: number;
  error: string | null;
  result?: CreateMessageAttachmentInput;
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

function getAttachmentTypeInfo(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return { icon: ImageIcon, label: "Image" };
  }
  if (
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/vnd.oasis.opendocument.text"
  ) {
    return { icon: FileText, label: "Word" };
  }
  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    mimeType === "application/vnd.oasis.opendocument.spreadsheet"
  ) {
    return { icon: FileSpreadsheet, label: "Excel" };
  }
  if (
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mimeType === "application/vnd.oasis.opendocument.presentation"
  ) {
    return { icon: Presentation, label: "PowerPoint" };
  }
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-7z-compressed" ||
    mimeType === "application/vnd.rar" ||
    mimeType === "application/x-rar-compressed"
  ) {
    return { icon: FileArchive, label: "Archive" };
  }
  if (mimeType.startsWith("video/")) {
    return { icon: FileVideo, label: "Video" };
  }
  if (mimeType.startsWith("audio/")) {
    return { icon: FileAudio, label: "Audio" };
  }
  if (mimeType === "application/pdf") {
    return { icon: FileText, label: "PDF" };
  }
  return { icon: FileIcon, label: "File" };
}

function AttachmentFileCard({
  attachment,
  message,
  onDownload,
}: {
  attachment: Attachment;
  message: Message;
  onDownload: (msg: Message, att: Attachment) => void;
}) {
  const { icon: Icon, label } = getAttachmentTypeInfo(attachment.mimeType);

  return (
    <button
      key={attachment.id}
      onClick={() => onDownload(message, attachment)}
      data-testid={`message-attachment-${message.id}-${attachment.id}`}
      className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-left text-xs hover:bg-accent/50 transition-colors"
    >
      <Icon size={16} className="shrink-0 text-muted-foreground" />
      <span className="truncate font-medium text-foreground">{attachment.fileName}</span>
      <span className="shrink-0 text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</span>
      <span className="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">
        {label}
      </span>
    </button>
  );
}

function AttachmentImagePreview({
  attachment,
  messageId,
  workspaceId,
  channelId,
  accessToken,
  onOpen,
}: {
  attachment: Attachment;
  messageId: string;
  workspaceId: string;
  channelId: string;
  accessToken: string;
  onOpen: (att: Attachment) => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    async function load() {
      try {
        const url = await getAttachmentFileObjectUrl(
          accessToken,
          workspaceId,
          channelId,
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
  }, [accessToken, workspaceId, channelId, messageId, attachment.id]);

  return (
    <button
      type="button"
      onClick={() => onOpen(attachment)}
      data-testid={`message-attachment-image-${messageId}-${attachment.id}`}
      className="block w-fit max-w-full rounded-lg border border-border bg-muted/50 p-1 text-left hover:bg-accent/50 transition-colors"
    >
      {loading ? (
        <div className="flex items-center gap-2 px-1.5 py-1 text-xs">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Loading…</span>
        </div>
      ) : failed || !objectUrl ? (
        <div className="flex items-center gap-2 px-1.5 py-1 text-xs">
          <ImageIcon size={16} className="text-muted-foreground" />
          <span className="truncate font-medium text-foreground">{attachment.fileName}</span>
          <span className="shrink-0 text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</span>
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- attachment file is streamed through the API proxy */
        <img
          src={objectUrl}
          alt={attachment.fileName}
          draggable={false}
          className="pointer-events-none max-h-48 rounded-md object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
}

export default function ChannelDetailPage() {
  const params = useParams();
  const workspaceId =
    typeof params.workspaceId === "string" ? params.workspaceId : "";
  const channelId =
    typeof params.channelId === "string" ? params.channelId : "";
  const { isLoading: authLoading, isAuthenticated, user, accessToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const handledQueryMessageIdRef = useRef<string | null>(null);
  const [channel, setChannel] = useState<ChannelState>({ kind: "idle" });
  const [messages, setMessages] = useState<MessagesState>({ kind: "idle" });
  const [members, setMembers] = useState<MembersState>({ kind: "idle" });
  const [contextMode, setContextMode] = useState<
    | { kind: "idle" }
    | { kind: "active"; messages: Message[]; targetId: string }
  >({ kind: "idle" });
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
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const markReadInFlightRef = useRef<Promise<unknown> | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const didInitialScroll = useRef(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [messageMenuPosition, setMessageMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [reactionPickerPosition, setReactionPickerPosition] = useState<{ top: number; left: number } | null>(null);
  const [forwardModalMessage, setForwardModalMessage] = useState<Message | null>(null);
  const [forwardTargets, setForwardTargets] = useState<DirectConversation[] | null>(null);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [lightbox, setLightbox] = useState<{
    messageId: string;
    attachments: Attachment[];
    index: number;
  } | null>(null);
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const composerAttachmentsRef = useRef<ComposerAttachment[]>([]);
  useEffect(() => {
    composerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);
  const quickEmojis = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

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
      filePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [filePreviews]);

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

  function getMenuPosition(rect: DOMRect): { top: number; left: number } {
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

  function openReactionPickerAt(messageId: string, position: { top: number; left: number }) {
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

  useEffect(() => {
    if (messages.kind === "success" && !didInitialScroll.current) {
      didInitialScroll.current = true;
      scrollMessagesToBottom("auto");
    }
  }, [messages.kind]);

  const channelIdForFocus = channel.kind === "success" ? channel.data.id : null;

  useEffect(() => {
    if (!channelIdForFocus) return;
    if (editingMessageId) return;
    if (isMembersOpen) return;
    const frame = window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [channelIdForFocus, editingMessageId, isMembersOpen]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId || !channelId || !accessToken) return;

    let cancelled = false;
    async function load(token: string, ws: string, ch: string) {
      setChannel({ kind: "loading" });
      setMessages({ kind: "loading" });
      try {
        const [chData, msgData] = await Promise.all([
          getChannel(token, ws, ch),
          getMessages(token, ws, ch),
        ]);
        if (!cancelled) {
          setChannel({ kind: "success", data: chData });
          setMessages({ kind: "success", data: msgData });
          // mark channel as read after successful load; dedupe in-flight calls
          if (!markReadInFlightRef.current) {
            markReadInFlightRef.current = markChannelRead(token, ws, ch)
              .then(() => {
                window.dispatchEvent(
                  new CustomEvent("channel:read", { detail: { channelId: ch } }),
                );
              })
              .catch(() => {
                // ignore mark-read failures silently
              })
              .finally(() => {
                markReadInFlightRef.current = null;
              });
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : translate(getLocale(), "channel.errorLoadChannelFailed");
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
        getMessageContext(accessToken, workspaceId, channelId, targetMessageId)
          .then((result) => {
            handleLoadContext({ ...result, targetId: targetMessageId });
          })
          .catch(() => {
            // ignore: message may not exist or be inaccessible
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAuthenticated,
    workspaceId,
    channelId,
    accessToken,
    searchParams,
    messages,
    contextMode.kind,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId || !channelId || !accessToken) return;

    let cancelled = false;
    async function loadMembers(token: string, ws: string, ch: string) {
      setMembers({ kind: "loading" });
      try {
        const memData = await getChannelMembers(token, ws, ch);
        if (!cancelled) {
          setMembers({ kind: "success", data: memData });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : translate(getLocale(), "channel.errorLoadMembersFailed");
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

    function handleConnect() {
      setSocketStatus("connected");
    }

    function handleDisconnect() {
      setSocketStatus("disconnected");
    }

    function handleServerConnected() {
      setSocketStatus("connected");
      socket.emit("channel:join", { workspaceId, channelId });
    }

    function handleChannelJoined() {
      setSocketStatus("joined");
    }

    function handleChannelError(data: { message?: string }) {
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
    }

    function handleAuthError() {
      setSocketStatus("error");
      socket.disconnect();
    }

    function handleAuthExpired() {
      setSocketStatus("error");
      socket.disconnect();
    }

    function handleMessageCreated(msg: Message) {
      if (msg.channelId !== channelId) return;
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
    }

    function handleMessageUpdated(msg: Message) {
      if (msg.channelId !== channelId) return;
      updateMessageInState(msg);
    }

    function handleMessageDeleted(payload: { id: string; channelId: string; deletedAt: string }) {
      if (payload.channelId !== channelId) return;
      removeMessageFromState(payload.id);
    }

    function handleTypingStarted(payload: { channelId: string; user: { id: string; username: string } }) {
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
    }

    function handleTypingStopped(payload: { channelId: string; user: { id: string; username: string } }) {
      if (payload.channelId !== channelId) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (next[payload.user.id]?.timeout) {
          window.clearTimeout(next[payload.user.id].timeout);
        }
        delete next[payload.user.id];
        return next;
      });
    }

    function handleReactionAdded(payload: {
      messageId: string;
      channelId: string;
      emoji: string;
      user: { id: string; username: string };
      reactions: Array<{ emoji: string; count: number; reactedByMe?: boolean }>;
    }) {
      if (payload.channelId !== channelId) return;
      updateMessageReactionsFromEvent(payload.messageId, payload.reactions, payload.user.id);
    }

    function handleReactionRemoved(payload: {
      messageId: string;
      channelId: string;
      emoji: string;
      user: { id: string; username: string };
      reactions: Array<{ emoji: string; count: number; reactedByMe?: boolean }>;
    }) {
      if (payload.channelId !== channelId) return;
      updateMessageReactionsFromEvent(payload.messageId, payload.reactions, payload.user.id);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connected", handleServerConnected);
    socket.on("channel:joined", handleChannelJoined);
    socket.on("channel:error", handleChannelError);
    socket.on("auth:error", handleAuthError);
    socket.on("auth:expired", handleAuthExpired);
    socket.on("message:created", handleMessageCreated);
    socket.on("message:updated", handleMessageUpdated);
    socket.on("message:deleted", handleMessageDeleted);
    socket.on("typing:started", handleTypingStarted);
    socket.on("typing:stopped", handleTypingStopped);
    socket.on("reaction:added", handleReactionAdded);
    socket.on("reaction:removed", handleReactionRemoved);

    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      Object.values(typingUsers).forEach((u) => {
        if (u.timeout) window.clearTimeout(u.timeout);
      });
      setTypingUsers({});
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connected", handleServerConnected);
      socket.off("channel:joined", handleChannelJoined);
      socket.off("channel:error", handleChannelError);
      socket.off("auth:error", handleAuthError);
      socket.off("auth:expired", handleAuthExpired);
      socket.off("message:created", handleMessageCreated);
      socket.off("message:updated", handleMessageUpdated);
      socket.off("message:deleted", handleMessageDeleted);
      socket.off("typing:started", handleTypingStarted);
      socket.off("typing:stopped", handleTypingStopped);
      socket.off("reaction:added", handleReactionAdded);
      socket.off("reaction:removed", handleReactionRemoved);
      socket.emit("channel:leave", { channelId });
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, workspaceId, channelId, accessToken]);

  useEffect(() => {
    function handleDocumentClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-testid^="channel-message-menu-"]') ||
        target.closest('[data-testid^="channel-message-menu-trigger-"]') ||
        target.closest('[data-testid^="channel-reaction-picker-"]')
      ) {
        return;
      }
      closeMenuAndPicker();
    }
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeMenuAndPicker();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    function preventDefault(e: DragEvent) {
      e.preventDefault();
    }
    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);
    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, []);

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

  function updateMessageReactions(messageId: string, reactions: ReactionSummary[]) {
    setMessages((prev) => {
      if (prev.kind !== "success") return prev;
      return {
        kind: "success",
        data: prev.data.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
      };
    });
  }

  function mergeReactionSummaryForViewer(
    previous: ReactionSummary[],
    incoming: Array<{ emoji: string; count: number; reactedByMe?: boolean }>,
    eventUserId: string,
    currentUserId: string | undefined,
  ): ReactionSummary[] {
    const incomingMap = new Map(incoming.map((r) => [r.emoji, r]));
    const previousMap = new Map(previous.map((r) => [r.emoji, r]));

    const result: ReactionSummary[] = [];
    for (const [emoji, reaction] of incomingMap) {
      let reactedByMe = reaction.reactedByMe ?? false;
      if (eventUserId !== currentUserId) {
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
        result.push({ emoji, count: 1, reactedByMe: true });
      } else {
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

  async function handleReactionClick(msg: Message, emoji: string) {
    if (!accessToken || !workspaceId || !channelId) return;
    const existing = msg.reactions.find((r) => r.emoji === emoji);
    try {
      if (existing?.reactedByMe) {
        const reactions = await removeMessageReaction(accessToken, workspaceId, channelId, msg.id, emoji);
        updateMessageReactions(msg.id, reactions);
      } else {
        const reactions = await addMessageReaction(accessToken, workspaceId, channelId, msg.id, emoji);
        updateMessageReactions(msg.id, reactions);
      }
    } catch {
      // non-blocking
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
      setEditState({ kind: "error", message: t("channel.errorMessageEmpty") });
      return;
    }
    if (trimmed.length > 4000) {
      setEditState({ kind: "error", message: t("channel.errorMessageTooLong") });
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
      const message = err instanceof Error ? err.message : t("channel.errorUpdateMessageFailed");
      setEditState({ kind: "error", message });
    }
  }

  async function handleDelete(messageId: string) {
    if (!window.confirm(t("channel.confirmDeleteMessage"))) return;
    if (!accessToken || !workspaceId || !channelId) return;
    try {
      await deleteMessage(accessToken, workspaceId, channelId, messageId);
      removeMessageFromState(messageId);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("channel.errorDeleteMessageFailed");
      alert(message);
    }
  }

  async function handleForward(message: Message) {
    closeMenuAndPicker();
    if (!accessToken) return;
    setForwardModalMessage(message);
    setForwarding(true);
    setForwardError(null);
    try {
      const list = await listDirectConversations(accessToken);
      setForwardTargets(list.filter((c) => c.otherParticipant?.id !== user?.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("channel.errorForwardFailed");
      setForwardError(msg);
    } finally {
      setForwarding(false);
    }
  }

  async function handleForwardSend(targetConversationId: string) {
    if (!accessToken || !forwardModalMessage) return;
    setForwarding(true);
    setForwardError(null);
    try {
      await sendDirectMessage(accessToken, targetConversationId, { content: `↪ ${forwardModalMessage.content}` });
      setForwardModalMessage(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("channel.errorForwardFailed");
      setForwardError(message);
    } finally {
      setForwarding(false);
    }
  }

  async function uploadOneAttachment(id: string): Promise<boolean> {
    if (!accessToken || !workspaceId || !channelId) return false;
    const att = composerAttachmentsRef.current.find((a) => a.id === id);
    if (!att || att.status === "uploaded") return true;

    const setUploading = (prev: ComposerAttachment[]) =>
      prev.map((a): ComposerAttachment => (a.id === id ? { ...a, status: "uploading", progress: 0, error: null } : a));
    setComposerAttachments(setUploading);
    composerAttachmentsRef.current = setUploading(composerAttachmentsRef.current);

    try {
      const uploadResult = await uploadAttachmentViaProxyWithProgress(
        accessToken,
        workspaceId,
        channelId,
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
                  storageKey: uploadResult.storageKey,
                  fileName: uploadResult.fileName,
                  mimeType: uploadResult.mimeType,
                  sizeBytes: uploadResult.sizeBytes,
                  kind: uploadResult.kind,
                },
              }
            : a,
        );
      setComposerAttachments(setUploaded);
      composerAttachmentsRef.current = setUploaded(composerAttachmentsRef.current);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : t("channel.errorAttachmentUploadFailed");
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

  async function submitMessage() {
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
    if (!accessToken || !workspaceId || !channelId) return;

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

      const attachmentInputs = current
        .map((a) => a.result)
        .filter((r): r is CreateMessageAttachmentInput => !!r);

      const input: CreateMessageInput = {
        ...(hasContent ? { content: trimmed } : {}),
        ...(replyTargetId ? { parentId: replyTargetId } : {}),
        ...(attachmentInputs.length > 0 ? { attachments: attachmentInputs } : {}),
      };
      const msg = await createMessage(accessToken, workspaceId, channelId, input);
      setContent("");
      setComposerAttachments([]);
      setReplyTargetId(null);
      setSendState({ kind: "idle" });
      appendMessage(msg);
      requestAnimationFrame(() => {
        scrollMessagesToBottom("smooth");
        composerTextareaRef.current?.focus();
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("channel.errorSendMessageFailed");
      setSendState({ kind: "error", message });
      requestAnimationFrame(() => composerTextareaRef.current?.focus());
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

  const isUploadingAttachments = composerAttachments.some((a) => a.status === "uploading");
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

  const filteredMembers =
    members.kind === "success"
      ? members.data.filter((m) => {
          const q = memberSearch.trim().toLowerCase();
          if (!q) return true;
          return [
            m.user.displayName,
            m.user.username,
          ]
            .filter(Boolean)
            .some((value) => (value as string).toLowerCase().includes(q));
        })
      : [];

  const isContextMode = contextMode.kind === "active";
  const displayMessages = isContextMode
    ? contextMode.messages
    : messages.kind === "success"
      ? messages.data
      : [];

  const replyTarget = displayMessages.find((m) => m.id === replyTargetId);

  function getMessageAuthorName(msg: Message) {
    return msg.author.displayName || msg.author.username || t("messageAuthor.unknownUser");
  }

  function getMessageSnippet(msg: Message) {
    const singleLine = msg.content.replace(/\s+/g, " ").trim();
    if (singleLine.length <= 120) return singleLine;
    return `${singleLine.slice(0, 117)}...`;
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

  function handleLoadContext(result: MessageContextResult & { targetId: string }) {
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
  }

  function socketStatusLabel(status: typeof socketStatus) {
    switch (status) {
      case "connecting":
        return t("channel.socketConnecting");
      case "connected":
        return t("channel.socketConnected");
      case "joined":
        return t("channel.socketJoined");
      case "error":
        return t("channel.socketError");
      case "disconnected":
      default:
        return t("channel.socketDisconnected");
    }
  }

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

  async function handleDownloadAttachment(msg: Message, att: Attachment) {
    if (!accessToken || !workspaceId || !channelId) return;
    try {
      const blob = await fetchAttachmentFile(accessToken, workspaceId, channelId, msg.id, att.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("channel.errorDownloadFailed");
      alert(message);
    }
  }

  async function handleArchive() {
    if (!channelId || !accessToken || !workspaceId) return;
    const name = channel.kind === "success" ? channel.data.name : t("channel.fallbackThisChannel");
    if (!window.confirm(`${t("channel.confirmArchiveChannelPrefix")} "${name}"?\n${t("channel.confirmArchiveChannelBody")}`)) {
      return;
    }
    setArchiveState({ kind: "loading" });
    try {
      await archiveChannel(accessToken, workspaceId, channelId);
      setArchiveState({ kind: "idle" });
      window.dispatchEvent(new Event("channels:changed"));
      router.push(`/workspaces/${workspaceId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("channel.errorArchiveChannelFailed");
      setArchiveState({ kind: "error", message });
    }
  }

  async function handleLeave() {
    if (!channelId || !accessToken || !workspaceId) return;
    const name = channel.kind === "success" ? channel.data.name : t("channel.fallbackThisChannel");
    if (!window.confirm(`${t("channel.confirmLeaveChannelPrefix")} "${name}"?`)) {
      return;
    }
    setLeaveState({ kind: "loading" });
    try {
      await leaveChannel(accessToken, workspaceId, channelId);
      setLeaveState({ kind: "idle" });
      window.dispatchEvent(new Event("channels:changed"));
      router.push(`/workspaces/${workspaceId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("channel.errorLeaveChannelFailed");
      setLeaveState({ kind: "error", message });
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = addMemberIdentifier.trim();
    if (!trimmed) {
      setAddMemberState({ kind: "error", message: t("channel.errorUsernameOrEmailRequired") });
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
      const message = err instanceof Error ? err.message : t("channel.errorSendInvitationFailed");
      setAddMemberState({ kind: "error", message });
    }
  }

  async function handleRemoveMember(memberId: string, username: string) {
    if (!window.confirm(`${t("channel.confirmRemoveMemberPrefix")} "${username}" ${t("channel.confirmRemoveMemberSuffix")}`)) return;
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
      const message = err instanceof Error ? err.message : t("channel.errorRemoveMemberFailed");
      setRemoveMemberState({ kind: "error", message });
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
        <Card className="max-w-sm text-center">
          <CardHeader>
            <CardTitle>{t("auth.authRequired")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t("auth.pleaseSignInChannel")}
            </p>
            <Button asChild className="mt-4">
              <Link href="/login">{t("auth.signIn")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-w-0 w-full max-w-none flex-col gap-4 overflow-hidden p-4 sm:p-6">
      <main className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link href={`/workspaces/${workspaceId}`}>
          <ArrowLeft size={16} className="mr-1" />
          {t("channel.backToWorkspace")}
        </Link>
      </Button>

      {channel.kind === "loading" && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          {t("channel.loading")}
        </div>
      )}

      {channel.kind === "error" && (
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {channel.message}
        </div>
      )}

      {channel.kind === "success" && (
        <>
          <PageHeader
            titleLabel={channel.data.name}
            title={
              <span className="flex items-center gap-3 flex-wrap">
                {channel.data.name}
                <Badge variant={channel.data.type === "PUBLIC" ? "success" : "warning"}>
                  {channel.data.type === "PUBLIC" ? t("channel.publicChannel") : t("channel.privateChannel")}
                </Badge>
                <Badge
                  variant={
                    socketStatus === "joined"
                      ? "info"
                      : socketStatus === "connected"
                        ? "muted"
                        : socketStatus === "connecting"
                          ? "warning"
                          : socketStatus === "error"
                            ? "danger"
                            : "muted"
                  }
                >
                  {socketStatusLabel(socketStatus)}
                </Badge>
              </span>
            }
            subtitle={
              <>
                {channel.data.description || channel.data.slug}
              </>
            }
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsMembersOpen(true)}
                >
                  <Users size={14} className="mr-1.5" />
                  {t("channel.members")}
                </Button>
                {canArchiveChannel && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleArchive}
                    disabled={archiveState.kind === "loading"}
                  >
                    <Archive size={14} className="mr-1.5" />
                    {archiveState.kind === "loading" ? t("channel.archiving") : t("channel.archive")}
                  </Button>
                )}
                {canLeaveChannel && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleLeave}
                    disabled={leaveState.kind === "loading"}
                  >
                    <LogOut size={14} className="mr-1.5" />
                    {leaveState.kind === "loading" ? t("channel.leaving") : t("channel.leaveChannel")}
                  </Button>
                )}
              </>
            }
          />
          {archiveState.kind === "error" && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {archiveState.message}
            </div>
          )}
          {leaveState.kind === "error" && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {leaveState.message}
            </div>
          )}
          {channel.kind === "success" && accessToken && (
            <div className="mt-3">
              <ChannelMessageSearch
                workspaceId={workspaceId}
                channelId={channelId}
                accessToken={accessToken}
                onJumpToMessage={scrollToMessage}
                onLoadContext={handleLoadContext}
              />
            </div>
          )}
        </>
      )}

      <div
        data-testid="channel-chat-panel"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative mt-4 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
      >
        {contextMode.kind === "active" && (
          <div className="shrink-0 border-b border-border/50 bg-muted/60 px-4 py-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={exitContextMode}
              data-testid="back-to-latest-button"
            >
              <ArrowLeft size={14} className="mr-1.5" />
              {t("channel.backToLatestMessages")}
            </Button>
          </div>
        )}
        <div className="shrink-0 px-4 pt-3 pb-1">
          {Object.keys(typingUsers).length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex gap-0.5">
                <span className="h-1 w-1 rounded-full bg-primary animate-bounce" />
                <span className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:0.1s]" />
                <span className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
              </span>
              <span>
                {Object.values(typingUsers).map((u, i, arr) => (
                  <span key={u.username}>
                    {u.username}
                    {i < arr.length - 1 ? ", " : " "}
                  </span>
                ))}
                {Object.keys(typingUsers).length === 1 ? t("channel.isTyping") : t("channel.areTyping")}
              </span>
            </div>
          )}
        </div>

        <div ref={messagesScrollRef} onScroll={() => { closeMenuAndPicker(); }} className="chat-canvas min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex w-full max-w-3xl flex-col">
            {messages.kind === "loading" && !isContextMode && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                {t("channel.loadingMessages")}
              </div>
            )}

            {messages.kind === "error" && !isContextMode && (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {messages.message}
              </div>
            )}

            {messages.kind === "success" && messages.data.length === 0 && !isContextMode && (
              <div className="mt-4">
                <EmptyState
                  icon={MessageSquare}
                  title={t("channel.noMessages")}
                />
              </div>
            )}

            {displayMessages.length > 0 && (
              <ul className="mt-4 space-y-3">
                {displayMessages.map((msg) => {
                  const isOwnMessage = user?.id === msg.author.id;
                  return (
                    <li
                      key={msg.id}
                      id={`message-${msg.id}`}
                      data-testid={`message-row-${msg.id}`}
                      className={`flex items-start gap-3 rounded-xl transition-colors ${
                        highlightedMessageId === msg.id
                          ? "bg-yellow-100/70 dark:bg-yellow-900/30 ring-2 ring-yellow-300/80 dark:ring-yellow-700/70"
                          : ""
                      }`}
                    >
                      <div
                        data-testid={`message-avatar-${msg.id}`}
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
                        data-testid={`message-body-${msg.id}`}
                        className="min-w-0 max-w-[92%] sm:max-w-[80%]"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
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
                          {editingMessageId !== msg.id && (
                            <Button
                              variant="icon"
                              size="sm"
                              onClick={(e) => openMenuForElement(msg.id, e.currentTarget)}
                              data-testid={`channel-message-menu-trigger-${msg.id}`}
                              className="ml-auto h-6 w-6"
                              aria-label={t("channel.messageMenu")}
                              aria-haspopup="menu"
                              aria-expanded={messageMenuId === msg.id}
                            >
                              <MoreHorizontal size={14} />
                            </Button>
                          )}
                        </div>
                        <div data-testid={`message-bubble-wrap-${msg.id}`}>
                          <div
                            data-testid={`message-bubble-${msg.id}`}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              openMenuForElement(msg.id, e.currentTarget);
                            }}
                            className={`mt-1 w-fit max-w-full rounded-2xl border px-3 py-2 shadow-sm ${
                              isOwnMessage
                                ? "bg-gradient-to-br from-indigo-600 to-violet-700 border-indigo-500 text-white shadow-indigo-200 dark:from-indigo-600 dark:to-violet-800 dark:border-indigo-700 dark:shadow-indigo-950/30"
                                : "bg-card text-foreground border-border shadow-sm"
                            }`}
                          >
                          {msg.parentId && (
                            <div className="mb-1.5">
                              {(() => {
                                const parent = displayMessages.find((m) => m.id === msg.parentId);
                                if (parent) {
                                  return (
                                    <button
                                      onClick={() => scrollToMessage(parent.id)}
                                      className="flex w-full flex-col gap-0.5 rounded-lg border-l-4 border-muted-foreground bg-muted/50 px-2.5 py-1.5 text-left hover:bg-accent/50 transition-colors"
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
                                      {t("channel.reply")}
                                    </span>
                                    <span className="text-xs text-muted-foreground/80">
                                      {t("channel.replyOriginalUnavailable")}
                                    </span>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {editingMessageId === msg.id ? (
                            <form onSubmit={handleEditSubmit} className="flex flex-col gap-2">
                              <textarea
                                id="channel-edit-message"
                                name="channel-edit-message"
                                rows={2}
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                disabled={editState.kind === "loading"}
                                aria-label={t("channel.edit")}
                                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  type="submit"
                                  size="sm"
                                  disabled={editState.kind === "loading"}
                                >
                                  {editState.kind === "loading" ? t("channel.savingEdit") : t("channel.save")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={handleEditCancel}
                                  disabled={editState.kind === "loading"}
                                >
                                  {t("channel.cancel")}
                                </Button>
                              </div>
                              {editState.kind === "error" && (
                                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                                  {editState.message}
                                </div>
                              )}
                            </form>
                          ) : (
                            msg.content.trim().length > 0 && (
                              <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${isOwnMessage ? "text-white" : "text-foreground"}`}>
                                {msg.content}
                              </p>
                            )
                          )}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div data-testid={`message-attachments-${msg.id}`} className="mt-2 flex flex-col gap-1.5">
                              {msg.attachments.map((att) =>
                                att.kind === "image" ? (
                                  <AttachmentImagePreview
                                    key={`${att.id}-${accessToken}`}
                                    attachment={att}
                                    messageId={msg.id}
                                    workspaceId={workspaceId}
                                    channelId={channelId}
                                    accessToken={accessToken || ""}
                                    onOpen={() => {
                                      const images = msg.attachments!.filter((a) => a.kind === "image");
                                      const idx = images.findIndex((a) => a.id === att.id);
                                      setLightbox({ messageId: msg.id, attachments: images, index: Math.max(0, idx) });
                                    }}
                                  />
                                ) : (
                                  <AttachmentFileCard
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
                            <div data-testid={`channel-reactions-${msg.id}`} className="mt-1.5 flex flex-wrap gap-1">
                              {msg.reactions.map((reaction) => (
                                <button
                                  key={reaction.emoji}
                                  onClick={() => handleReactionClick(msg, reaction.emoji)}
                                  data-testid={`channel-reaction-chip-${msg.id}-${reaction.emoji}`}
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
                  );
                })}
              </ul>
            )}

            <div ref={messagesEndRef} className="h-1" />
          </div>
        </div>

        {isDragOver && (
          <div
            data-testid="channel-drop-overlay"
            className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm"
          >
            <UploadCloud size={48} className="text-primary" />
            <span className="text-lg font-semibold text-primary">
              {t("channel.dropFilesHere")}
            </span>
          </div>
        )}

        {channel.kind === "success" && (
          <form
            onSubmit={handleSendMessage}
            className="relative shrink-0 flex flex-col gap-2 border-t border-indigo-300/60 bg-gradient-to-b from-card to-indigo-100/60 dark:from-card dark:to-indigo-950/30 p-4 shadow-lg"
          >
            {replyTargetId && (
              <div className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {replyTarget
                      ? `${t("channel.replyingTo")} ${getMessageAuthorName(replyTarget)}`
                      : t("channel.reply")}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground truncate">
                    {replyTarget ? getMessageSnippet(replyTarget) : t("channel.replyOriginalUnavailable")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={() => setReplyTargetId(null)}
                  className="h-6 w-6"
                  aria-label={t("channel.cancelReply")}
                >
                  <X size={14} />
                </Button>
              </div>
            )}
            <textarea
              id="channel-message-input"
              name="channel-message-input"
              ref={composerTextareaRef}
              rows={2}
              placeholder={t("channel.messagePlaceholder")}
              aria-label={t("channel.messagePlaceholder")}
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
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
            />
            {composerAttachments.length > 0 && (
              <div data-testid="composer-attachments" className="flex flex-wrap gap-2">
                {composerAttachments.map((att, index) => {
                  const previewUrl = filePreviews.get(att.id);
                  const isUploading = att.status === "uploading";
                  const isFailed = att.status === "failed";
                  const isUploaded = att.status === "uploaded";
                  const canRemove = att.status === "ready" || att.status === "failed";

                  return previewUrl ? (
                    <div
                      key={att.id}
                      data-testid={`composer-attachment-preview-${index}`}
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
                            data-testid={`composer-attachment-remove-${index}`}
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
                          data-testid={`composer-attachment-status-${index}`}
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
                              data-testid={`composer-attachment-progress-${index}`}
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
                          data-testid={`composer-attachment-retry-${index}`}
                          className="h-auto px-0.5 py-0 text-xs"
                        >
                          {t("channel.retryUpload")}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div
                      key={att.id}
                      data-testid={`composer-attachment-chip-${index}`}
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
                            data-testid={`composer-attachment-remove-${index}`}
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
                          data-testid={`composer-attachment-status-${index}`}
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
                              data-testid={`composer-attachment-progress-${index}`}
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
                          data-testid={`composer-attachment-retry-${index}`}
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendState.kind === "loading" || isUploadingAttachments}
                  data-testid="composer-attach-button"
                  aria-label={t("channel.attachFile")}
                >
                  <Paperclip size={16} />
                </Button>
                <input
                  id="file-input"
                  name="file-input"
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,application/rtf,text/rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/csv,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.oasis.opendocument.text,application/vnd.oasis.opendocument.spreadsheet,application/vnd.oasis.opendocument.presentation,application/zip,application/x-7z-compressed,application/vnd.rar,application/x-rar-compressed,video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,audio/mpeg,audio/wav,audio/ogg,audio/mp4,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.odt,.ods,.odp,.zip,.7z,.rar,.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.rtf,.mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.ogg,.m4a"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="composer-file-input"
                  aria-label={t("channel.attachFile")}
                />
                <span className="text-xs text-muted-foreground">
                  {content.length}/4000
                </span>
              </div>
              <Button
                type="submit"
                disabled={sendState.kind === "loading" || isUploadingAttachments}
              >
                {sendState.kind === "loading" || isUploadingAttachments ? (
                  <><Loader2 size={16} className="mr-1.5 animate-spin" />{t("channel.sending")}</>
                ) : (
                  <><Send size={16} className="mr-1.5" />{t("channel.send")}</>
                )}
              </Button>
            </div>
            {attachmentError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive">
                {attachmentError}
              </div>
            )}
            {sendState.kind === "error" && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive">
                {sendState.message}
              </div>
            )}
          </form>
        )}
      </div>
      </main>

      {messageMenuId && messageMenuPosition && (
        <div
          data-testid={`channel-message-menu-${messageMenuId}`}
          style={{ top: messageMenuPosition.top, left: messageMenuPosition.left }}
          className="fixed z-50 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg"
          role="menu"
        >
          {(() => {
            const activeMenuMessage = displayMessages.find((m) => m.id === messageMenuId) ?? null;
            if (!activeMenuMessage) return null;
            const isOwn = activeMenuMessage.author.id === user?.id;
            return (
              <>
                {isOwn && isEditable(activeMenuMessage) && (
                  <button
                    onClick={() => {
                      closeMenuAndPicker();
                      handleEditStart(activeMenuMessage);
                    }}
                    data-testid={`channel-edit-action-${activeMenuMessage.id}`}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                    role="menuitem"
                  >
                    <Edit3 size={16} />
                    <span>{t("channel.edit")}</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    closeMenuAndPicker();
                    setReplyTargetId(activeMenuMessage.id);
                  }}
                  data-testid={`channel-reply-action-${activeMenuMessage.id}`}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  role="menuitem"
                >
                  <Reply size={16} />
                  <span>{t("channel.reply")}</span>
                </button>
                <button
                  onClick={() => {
                    if (messageMenuPosition) {
                      openReactionPickerAt(activeMenuMessage.id, messageMenuPosition);
                    }
                  }}
                  data-testid={`channel-react-action-${activeMenuMessage.id}`}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  role="menuitem"
                >
                  <Smile size={16} />
                  <span>{t("channel.react")}</span>
                </button>
                <button
                  onClick={() => handleForward(activeMenuMessage)}
                  data-testid={`channel-forward-action-${activeMenuMessage.id}`}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  role="menuitem"
                >
                  <Forward size={16} />
                  <span>{t("channel.forward")}</span>
                </button>
                <button
                  onClick={() => handleCopyText(activeMenuMessage.content)}
                  data-testid={`channel-copy-text-action-${activeMenuMessage.id}`}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  role="menuitem"
                >
                  <Copy size={16} />
                  <span>{t("channel.copyText")}</span>
                </button>
                {isOwn && (
                  <button
                    onClick={() => {
                      closeMenuAndPicker();
                      handleDelete(activeMenuMessage.id);
                    }}
                    data-testid={`channel-delete-action-${activeMenuMessage.id}`}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                    role="menuitem"
                  >
                    <Trash2 size={16} />
                    <span>{t("channel.delete")}</span>
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {reactionPickerMessageId && reactionPickerPosition && (
        <div
          data-testid={`channel-reaction-picker-${reactionPickerMessageId}`}
          style={{ top: reactionPickerPosition.top, left: reactionPickerPosition.left }}
          className="fixed z-50 flex flex-wrap gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-sm"
        >
          {quickEmojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                const msg = displayMessages.find((m) => m.id === reactionPickerMessageId);
                if (msg) {
                  handleReactionClick(msg, emoji);
                }
                closeMenuAndPicker();
              }}
              data-testid={`channel-reaction-option-${reactionPickerMessageId}-${emoji}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm hover:bg-accent transition-colors"
              aria-label={`${t("channel.react")} ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {forwardModalMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setForwardModalMessage(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-card-foreground">{t("channel.forwardTo")}</h3>
              <Button
                variant="icon"
                size="sm"
                onClick={() => setForwardModalMessage(null)}
                aria-label={t("channel.cancel")}
              >
                <X size={16} />
              </Button>
            </div>
            {forwardTargets === null || forwardTargets.length === 0 ? (
              <p className="text-sm text-muted-foreground">{forwardError || t("channel.noConversations")}</p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1">
                {forwardTargets.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleForwardSend(conv.id)}
                    disabled={forwarding}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-card-foreground hover:bg-accent disabled:opacity-50"
                  >
                    <Avatar
                      src={conv.otherParticipant?.avatarUrl}
                      name={conv.otherParticipant?.displayName || conv.otherParticipant?.username || "?"}
                      size="sm"
                      alt=""
                    />
                    <span className="truncate">{conv.otherParticipant?.displayName || conv.otherParticipant?.username || t("messageAuthor.unknownUser")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {lightbox && (
        <ImageLightbox
          attachments={lightbox.attachments}
          currentIndex={lightbox.index}
          messageId={lightbox.messageId}
          workspaceId={workspaceId}
          channelId={channelId}
          accessToken={accessToken || ""}
          onClose={() => setLightbox(null)}
          onDownload={(att) => {
            if (!lightbox) return;
            const msg = messages.kind === "success" ? messages.data.find((m) => m.id === lightbox.messageId) : undefined;
            if (msg) handleDownloadAttachment(msg, att);
          }}
        />
      )}

    {isMembersOpen && (
      <div className="fixed inset-0 z-40">
        <div className="absolute inset-0 bg-black/20" onClick={() => setIsMembersOpen(false)} />
        <aside className="absolute right-0 top-0 h-full w-full max-w-sm bg-card border-l border-border shadow-xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
            <h2 className="text-sm font-semibold text-card-foreground">{t("channel.members")}</h2>
            <Button
              variant="icon"
              size="sm"
              onClick={() => setIsMembersOpen(false)}
              aria-label={t("channel.cancel")}
            >
              <X size={18} />
            </Button>
          </div>

          <div className="px-5 pt-4 shrink-0">
            <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              <p>{t("channel.membersPanelInfo")}</p>
              <Link
                href={`/workspaces/${workspaceId}`}
                className="mt-1 inline-block font-medium text-foreground hover:underline"
              >
                {t("channel.manageWorkspaceRoles")} →
              </Link>
            </div>
          </div>

          <div className="px-5 pt-4 shrink-0">
            <Input
              id="channel-search-input"
              name="channel-search-input"
              type="text"
              placeholder={t("channel.searchMembers")}
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              aria-label={t("channel.searchMembers")}
            />
          </div>

          {canManageMembers && (
            <form onSubmit={handleAddMember} className="px-5 pt-3 flex flex-col gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Input
                  id="channel-invite-username"
                  name="channel-invite-username"
                  type="text"
                  placeholder={t("channel.invitePlaceholder")}
                  value={addMemberIdentifier}
                  onChange={(e) => {
                    setAddMemberIdentifier(e.target.value);
                    if (addMemberState.kind === "error") {
                      setAddMemberState({ kind: "idle" });
                    }
                  }}
                  disabled={addMemberState.kind === "loading"}
                  aria-label={t("channel.invitePlaceholder")}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={addMemberState.kind === "loading"}
                >
                  {addMemberState.kind === "loading" ? t("channel.adding") : t("channel.add")}
                </Button>
              </div>
              {myChannelRole === "OWNER" && (
                <select
                  id="channel-invite-role"
                  name="channel-invite-role"
                  value={addMemberRole}
                  onChange={(e) => setAddMemberRole(e.target.value as "MEMBER" | "ADMIN")}
                  disabled={addMemberState.kind === "loading"}
                  aria-label={t("workspace.inviteRole")}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                >
                  <option value="MEMBER">{t("channel.member")}</option>
                  <option value="ADMIN">{t("channel.admin")}</option>
                </select>
              )}
              {addMemberState.kind === "error" && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive">
                  {addMemberState.message}
                </div>
              )}
              {addMemberState.kind === "success" && (
                <div className="rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-sm text-primary">
                  <div className="flex items-center gap-2 font-medium">
                    <Check size={16} />
                    {t("channel.invitationSent")}
                  </div>
                  <p className="mt-1 text-primary/90">
                    {t("channel.inviteAcceptanceNote")}
                  </p>
                </div>
              )}
              {addMemberState.kind === "idle" && (
                <p className="text-xs text-muted-foreground">
                  {t("channel.inviteAcceptanceNote")}
                </p>
              )}
            </form>
          )}

          {channel.kind === "success" && (
            <div className="px-5 pt-2 shrink-0">
              <p className="text-xs text-muted-foreground">
                {channel.data.type === "PUBLIC"
                  ? t("channel.publicChannelNote")
                  : t("channel.privateChannelNote")}
              </p>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
            {members.kind === "loading" && (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                {t("channel.loadingMembers")}
              </div>
            )}

            {members.kind === "error" && (
              <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {members.message}
              </div>
            )}

            {members.kind === "success" && filteredMembers.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("channel.noMembers")}
              </p>
            )}

            {members.kind === "success" && filteredMembers.length > 0 && (
              <ul className="mt-3 divide-y divide-border">
                {filteredMembers.map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <MessageAuthor author={m.user} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          m.role === "OWNER"
                            ? "warning"
                            : m.role === "ADMIN"
                              ? "info"
                              : "muted"
                        }
                        className="text-[10px] uppercase tracking-wide"
                      >
                        {m.role === "OWNER" ? t("channel.owner") : m.role === "ADMIN" ? t("channel.admin") : t("channel.member")}
                      </Badge>
                      {canRemoveMember(m.role, m.user.id) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(m.id, m.user.username)}
                          disabled={removeMemberState.kind === "loading" && removeMemberState.memberId === m.id}
                          className="h-auto px-0 py-0 text-[10px] text-destructive hover:bg-transparent hover:text-destructive/80 disabled:opacity-50"
                        >
                          {removeMemberState.kind === "loading" && removeMemberState.memberId === m.id ? t("channel.removing") : t("channel.remove")}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {removeMemberState.kind === "error" && (
            <div className="px-5 pb-4">
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {removeMemberState.message}
              </div>
            </div>
          )}
        </aside>
      </div>
    )}
    </div>
  );
}
