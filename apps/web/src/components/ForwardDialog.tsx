"use client";

import { useEffect, useMemo, useState } from "react";
import { Forward, Loader2, Search, X } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import {
  forwardMessage,
  loadForwardTargets,
  type ForwardDestination,
  type ForwardDestinationChannel,
  type ForwardDestinationDirect,
  type ForwardDestinationGroup,
  type ForwardMessageInput,
  type ForwardSourceType,
} from "@/lib/forward-api";

interface ForwardDialogProps {
  accessToken: string;
  sourceType: ForwardSourceType;
  sourceMessageId: string;
  sourceChatId: string;
  onClose: () => void;
  onForwarded?: () => void;
  titleKey?: string;
  "data-testid"?: string;
}

type Scope = "all" | "channel" | "direct" | "group";

export function ForwardDialog({
  accessToken,
  sourceType,
  sourceMessageId,
  sourceChatId,
  onClose,
  onForwarded,
  titleKey,
  "data-testid": dataTestId,
}: ForwardDialogProps) {
  const { t } = useLocale();
  const [targets, setTargets] = useState<{
    channels: ForwardDestinationChannel[];
    directs: ForwardDestinationDirect[];
    groups: ForwardDestinationGroup[];
  } | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [comment, setComment] = useState("");
  const [forwarding, setForwarding] = useState(false);
  const [forwardError, setForwardError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await loadForwardTargets(accessToken);
        if (!cancelled) {
          setTargets(result);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setTargetsError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingTargets(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const filteredTargets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!targets) return [] as ForwardDestination[];

    const all: ForwardDestination[] = [
      ...(scope === "all" || scope === "channel" ? targets.channels : []),
      ...(scope === "all" || scope === "direct" ? targets.directs : []),
      ...(scope === "all" || scope === "group" ? targets.groups : []),
    ].filter((dest) => !(dest.type === sourceType && dest.id === sourceChatId));

    if (!q) return all;

    return all.filter((dest) => {
      if (dest.type === "channel") {
        return (
          dest.name.toLowerCase().includes(q) ||
          dest.workspaceName.toLowerCase().includes(q)
        );
      }
      if (dest.type === "direct") {
        const other = dest.otherParticipant;
        if (!other) return false;
        return (
          (other.displayName ?? "").toLowerCase().includes(q) ||
          other.username.toLowerCase().includes(q)
        );
      }
      return dest.name.toLowerCase().includes(q);
    });
  }, [targets, scope, query, sourceType, sourceChatId]);

  const groupedChannels = useMemo(() => {
    if (scope !== "all" && scope !== "channel") return [];
    const map = new Map<string, { workspaceName: string; channels: ForwardDestinationChannel[] }>();
    filteredTargets.forEach((dest) => {
      if (dest.type !== "channel") return;
      const existing = map.get(dest.workspaceId);
      if (existing) {
        existing.channels.push(dest);
      } else {
        map.set(dest.workspaceId, { workspaceName: dest.workspaceName, channels: [dest] });
      }
    });
    return Array.from(map.values());
  }, [filteredTargets, scope]);

  const directTargets = useMemo(
    () => filteredTargets.filter((d): d is ForwardDestinationDirect => d.type === "direct"),
    [filteredTargets],
  );

  const groupTargets = useMemo(
    () => filteredTargets.filter((d): d is ForwardDestinationGroup => d.type === "group"),
    [filteredTargets],
  );

  async function handleForward(dest: ForwardDestination) {
    setForwarding(true);
    setForwardError(null);
    try {
      const input: ForwardMessageInput = {
        sourceType,
        sourceMessageId,
        destinationType: dest.type,
        destinationId: dest.id,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      };
      await forwardMessage(accessToken, input);
      onForwarded?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setForwardError(message);
    } finally {
      setForwarding(false);
    }
  }

  const title = titleKey ? t(titleKey as never) : t("forward.title");

  return (
    <div
      data-testid={dataTestId ?? "forward-dialog"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-card-foreground">
            <Forward size={16} className="mr-1.5 inline-block" />
            {title}
          </h2>
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={onClose}
            data-testid="direct-cancel-forward"
            className="h-6 w-6"
            aria-label={t("forward.cancel")}
          >
            <X size={14} />
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="forward-comment" className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("forward.comment")}
            </label>
            <textarea
              id="forward-comment"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("forward.commentPlaceholder")}
              disabled={forwarding}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
            />
            <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{comment.length}/4000</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(["all", "channel", "direct", "group"] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                disabled={forwarding}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  scope === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                } disabled:opacity-60`}
              >
                {t(SCOPE_LABEL_KEYS[s])}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="forward-search"
              name="forward-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("forward.search")}
              disabled={forwarding}
              className="pl-8"
            />
          </div>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {loadingTargets && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              {t("forward.loading")}
            </div>
          )}

          {targetsError && !loadingTargets && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
              {targetsError}
            </div>
          )}

          {!loadingTargets && !targetsError && filteredTargets.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("forward.noTargets")}</p>
          )}

          {!loadingTargets && !targetsError && (
            <div className="space-y-4 pr-1">
              {groupedChannels.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("forward.channels")}
                  </h3>
                  <ul className="space-y-3">
                    {groupedChannels.map(({ workspaceName, channels }) => (
                      <li key={workspaceName}>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">{workspaceName}</p>
                        <ul className="space-y-1">
                          {channels.map((channel) => (
                            <li key={channel.id}>
                              <TargetButton
                                label={`# ${channel.name}`}
                                subLabel={channel.channelType === "PUBLIC" ? t("forward.public") : t("forward.private")}
                                onClick={() => handleForward(channel)}
                                disabled={forwarding}
                                testId={`forward-target-channel-${channel.id}`}
                              />
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {directTargets.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("forward.direct")}
                  </h3>
                  <ul className="space-y-1">
                    {directTargets.map((conv) => (
                      <li key={conv.id}>
                        <TargetButton
                          label={conv.otherParticipant?.displayName || conv.otherParticipant?.username || t("messageAuthor.unknownUser")}
                          subLabel={conv.otherParticipant?.displayName ? conv.otherParticipant.username : undefined}
                          avatar={conv.otherParticipant?.avatarUrl}
                          name={conv.otherParticipant?.displayName || conv.otherParticipant?.username}
                          onClick={() => handleForward(conv)}
                          disabled={forwarding}
                          testId={`direct-forward-target-${conv.id}`}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {groupTargets.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("forward.groups")}
                  </h3>
                  <ul className="space-y-1">
                    {groupTargets.map((group) => (
                      <li key={group.id}>
                        <TargetButton
                          label={group.name}
                          onClick={() => handleForward(group)}
                          disabled={forwarding}
                          testId={`forward-target-group-${group.id}`}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {forwardError && (
          <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
            {forwardError}
          </div>
        )}
      </div>
    </div>
  );
}

function TargetButton({
  label,
  subLabel,
  avatar,
  name,
  onClick,
  disabled,
  testId,
}: {
  label: string;
  subLabel?: string;
  avatar?: string | null;
  name?: string;
  onClick: () => void;
  disabled: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-60"
    >
      {avatar !== undefined && (
        <Avatar src={avatar} name={name || label} size="sm" alt="" />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{label}</p>
        {subLabel && <p className="text-[10px] text-muted-foreground">{subLabel}</p>}
      </div>
    </button>
  );
}

const SCOPE_LABEL_KEYS: Record<Scope, "forward.scopeAll" | "forward.scopeChannel" | "forward.scopeDirect" | "forward.scopeGroup"> = {
  all: "forward.scopeAll",
  channel: "forward.scopeChannel",
  direct: "forward.scopeDirect",
  group: "forward.scopeGroup",
};
