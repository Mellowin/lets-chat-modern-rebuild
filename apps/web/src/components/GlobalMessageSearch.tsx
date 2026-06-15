"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/locale";
import { useAuth } from "@/lib/auth-context";
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
        className="rounded-sm bg-yellow-200 px-0.5 text-zinc-900 dark:bg-yellow-700 dark:text-zinc-100"
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

  function getSourceBadge(result: GlobalSearchResult): string {
    if (result.source.type === "DIRECT") {
      return t("globalSearch.directLabel");
    }
    if (result.source.channelType === "PRIVATE") {
      return t("globalSearch.privateChannelLabel");
    }
    return t("globalSearch.publicChannelLabel");
  }

  function getSnippet(result: GlobalSearchResult): React.ReactNode {
    const text = result.content.trim();
    if (text.length > 0) {
      return <span className="line-clamp-2">{highlightText(text, query)}</span>;
    }
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
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
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        data-testid="global-search-open-button"
        aria-label={t("header.searchAllMessages")}
      >
        <span>🔍</span>
        <span className="hidden sm:inline">{t("header.searchAllMessages")}</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16 sm:pt-24"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
          data-testid="global-search-modal"
        >
          <div className="w-full max-w-2xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold">{t("globalSearch.title")}</h2>
              <button
                onClick={handleClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                aria-label={t("channel.cancel")}
                data-testid="global-search-close-button"
              >
                ×
              </button>
            </div>

            <div className="p-4 overflow-y-auto">
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  id="global-search-input"
                  name="global-search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("globalSearch.placeholder")}
                  className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                  data-testid="global-search-input"
                  aria-label={t("globalSearch.placeholder")}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={status === "loading" || !query.trim()}
                  className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                  data-testid="global-search-submit"
                >
                  {status === "loading" ? t("globalSearch.loading") : t("globalSearch.search")}
                </button>
              </form>

              {status === "error" && errorMessage && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                  <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    {errorMessage}
                  </div>
                </div>
              )}

              {status === "success" && results.length === 0 && query.trim().length > 0 && (
                <p
                  className="mt-3 text-sm text-zinc-500 dark:text-zinc-400"
                  data-testid="global-search-empty"
                >
                  {t("globalSearch.empty")}
                </p>
              )}

              {results.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {results.map((result) => (
                    <li key={result.id}>
                      <button
                        onClick={() => handleResultClick(result)}
                        className="w-full text-left rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 p-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                        data-testid={`global-search-result-${result.id}`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                            {result.author.displayName || result.author.username}
                          </span>
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            {formatDate(result.createdAt)}
                          </span>
                          <span className="text-[10px] rounded-full bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-300">
                            {getSourceBadge(result)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          {getSourceLabel(result)}
                        </p>
                        <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                          {getSnippet(result)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {nextCursor && (
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="mt-3 w-full inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  data-testid="global-search-load-more"
                >
                  {loadingMore ? t("globalSearch.loading") : t("globalSearch.loadMore")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
