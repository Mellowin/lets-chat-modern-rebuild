"use client";

import { useState, useCallback } from "react";
import { useLocale } from "@/lib/locale";
import { searchChannelMessages, type Message, type SearchChannelMessagesResult } from "@/lib/messages-api";

interface ChannelMessageSearchProps {
  workspaceId: string;
  channelId: string;
  accessToken: string;
  onJumpToMessage: (messageId: string) => void;
}

export default function ChannelMessageSearch({
  workspaceId,
  channelId,
  accessToken,
  onJumpToMessage,
}: ChannelMessageSearchProps) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

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
    void performSearch(query);
  }

  function handleLoadMore() {
    if (loadingMore || !nextCursor) return;
    void performSearch(query, nextCursor ?? undefined);
  }

  function handleJump(msg: Message) {
    onJumpToMessage(msg.id);
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleString();
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          data-testid="search-toggle-button"
        >
          {t("channel.searchMessages")}
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-sm">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("channel.searchInThisChannel")}
              className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
              data-testid="search-input"
            />
            <button
              type="submit"
              disabled={status === "loading" || !query.trim()}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              data-testid="search-submit"
            >
              {status === "loading" ? t("channel.searching") : t("channel.searchMessages")}
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
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400" data-testid="search-empty">
              {t("channel.noMessagesFound")}
            </p>
          )}

          {results.length > 0 && (
            <ul className="mt-3 space-y-2 max-h-80 overflow-y-auto">
              {results.map((msg) => (
                <li
                  key={msg.id}
                  className="flex flex-col gap-1 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 p-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  <button
                    onClick={() => handleJump(msg)}
                    className="text-left"
                    data-testid={`search-result-${msg.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        {msg.author.displayName || msg.author.username}
                      </span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        {formatDate(msg.createdAt)}
                      </span>
                      {msg.editedAt && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          ({t("channel.edited")})
                        </span>
                      )}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          📎 {msg.attachments.length}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2">
                      {msg.content}
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
              data-testid="search-load-more"
            >
              {loadingMore ? t("channel.searching") : t("channel.loadMoreResults")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
