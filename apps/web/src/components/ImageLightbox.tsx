"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getAttachmentDownloadUrl, type Attachment } from "@/lib/messages-api";
import { useLocale } from "@/lib/locale";

interface ImageLightboxProps {
  attachments: Attachment[];
  currentIndex: number;
  messageId: string;
  workspaceId: string;
  channelId: string;
  accessToken: string;
  onClose: () => void;
  onDownload: (att: Attachment) => void;
}

export default function ImageLightbox({
  attachments,
  currentIndex: initialIndex,
  messageId,
  workspaceId,
  channelId,
  accessToken,
  onClose,
  onDownload,
}: ImageLightboxProps) {
  const { t } = useLocale();
  const [index, setIndex] = useState(initialIndex);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const current = attachments[index];
  const total = attachments.length;
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  const loadUrl = useCallback(
    async (att: Attachment) => {
      if (urls[att.id] || loading[att.id] || errors[att.id]) return;
      setLoading((prev) => ({ ...prev, [att.id]: true }));
      try {
        const result = await getAttachmentDownloadUrl(
          accessToken,
          workspaceId,
          channelId,
          messageId,
          att.id,
        );
        setUrls((prev) => ({ ...prev, [att.id]: result.downloadUrl }));
      } catch {
        setErrors((prev) => ({ ...prev, [att.id]: true }));
      } finally {
        setLoading((prev) => ({ ...prev, [att.id]: false }));
      }
    },
    [accessToken, workspaceId, channelId, messageId, urls, loading, errors],
  );

  useEffect(() => {
    if (current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadUrl(current);
    }
  }, [current, loadUrl]);

  useEffect(() => {
    if (hasNext) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadUrl(attachments[index + 1]);
    }
  }, [hasNext, index, attachments, loadUrl]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        setIndex((i) => i - 1);
      } else if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        setIndex((i) => i + 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasPrev, hasNext, onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const currentUrl = urls[current?.id];
  const currentLoading = loading[current?.id];
  const currentError = errors[current?.id];

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("channel.lightboxTitle")}
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="image-lightbox"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate text-sm font-medium text-white">
            {current?.fileName}
          </span>
          {total > 1 && (
            <span className="shrink-0 text-xs text-zinc-400">
              {index + 1} / {total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDownload(current)}
            className="inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            aria-label={t("channel.lightboxDownload")}
            data-testid="lightbox-download"
          >
            {t("channel.lightboxDownload")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            aria-label={t("channel.lightboxClose")}
            data-testid="lightbox-close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
        {total > 1 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            disabled={!hasPrev}
            className="absolute left-2 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-800/80 text-white hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800/80 transition-colors"
            aria-label={t("channel.lightboxPrevious")}
            data-testid="lightbox-prev"
          >
            ‹
          </button>
        )}

        <div className="flex h-full w-full items-center justify-center">
          {currentLoading && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
              {t("channel.lightboxLoading")}
            </div>
          )}
          {currentError && (
            <div className="flex flex-col items-center gap-2 text-sm text-zinc-400">
              <span>{t("channel.lightboxImageFailed")}</span>
              <button
                type="button"
                onClick={() => onDownload(current)}
                className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                {t("channel.lightboxDownload")}
              </button>
            </div>
          )}
          {currentUrl && !currentLoading && !currentError && (
            /* eslint-disable-next-line @next/next/no-img-element -- lightbox intentionally uses native img for dynamic presigned URLs */
            <img
              src={currentUrl}
              alt={current.fileName}
              className="max-h-full max-w-full object-contain"
              data-testid="lightbox-image"
            />
          )}
        </div>

        {total > 1 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            disabled={!hasNext}
            className="absolute right-2 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-800/80 text-white hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800/80 transition-colors"
            aria-label={t("channel.lightboxNext")}
            data-testid="lightbox-next"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
