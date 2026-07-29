"use client";

import { Forward } from "lucide-react";
import { useLocale } from "@/lib/locale";
import type { ForwardedFrom } from "@/lib/messages-api";

interface ForwardedIndicatorProps {
  forwardedFrom?: ForwardedFrom;
  className?: string;
}

export function ForwardedIndicator({ forwardedFrom, className }: ForwardedIndicatorProps) {
  const { t } = useLocale();

  if (!forwardedFrom) return null;

  const date = new Date(forwardedFrom.originalCreatedAt).toLocaleString();

  if ("isAnonymous" in forwardedFrom && forwardedFrom.isAnonymous) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] text-muted-foreground ${className ?? ""}`}
        title={`${t("forward.sourceAnonymous")} • ${date}`}
      >
        <Forward size={12} />
        {t("forward.forwardedFromUnknown")}
      </span>
    );
  }

  const full = forwardedFrom as ForwardedFrom & { originalAuthorName?: string };
  const author = full.originalAuthorName || t("messageAuthor.unknownUser");
  const sourceLabelKey = SOURCE_LABEL_KEYS[full.sourceType];

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] text-muted-foreground ${className ?? ""}`}
      title={`${t("forward.forwardedFrom")} ${t(sourceLabelKey)} • ${author} • ${date}`}
      data-testid="forwarded-indicator"
    >
      <Forward size={12} />
      {t("forward.forwardedFrom")} {author} ({t(sourceLabelKey)})
    </span>
  );
}

const SOURCE_LABEL_KEYS: Record<ForwardedFrom["sourceType"], "forward.sourceChannel" | "forward.sourceDirect" | "forward.sourceGroup"> = {
  channel: "forward.sourceChannel",
  direct: "forward.sourceDirect",
  group: "forward.sourceGroup",
};
