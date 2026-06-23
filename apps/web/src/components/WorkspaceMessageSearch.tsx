"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Search, X, Loader2 } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
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

export default function WorkspaceMessageSearch({ workspaceId, accessToken }: WorkspaceMessageSearchProps) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const performSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setResults([]);
        setStatus("idle");
        return;
      }
      if (trimmed.length < 2) {
        setErrorMessage(t("workspace.searchQueryTooShort"));
        setResults([]);
        setStatus("error");
        return;
      }
      setStatus("loading");
      setErrorMessage(null);
      try {
        const data = await searchWorkspaceMessages(accessToken, workspaceId, q, { limit: 20 });
        setResults(data);
        setStatus("success");
      } catch (err) {
        const msg = localizeApiError(err, "workspace.searchFailed", t);
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

  function handleClear() {
    setQuery("");
    setResults([]);
    setStatus("idle");
    setErrorMessage(null);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString();
  }

  function getSnippet(msg: WorkspaceSearchResult): React.ReactNode {
    const text = msg.content.trim();
    if (text.length > 0) {
      return <span className="line-clamp-2">{highlightText(text, query)}</span>;
    }
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="w-full">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen((prev) => !prev)}
        data-testid="workspace-search-toggle"
      >
        <Search size={16} />
        {t("workspace.searchMessages")}
      </Button>

      {isOpen && (
        <div className="mt-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                id="workspace-search-input"
                name="workspace-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("workspace.searchInWorkspace")}
                className="pl-9 pr-9"
                data-testid="workspace-search-input"
                aria-label={t("workspace.searchInWorkspace")}
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
              data-testid="workspace-search-submit"
            >
              {status === "loading" ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t("workspace.searching")}
                </>
              ) : (
                t("workspace.searchMessages")
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
              {t("workspace.searching")}
            </div>
          )}

          {status === "success" && results.length === 0 && query.trim().length > 0 && (
            <div data-testid="workspace-search-empty">
              <EmptyState
                icon={Search}
                title={t("workspace.noMessagesFound")}
                description={t("workspace.searchInWorkspace")}
              />
            </div>
          )}

          {results.length > 0 && (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {results.map((msg) => (
                <li key={msg.id}>
                  <Link
                    href={`/workspaces/${workspaceId}/channels/${msg.channel.id}?message=${msg.id}`}
                    className="block rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    data-testid={`workspace-search-result-${msg.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {msg.author.displayName || msg.author.username}
                        </span>
                        <Badge variant="muted">#{msg.channel.name}</Badge>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(msg.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{getSnippet(msg)}</p>
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
