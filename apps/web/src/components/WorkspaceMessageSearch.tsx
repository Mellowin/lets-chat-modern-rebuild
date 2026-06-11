"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/locale";
import { searchWorkspaceMessages, type WorkspaceSearchResult } from "@/lib/messages-api";

interface WorkspaceMessageSearchProps {
  workspaceId: string;
  accessToken: string;
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
      <mark key={`${idx}-${query}`} className="rounded-sm bg-yellow-200 px-0.5 text-zinc-900 dark:bg-yellow-700 dark:text-zinc-100">
        {text.slice(idx, idx + query.length)}
      </mark>,
    );
    i = idx + query.length;
  }
  return parts;
}

export default function WorkspaceMessageSearch({ workspaceId, accessToken }: WorkspaceMessageSearchProps) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const performSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setStatus("idle");
        return;
      }
      setStatus("loading");
      setErrorMessage(null);
      try {
        const data = await searchWorkspaceMessages(accessToken, workspaceId, q, { limit: 20 });
        setResults(data);
        setStatus("success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("workspace.searchFailed");
        setErrorMessage(msg);
        setStatus("error");
      }
    },
    [accessToken, workspaceId, t],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void performSearch(query);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString();
  }

  function getSnippet(msg: WorkspaceSearchResult): React.ReactNode {
    const text = msg.content.trim();
    if (text.length > 0) {
      return <span className="line-clamp-2">{highlightText(text, query)}</span>;
    }
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          data-testid="workspace-search-toggle"
        >
          {t("workspace.searchMessages")}
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-sm">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("workspace.searchInWorkspace")}
              className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
              data-testid="workspace-search-input"
            />
            <button
              type="submit"
              disabled={status === "loading" || !query.trim()}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              data-testid="workspace-search-submit"
            >
              {status === "loading" ? t("workspace.searching") : t("workspace.searchMessages")}
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
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400" data-testid="workspace-search-empty">
              {t("workspace.noMessagesFound")}
            </p>
          )}

          {results.length > 0 && (
            <ul className="mt-3 space-y-2 max-h-80 overflow-y-auto">
              {results.map((msg) => (
                <li
                  key={msg.id}
                  className="flex flex-col gap-1 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 p-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  <Link
                    href={`/workspaces/${workspaceId}/channels/${msg.channel.id}?message=${msg.id}`}
                    className="text-left"
                    data-testid={`workspace-search-result-${msg.id}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        {msg.author.displayName || msg.author.username}
                      </span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        {formatDate(msg.createdAt)}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        #{msg.channel.name}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                      {getSnippet(msg)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
