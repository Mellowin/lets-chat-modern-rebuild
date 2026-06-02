"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { getAvatarUrl } from "@/lib/avatar-url";
import {
  listDirectConversations,
  createDirectConversation,
  type DirectConversation,
} from "@/lib/direct-conversations-api";

type ConversationsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: DirectConversation[] }
  | { kind: "error"; message: string };

type StartState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export default function DirectMessagesPage() {
  const { accessToken, isLoading: authLoading, isAuthenticated } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationsState>({ kind: "idle" });
  const [startState, setStartState] = useState<StartState>({ kind: "idle" });
  const [identifier, setIdentifier] = useState("");

  const loadConversations = useCallback(async (token: string) => {
    setConversations({ kind: "loading" });
    try {
      const data = await listDirectConversations(token);
      setConversations({ kind: "success", data });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("direct.failedLoadConversations");
      setConversations({ kind: "error", message });
    }
  }, [t]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConversations(accessToken);
  }, [isAuthenticated, accessToken, loadConversations]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = identifier.trim();
    if (!trimmed) return;
    if (!accessToken) return;

    setStartState({ kind: "loading" });
    try {
      const conversation = await createDirectConversation(accessToken, { usernameOrEmail: trimmed });
      setIdentifier("");
      setStartState({ kind: "idle" });
      router.push(`/direct/${conversation.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("direct.failedStartConversation");
      setStartState({ kind: "error", message });
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          {t("auth.loadingSession")}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t("auth.authRequired")}</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t("auth.pleaseSignIn")}
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {t("auth.signIn")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-6 sm:p-10 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t("direct.title")}</h1>

      {/* Start chat form */}
      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <form onSubmit={handleStart} className="flex flex-col sm:flex-row items-start gap-3">
          <input
            type="text"
            placeholder={t("direct.usernameOrEmail")}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="flex-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
          <button
            type="submit"
            disabled={startState.kind === "loading"}
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {startState.kind === "loading" ? t("direct.sending") : t("direct.startChat")}
          </button>
        </form>
        {startState.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {startState.message}
            </div>
          </div>
        )}
      </div>

      {/* Conversations list */}
      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("direct.title")}</h2>
        </div>

        <div className="mt-3">
          {conversations.kind === "idle" || conversations.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 py-4">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              {t("direct.loadingConversations")}
            </div>
          ) : conversations.kind === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
              <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {conversations.message}
              </div>
            </div>
          ) : conversations.data.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">
              {t("direct.noConversations")}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {conversations.data.map((conv) => {
                const other = conv.otherParticipant;
                const name = other?.displayName || other?.username || t("messageAuthor.unknownUser");
                return (
                  <li
                    key={conv.id}
                    className="flex items-center justify-between py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 -mx-2 px-2 rounded-md transition-colors"
                  >
                    <Link
                      href={`/direct/${conv.id}`}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <div className="relative h-8 w-8 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                        {other?.avatarUrl ? (
                          <Image
                            src={getAvatarUrl(other.avatarUrl) || ""}
                            alt=""
                            fill
                            sizes="32px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            {name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        {conv.lastMessage ? (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                            {conv.lastMessage.content}
                          </p>
                        ) : (
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            {t("direct.noMessages")}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
