"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Mail, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  listDirectConversations,
  createDirectConversation,
  type DirectConversation,
  type DirectMessage,
} from "@/lib/direct-conversations-api";
import { createSocket } from "@/lib/socket-client";

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
  const { accessToken, isLoading: authLoading, isAuthenticated, user } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationsState>({ kind: "idle" });
  const [startState, setStartState] = useState<StartState>({ kind: "idle" });
  const [identifier, setIdentifier] = useState("");
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);

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

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const socket = createSocket(accessToken);
    socketRef.current = socket;

    function handleDirectConversationUpdated(
      update:
        | DirectMessage
        | {
            conversationId: string;
            updatedAt: string;
            lastMessage: {
              id: string;
              content: string;
              createdAt: string;
              authorId: string;
            } | null;
          },
    ) {
      let shouldNotify = false;
      let shouldReload = false;

      setConversations((prev) => {
        if (prev.kind !== "success") return prev;

        // Conversation-level refresh (e.g. last message deleted)
        if ("lastMessage" in update) {
          const existingIndex = prev.data.findIndex(
            (c) => c.id === update.conversationId,
          );
          if (existingIndex === -1) {
            shouldReload = true;
            return prev;
          }
          const updated = [...prev.data];
          updated[existingIndex] = {
            ...updated[existingIndex],
            lastMessage: update.lastMessage,
          };
          shouldNotify = true;
          return { kind: "success", data: updated };
        }

        const msg = update;
        const existingIndex = prev.data.findIndex(
          (c) => c.id === msg.conversationId,
        );
        if (existingIndex === -1) {
          shouldReload = true;
          return prev;
        }
        const updated = [...prev.data];
        const conv = updated[existingIndex];

        // Edit of current last message — update in place, no unread change
        if (conv.lastMessage && conv.lastMessage.id === msg.id) {
          updated[existingIndex] = {
            ...conv,
            lastMessage: {
              id: msg.id,
              content: msg.content,
              createdAt: msg.createdAt,
              authorId: msg.author.id,
            },
          };
          shouldNotify = true;
          return { kind: "success", data: updated };
        }

        // New message — move to top and increment unread if from other user
        const isOwnMessage = msg.author.id === user?.id;
        updated[existingIndex] = {
          ...conv,
          updatedAt: msg.createdAt,
          lastMessage: {
            id: msg.id,
            content: msg.content,
            createdAt: msg.createdAt,
            authorId: msg.author.id,
          },
          unreadCount: isOwnMessage
            ? conv.unreadCount
            : conv.unreadCount + 1,
        };
        const [moved] = updated.splice(existingIndex, 1);
        updated.unshift(moved);
        shouldNotify = true;
        return { kind: "success", data: updated };
      });

      setTimeout(() => {
        if (shouldReload && accessToken) {
          void loadConversations(accessToken);
        }
        if (shouldNotify) {
          window.dispatchEvent(new CustomEvent("direct-conversations:changed"));
        }
      }, 0);
    }

    function handlePresenceOnline(payload: {
      user: { id: string; username: string; displayName?: string | null };
      status: string;
    }) {
      setConversations((prev) => {
        if (prev.kind !== "success") return prev;
        const existingIndex = prev.data.findIndex(
          (c) => c.otherParticipant?.id === payload.user.id,
        );
        if (existingIndex === -1) return prev;
        const updated = [...prev.data];
        updated[existingIndex] = {
          ...updated[existingIndex],
          isOnline: true,
        };
        return { kind: "success", data: updated };
      });
    }

    function handlePresenceOffline(payload: {
      user: { id: string; username: string; displayName?: string | null };
      status: string;
    }) {
      setConversations((prev) => {
        if (prev.kind !== "success") return prev;
        const existingIndex = prev.data.findIndex(
          (c) => c.otherParticipant?.id === payload.user.id,
        );
        if (existingIndex === -1) return prev;
        const updated = [...prev.data];
        updated[existingIndex] = {
          ...updated[existingIndex],
          isOnline: false,
        };
        return { kind: "success", data: updated };
      });
    }

    socket.on("direct:conversation:updated", handleDirectConversationUpdated);
    socket.on("presence:online", handlePresenceOnline);
    socket.on("presence:offline", handlePresenceOffline);

    return () => {
      socket.off("direct:conversation:updated", handleDirectConversationUpdated);
      socket.off("presence:online", handlePresenceOnline);
      socket.off("presence:offline", handlePresenceOffline);
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, accessToken]);

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
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          {t("auth.loadingSession")}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <Card className="max-w-sm text-center">
          <CardHeader>
            <CardTitle>{t("auth.authRequired")}</CardTitle>
            <CardDescription>{t("auth.pleaseSignIn")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/login">{t("auth.signIn")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-6 sm:p-10 max-w-3xl">
      <PageHeader title={t("direct.title")} />

      {/* Start chat form */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("direct.startChat")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleStart} className="flex flex-col sm:flex-row items-start gap-3">
            <Input
              id="direct-recipient-input"
              name="direct-recipient-input"
              aria-label={t("direct.usernameOrEmail")}
              type="text"
              placeholder={t("direct.usernameOrEmail")}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={startState.kind === "loading"}
            >
              {startState.kind === "loading" ? (
                <>
                  <Loader2 size={16} className="mr-1.5 animate-spin" />
                  {t("direct.sending")}
                </>
              ) : (
                <>
                  <UserPlus size={16} className="mr-1.5" />
                  {t("direct.startChat")}
                </>
              )}
            </Button>
          </form>
          {startState.kind === "error" && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive">
              {startState.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conversations list */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("direct.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {conversations.kind === "idle" || conversations.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 size={16} className="animate-spin" />
              {t("direct.loadingConversations")}
            </div>
          ) : conversations.kind === "error" ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {conversations.message}
            </div>
          ) : conversations.data.length === 0 ? (
            <EmptyState
              icon={Mail}
              title={t("direct.noConversations")}
            />
          ) : (
            <ul className="divide-y divide-border">
              {conversations.data.map((conv) => {
                const other = conv.otherParticipant;
                const name = other?.displayName || other?.username || t("messageAuthor.unknownUser");
                return (
                  <li
                    key={conv.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 -mx-2 px-2 rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <Link
                      href={`/direct/${conv.id}`}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <div
                        data-testid={`direct-list-presence-${conv.id}`}
                        className="relative"
                      >
                        <Avatar
                          src={other?.avatarUrl}
                          name={name}
                          size="md"
                          alt={name}
                        />
                        <span
                          data-testid={`direct-list-presence-dot-${conv.id}`}
                          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${
                            conv.isOnline
                              ? "bg-emerald-500"
                              : "bg-muted-foreground"
                          }`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{name}</p>
                        {conv.lastMessage ? (
                          <p className="text-xs text-muted-foreground truncate">
                            {conv.lastMessage.content}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground/70">
                            {t("direct.noMessages")}
                          </p>
                        )}
                      </div>
                      {conv.unreadCount > 0 && (
                        <Badge variant="default">
                          {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                        </Badge>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
