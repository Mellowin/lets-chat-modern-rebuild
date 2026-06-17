"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  searchGlobalMessages,
  type GlobalSearchResponse,
  type GlobalSearchResult,
} from "@/lib/messages-api";

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

export default function GlobalMessageSearch() {
  const { t } = useLocale();
  const router = useRouter();
  const { accessToken, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const performSearch = useCallback(
    async (q: string, cursor?: string) => {
      if (!q.trim() || !accessToken) {
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
      try {
        const data: GlobalSearchResponse = await searchGlobalMessages(
          accessToken,
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
        const msg = err instanceof Error ? err.message : t("globalSearch.error");
        setErrorMessage(msg);
        setStatus("error");
      } finally {
        setLoadingMore(false);
      }
    },
    [accessToken, t],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void performSearch(query);
  }

  function handleLoadMore() {
    if (loadingMore || !nextCursor) return;
    void performSearch(query, nextCursor);
  }

  function handleOpen() {
    setIsOpen(true);
    setQuery("");
    setResults([]);
    setNextCursor(null);
    setStatus("idle");
    setErrorMessage(null);
  }

  function handleClose() {
    setIsOpen(false);
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    setNextCursor(null);
    setStatus("idle");
    setErrorMessage(null);
  }

  function handleResultClick(result: GlobalSearchResult) {
    if (result.source.type === "CHANNEL") {
      router.push(
        `/workspaces/${result.source.workspaceId}/channels/${result.source.channelId}?message=${result.id}`,
      );
    } else {
      router.push(`/direct/${result.source.conversationId}?message=${result.id}`);
    }
    handleClose();
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString();
  }

  function getSourceLabel(result: GlobalSearchResult): string {
    if (result.source.type === "CHANNEL") {
      return `${result.source.workspaceName} / ${result.source.channelName}`;
    }
    const other = result.source.otherParticipant;
    return other?.displayName || other?.username || t("globalSearch.directConversation");
  }

  function getSourceBadge(result: GlobalSearchResult): { label: string; variant: "success" | "warning" | "info" } {
    if (result.source.type === "DIRECT") {
      return { label: t("globalSearch.directLabel"), variant: "info" };
    }
    if (result.source.channelType === "PRIVATE") {
      return { label: t("globalSearch.privateChannelLabel"), variant: "warning" };
    }
    return { label: t("globalSearch.publicChannelLabel"), variant: "success" };
  }

  function getSnippet(result: GlobalSearchResult): React.ReactNode {
    const text = result.content.trim();
    if (text.length > 0) {
      return <span className="line-clamp-2">{highlightText(text, query)}</span>;
    }
    return <span className="text-muted-foreground">—</span>;
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isAuthenticated) {
          setIsOpen((open) => !open);
        }
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthenticated]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        data-testid="global-search-open-button"
        aria-label={t("header.searchAllMessages")}
        className="text-header-foreground hover:bg-white/10 hover:text-header-foreground"
      >
        <Search size={16} />
        <span className="hidden sm:inline">{t("header.searchAllMessages")}</span>
      </Button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-0 pt-12 sm:p-4 sm:pt-24"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
          data-testid="global-search-modal"
        >
          <div className="flex h-[calc(100vh-3rem)] sm:h-auto w-full max-w-2xl flex-col overflow-hidden rounded-none sm:rounded-xl border border-border bg-background shadow-2xl max-h-none sm:max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">{t("globalSearch.title")}</h2>
              <Button
                variant="icon"
                size="md"
                onClick={handleClose}
                aria-label={t("channel.cancel")}
                data-testid="global-search-close-button"
              >
                <X size={16} />
              </Button>
            </div>

            <div className="overflow-y-auto p-4">
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    id="global-search-input"
                    name="global-search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("globalSearch.placeholder")}
                    className="pl-9 pr-9"
                    data-testid="global-search-input"
                    aria-label={t("globalSearch.placeholder")}
                    autoFocus
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
                  data-testid="global-search-submit"
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {t("globalSearch.loading")}
                    </>
                  ) : (
                    t("globalSearch.search")
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
                  {t("globalSearch.loading")}
                </div>
              )}

              {status === "success" && results.length === 0 && query.trim().length > 0 && (
                <div data-testid="global-search-empty">
                  <EmptyState
                    icon={Search}
                    title={t("globalSearch.empty")}
                    description={t("globalSearch.placeholder")}
                  />
                </div>
              )}

              {results.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {results.map((result) => {
                    const badge = getSourceBadge(result);
                    return (
                      <li key={result.id}>
                        <button
                          onClick={() => handleResultClick(result)}
                          className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          data-testid={`global-search-result-${result.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {result.author.displayName || result.author.username}
                              </span>
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatDate(result.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{getSourceLabel(result)}</p>
                          <p className="mt-1 text-sm text-foreground">{getSnippet(result)}</p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {nextCursor && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="mt-3 w-full"
                  data-testid="global-search-load-more"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {t("globalSearch.loading")}
                    </>
                  ) : (
                    t("globalSearch.loadMore")
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
