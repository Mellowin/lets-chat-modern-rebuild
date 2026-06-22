"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { getAttachmentFileObjectUrl, type Attachment } from "@/lib/messages-api";
import { useLocale } from "@/lib/locale";
import { Button } from "@/components/ui/Button";

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

  const current = attachments[index];
  const total = attachments.length;
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  const loadUrl = useCallback(
    async (att: Attachment) => {
      if (urls[att.id] || loading[att.id] || errors[att.id]) return;
      setLoading((prev) => ({ ...prev, [att.id]: true }));
      try {
        const url = await getAttachmentFileObjectUrl(
          accessToken,
          workspaceId,
          channelId,
          messageId,
          att.id,
        );
        setUrls((prev) => {
          const prevUrl = prev[att.id];
          if (prevUrl) URL.revokeObjectURL(prevUrl);
          return { ...prev, [att.id]: url };
        });
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
    return () => {
      setUrls((prev) => {
        Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
        return prev;
      });
    };
  }, []);

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
      role="dialog"
      aria-modal="true"
      aria-label={t("channel.lightboxTitle")}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="image-lightbox"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate text-sm font-medium text-white/90">
            {current?.fileName}
          </span>
          {total > 1 && (
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
              {index + 1} / {total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="icon"
            onClick={() => onDownload(current)}
            aria-label={t("channel.lightboxDownload")}
            data-testid="lightbox-download"
            className="text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Download size={18} />
          </Button>
          <Button
            type="button"
            variant="icon"
            onClick={onClose}
            aria-label={t("channel.lightboxClose")}
            data-testid="lightbox-close"
            className="text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </Button>
        </div>
      </div>

      {/* Image area */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
        {total > 1 && (
          <Button
            type="button"
            variant="icon"
            onClick={() => setIndex((i) => i - 1)}
            disabled={!hasPrev}
            className="absolute left-2 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"
            aria-label={t("channel.lightboxPrevious")}
            data-testid="lightbox-prev"
          >
            <ChevronLeft size={24} />
          </Button>
        )}

        <div className="flex h-full w-full items-center justify-center">
          {currentLoading && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 size={18} className="animate-spin" />
              {t("channel.lightboxLoading")}
            </div>
          )}
          {currentError && (
            <div className="flex flex-col items-center gap-3 text-sm text-white/60">
              <span>{t("channel.lightboxImageFailed")}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onDownload(current)}
              >
                <Download size={14} className="mr-1.5" />
                {t("channel.lightboxDownload")}
              </Button>
            </div>
          )}
          {currentUrl && !currentLoading && !currentError && (
            /* eslint-disable-next-line @next/next/no-img-element -- lightbox intentionally uses native img for dynamic attachment URLs */
            <img
              src={currentUrl}
              alt={current.fileName}
              draggable={false}
              className="pointer-events-none max-h-full max-w-full object-contain rounded-lg shadow-2xl"
              data-testid="lightbox-image"
              onError={() => setErrors((prev) => ({ ...prev, [current.id]: true }))}
            />
          )}
        </div>

        {total > 1 && (
          <Button
            type="button"
            variant="icon"
            onClick={() => setIndex((i) => i + 1)}
            disabled={!hasNext}
            className="absolute right-2 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"
            aria-label={t("channel.lightboxNext")}
            data-testid="lightbox-next"
          >
            <ChevronRight size={24} />
          </Button>
        )}
      </div>

      {/* Bottom indicators */}
      {total > 1 && (
        <div className="flex justify-center gap-1.5 pb-4">
          {attachments.map((att, i) => (
            <button
              key={att.id}
              type="button"
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-4 bg-white/80" : "w-1.5 bg-white/30 hover:bg-white/50"
              }`}
              aria-label={`${t("channel.lightboxTitle")} ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
