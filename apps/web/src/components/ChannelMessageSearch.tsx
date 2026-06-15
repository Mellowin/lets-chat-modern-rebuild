"use client";

import { useState, useCallback } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { searchChannelMessages, getMessageContext, type Message, type SearchChannelMessagesResult, type MessageContextResult } from "@/lib/messages-api";

interface ChannelMessageSearchProps {
  workspaceId: string;
  channelId: string;
  accessToken: string;
  onJumpToMessage: (messageId: string) => boolean;
  onLoadContext?: (result: MessageContextResult & { targetId: string }) => void;
}

function highlightText(text: string, query: string): React.ReactNode[] {
  if (!query.trim()) return [text];
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lowerText.indexOf(lowerQuery, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) {
      parts.push(text.slice(i, idx));
    }
    parts.push(
      <mark
        key={`${idx}-${query}`}
        className="rounded-sm bg-primary/20 px-0.5 text-foreground dark:bg-primary/30"
      >
        {text.slice(idx, idx + query.length)}
      </mark>,
    );
    i = idx + query.length;
  }
  return parts;
}

export default function ChannelMessageSearch({
  workspaceId,
  channelId,
  accessToken,
  onJumpToMessage,
  onLoadContext,
}: ChannelMessageSearchProps) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notLoadedMessageId, setNotLoadedMessageId] = useState<string | null>(null);
  const [contextLoadingId, setContextLoadingId] = useState<string | null>(null);
  const [contextErrorId, setContextErrorId] = useState<string | null>(null);

  const performSearch = useCallback(
    async (q: string, cursor?: string) => {
      if (!q.trim()) {
        setResults([]);
        setNextCursor(null);
        setStatus("idle");
        return;
      }
      if (!cursor) {
        setStatus("loading");
      } else {
        setLoadingMore(true);
      }
      setErrorMessage(null);
      setNotLoadedMessageId(null);
      try {
        const data: SearchChannelMessagesResult = await searchChannelMessages(
          accessToken,
          workspaceId,
          channelId,
          q,
          cursor ? { cursor, limit: 20 } : { limit: 20 },
        );
        if (cursor) {
          setResults((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newItems = data.items.filter((m) => !existingIds.has(m.id));
            return [...prev, ...newItems];
          });
        } else {
          setResults(data.items);
        }
        setNextCursor(data.nextCursor);
        setStatus("success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("channel.searchFailed");
        setErrorMessage(msg);
        setStatus("error");
      } finally {
        setLoadingMore(false);
        if (!cursor) {
          setStatus((s) => (s === "loading" ? "success" : s));
        }
      }
    },
    [accessToken, workspaceId, channelId, t],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotLoadedMessageId(null);
    void performSearch(query);
  }

  function handleLoadMore() {
    if (loadingMore || !nextCursor) return;
    void performSearch(query, nextCursor ?? undefined);
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    setNextCursor(null);
    setStatus("idle");
    setErrorMessage(null);
    setNotLoadedMessageId(null);
  }

  async function handleJump(msg: Message) {
    setNotLoadedMessageId(null);
    setContextLoadingId(null);
    setContextErrorId(null);
    const found = onJumpToMessage(msg.id);
    if (found) return;

    if (onLoadContext) {
      setContextLoadingId(msg.id);
      try {
        const result = await getMessageContext(accessToken, workspaceId, channelId, msg.id);
        onLoadContext({ ...result, targetId: msg.id });
      } catch {
        setContextErrorId(msg.id);
      } finally {
        setContextLoadingId((current) => (current === msg.id ? null : current));
      }
    } else {
      setNotLoadedMessageId(msg.id);
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleString();
  }

  function getSnippet(msg: Message): React.ReactNode {
    const text = msg.content.trim();
    if (text.length > 0) {
      return <span className="line-clamp-2">{highlightText(text, query)}</span>;
    }
    if (msg.attachments && msg.attachments.length > 0) {
      return (
        <span className="italic text-muted-foreground">
          {t("channel.searchAttachmentMessage")}
        </span>
      );
    }
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="w-full">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen((prev) => !prev)}
        data-testid="search-toggle-button"
      >
        <Search size={16} />
        {t("channel.searchMessages")}
      </Button>

      {isOpen && (
        <div className="mt-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                id="channel-search-input"
                name="channel-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("channel.searchInThisChannel")}
                className="pl-9 pr-9"
                data-testid="search-input"
                aria-label={t("channel.searchInThisChannel")}
              />
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t("channel.cancel")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <Button
              type="submit"
              disabled={status === "loading" || !query.trim()}
              data-testid="search-submit"
            >
              {status === "loading" ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t("channel.searching")}
                </>
              ) : (
                t("channel.searchMessages")
              )}
            </Button>
          </form>

          {status === "error" && errorMessage && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                {errorMessage}
              </div>
            </div>
          )}

          {status === "loading" && (
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              {t("channel.searching")}
            </div>
          )}

          {status === "success" && results.length === 0 && query.trim().length > 0 && (
            <div data-testid="search-empty">
              <EmptyState
                icon={Search}
                title={t("channel.noMessagesFound")}
                description={t("channel.searchInThisChannel")}
              />
            </div>
          )}

          {results.length > 0 && (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {results.map((msg) => (
                <li
                  key={msg.id}
                  className="rounded-lg border border-border bg-background p-3 transition-colors hover:bg-accent/50"
                >
                  <button
                    onClick={() => handleJump(msg)}
                    className="w-full text-left focus-visible:outline-none"
                    data-testid={`search-result-${msg.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {msg.author.displayName || msg.author.username}
                        </span>
                        {msg.editedAt && (
                          <Badge variant="muted">{t("channel.edited")}</Badge>
                        )}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <Badge variant="muted">📎 {msg.attachments.length}</Badge>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(msg.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{getSnippet(msg)}</p>
                  </button>
                  {contextLoadingId === msg.id && (
                    <p
                      className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
                      data-testid={`search-context-loading-${msg.id}`}
                    >
                      <Loader2 size={12} className="animate-spin" />
                      {t("channel.loadingContext")}
                    </p>
                  )}
                  {contextErrorId === msg.id && (
                    <p
                      className="mt-2 text-xs text-destructive"
                      data-testid={`search-context-error-${msg.id}`}
                    >
                      {t("channel.contextLoadFailed")}
                    </p>
                  )}
                  {notLoadedMessageId === msg.id && (
                    <p
                      className="mt-2 text-xs text-amber-600 dark:text-amber-400"
                      data-testid={`search-not-loaded-${msg.id}`}
                    >
                      {t("channel.searchMessageNotLoaded")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {nextCursor && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="mt-3 w-full"
              data-testid="search-load-more"
            >
              {loadingMore ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t("channel.searching")}
                </>
              ) : (
                t("channel.loadMoreResults")
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
