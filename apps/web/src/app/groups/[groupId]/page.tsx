"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Presentation,
  Reply,
  Send,
  Settings,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  uploadGroupAttachmentViaProxyWithProgress,
  getGroupAttachmentFileObjectUrl,
  fetchGroupAttachmentFile,
  type GroupSummary,
  type GroupMessage,
  type GroupMessageContextResult,
  type GroupMessageAttachment,
  type CreateGroupMessageInput,
} from "@/lib/groups-api";
import { createSocket } from "@/lib/socket-client";
import { useMessageListScroll } from "@/lib/use-message-list-scroll";
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

type ComposerAttachment = {
  id: string;
  file: File;
  status: "ready" | "uploading" | "uploaded" | "failed";
  progress: number;
  error: string | null;
  result?: GroupMessageAttachment;
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

function GroupAttachmentFileCard({
  attachment,
  message,
  onDownload,
}: {
  attachment: GroupMessageAttachment;
  message: GroupMessage;
  onDownload: (msg: GroupMessage, att: GroupMessageAttachment) => void;
}) {
  const { t } = useLocale();
  const { icon: Icon, labelKey } = getAttachmentTypeInfo(attachment.mimeType);

  return (
    <button
      key={attachment.id}
      onClick={() => onDownload(message, attachment)}
      data-testid={`group-message-attachment-${message.id}-${attachment.id}`}
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

function GroupAttachmentImagePreview({
  attachment,
  messageId,
  groupId,
  accessToken,
}: {
  attachment: GroupMessageAttachment;
  messageId: string;
  groupId: string;
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
        const url = await getGroupAttachmentFileObjectUrl(
          accessToken,
          groupId,
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
  }, [accessToken, groupId, messageId, attachment.id]);

  return (
    <button
      type="button"
      data-testid={`group-message-attachment-image-${messageId}-${attachment.id}`}
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
  const [replyToMessage, setReplyToMessage] = useState<GroupMessage | null>(null);
  const [scrollPaused, setScrollPaused] = useState(false);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const markReadInFlightRef = useRef<Promise<unknown> | null>(null);
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
    if (!accessToken || !groupId) return false;
    const att = composerAttachmentsRef.current.find((a) => a.id === id);
    if (!att || att.status === "uploaded") return true;

    const setUploading = (prev: ComposerAttachment[]) =>
      prev.map((a): ComposerAttachment => (a.id === id ? { ...a, status: "uploading", progress: 0, error: null } : a));
    setComposerAttachments(setUploading);
    composerAttachmentsRef.current = setUploading(composerAttachmentsRef.current);

    try {
      const uploadResult = await uploadGroupAttachmentViaProxyWithProgress(
        accessToken,
        groupId,
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

  async function handleDownloadAttachment(msg: GroupMessage, att: GroupMessageAttachment) {
    if (!accessToken || !groupId) return;
    try {
      const blob = await fetchGroupAttachmentFile(accessToken, groupId, msg.id, att.id);
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
      setSendState({ kind: "error", message });
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
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
    if (!accessToken || !groupId) return;

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

      const input: CreateGroupMessageInput = {
        ...(hasContent ? { content: trimmed } : {}),
        ...(replyToMessage ? { replyToMessageId: replyToMessage.id } : {}),
        ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
      };
      const msg = await sendGroupMessage(accessToken, groupId, input);
      setContent("");
      setComposerAttachments([]);
      composerAttachmentsRef.current = [];
      setReplyToMessage(null);
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

  function getMessageSnippet(msg: GroupMessage) {
    const singleLine = msg.content.replace(/\s+/g, " ").trim();
    if (singleLine.length === 0 && msg.attachments && msg.attachments.length > 0) {
      return t("groups.replyAttachmentIndicator");
    }
    if (singleLine.length <= 120) return singleLine;
    return `${singleLine.slice(0, 117)}...`;
  }

  function renderReplyContent(content: string | null) {
    if (content === null) return null;
    const singleLine = content.replace(/\s+/g, " ").trim();
    if (singleLine.length === 0) return t("groups.replyAttachmentIndicator");
    return singleLine;
  }

  function handleReply(msg: GroupMessage) {
    setReplyToMessage(msg);
    const textarea = document.getElementById("group-message-input") as HTMLTextAreaElement | null;
    textarea?.focus();
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

        <div
          data-testid="group-chat-panel"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="relative mt-4 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-md"
        >
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
                            <button
                              type="button"
                              onClick={() => handleReply(msg)}
                              data-testid={`group-reply-action-${msg.id}`}
                              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                              aria-label={t("groups.reply")}
                            >
                              <Reply size={12} />
                              {t("groups.reply")}
                            </button>
                          </div>
                          {msg.replyTo && (
                            <div className="mb-1.5" data-testid={`group-reply-to-preview-${msg.id}`}>
                              {msg.replyTo.content !== null && msg.replyTo.author !== null ? (
                                <button
                                  type="button"
                                  onClick={() => scrollToMessage(msg.replyTo!.id)}
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
                                    {t("groups.reply")}
                                  </span>
                                  <span className="text-xs text-muted-foreground/80">
                                    {t("groups.originalMessageMissing")}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          <p
                            data-testid={`group-message-content-${msg.id}`}
                            className="whitespace-pre-wrap text-sm text-foreground"
                          >
                            <MessageContent content={msg.content} mentions={msg.mentions} />
                          </p>
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div data-testid={`group-message-attachments-${msg.id}`} className="mt-2 flex flex-col gap-1.5">
                              {msg.attachments.map((att) =>
                                att.kind === "image" ? (
                                  <GroupAttachmentImagePreview
                                    key={`${att.id}-${accessToken}`}
                                    attachment={att}
                                    messageId={msg.id}
                                    groupId={groupId}
                                    accessToken={accessToken || ""}
                                  />
                                ) : (
                                  <GroupAttachmentFileCard
                                    key={att.id}
                                    attachment={att}
                                    message={msg}
                                    onDownload={handleDownloadAttachment}
                                  />
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {isDragOver && (
            <div
              data-testid="group-drop-overlay"
              className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm"
            >
              <UploadCloud size={48} className="text-primary" />
              <span className="text-lg font-semibold text-primary">
                {t("channel.dropFilesHere")}
              </span>
            </div>
          )}

          <div className="shrink-0 border-t border-border/80 bg-card p-3">
            <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
              {replyToMessage && (
                <div data-testid="group-reply-preview" className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {t("groups.replyingTo")} {getMessageAuthorName(replyToMessage)}
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
                    data-testid="group-cancel-reply"
                    className="h-6 w-6"
                    aria-label={t("groups.cancelReply")}
                  >
                    <X size={14} />
                  </Button>
                </div>
              )}
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
              {composerAttachments.length > 0 && (
                <div data-testid="group-composer-attachments" className="flex flex-wrap gap-2">
                  {composerAttachments.map((att, index) => {
                    const previewUrl = filePreviews.get(att.id);
                    const isUploading = att.status === "uploading";
                    const isFailed = att.status === "failed";
                    const isUploaded = att.status === "uploaded";
                    const canRemove = att.status === "ready" || att.status === "failed";

                    return previewUrl ? (
                      <div
                        key={att.id}
                        data-testid={`group-composer-attachment-preview-${index}`}
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
                              data-testid={`group-composer-attachment-remove-${index}`}
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
                            data-testid={`group-composer-attachment-status-${index}`}
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
                                data-testid={`group-composer-attachment-progress-${index}`}
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
                            data-testid={`group-composer-attachment-retry-${index}`}
                            className="h-auto px-0.5 py-0 text-xs"
                          >
                            {t("channel.retryUpload")}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div
                        key={att.id}
                        data-testid={`group-composer-attachment-chip-${index}`}
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
                              data-testid={`group-composer-attachment-remove-${index}`}
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
                            data-testid={`group-composer-attachment-status-${index}`}
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
                                data-testid={`group-composer-attachment-progress-${index}`}
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
                            data-testid={`group-composer-attachment-retry-${index}`}
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
                    data-testid="group-composer-attach-button"
                    aria-label={t("channel.attachFile")}
                  >
                    <Paperclip size={16} />
                  </Button>
                  <input
                    id="group-file-input"
                    name="group-file-input"
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,application/rtf,text/rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/csv,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.oasis.opendocument.text,application/vnd.oasis.opendocument.spreadsheet,application/vnd.oasis.opendocument.presentation,application/zip,application/x-7z-compressed,application/vnd.rar,application/x-rar-compressed,video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,audio/mpeg,audio/wav,audio/ogg,audio/mp4,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.odt,.ods,.odp,.zip,.7z,.rar,.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.rtf,.mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.ogg,.m4a"
                    onChange={handleFileSelect}
                    className="hidden"
                    data-testid="group-composer-file-input"
                    aria-label={t("channel.attachFile")}
                  />
                  <span className="text-xs text-muted-foreground">
                    {content.length}/4000
                  </span>
                </div>
                <Button
                  type="submit"
                  data-testid="group-send-button"
                  disabled={sendState.kind === "loading" || isUploadingAttachments}
                  className="shrink-0 self-end"
                >
                  {sendState.kind === "loading" || isUploadingAttachments ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                </Button>
              </div>
            </form>
            {attachmentError && (
              <p className="mt-2 text-xs text-destructive">{attachmentError}</p>
            )}
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
