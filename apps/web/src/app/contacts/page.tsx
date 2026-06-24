"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, Search, UserPlus, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { searchUsers, type SearchUserResult } from "@/lib/groups-api";
import {
  listContacts,
  addContact,
  removeContact,
  startDmFromContact,
  type Contact,
} from "@/lib/contacts-api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";

type ContactsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Contact[] }
  | { kind: "error"; message: string };

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: SearchUserResult[] }
  | { kind: "error"; message: string };

export default function ContactsPage() {
  const { accessToken, isLoading: authLoading, isAuthenticated, user } = useAuth();
  const { t } = useLocale();
  const router = useRouter();

  const [contacts, setContacts] = useState<ContactsState>({ kind: "idle" });
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>({ kind: "idle" });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );
  const searchAbortRef = useRef<AbortController | null>(null);

  const loadContacts = useCallback(
    async (token: string) => {
      setContacts({ kind: "loading" });
      try {
        const data = await listContacts(token);
        setContacts({ kind: "success", data });
      } catch (err) {
        const message = localizeApiError(err, "contacts.failedLoadContacts", t);
        setContacts({ kind: "error", message });
      }
    },
    [t],
  );

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadContacts(accessToken);
  }, [isAuthenticated, accessToken, loadContacts]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchState({ kind: "idle" });
      return;
    }

    const timeout = setTimeout(async () => {
      setSearchState({ kind: "loading" });
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const data = await searchUsers(accessToken, trimmed);
        if (!controller.signal.aborted) {
          const contactIds = new Set(
            contacts.kind === "success" ? contacts.data.map((c) => c.contactUserId) : [],
          );
          const filtered = data.filter(
            (u) => u.id !== user?.id && !contactIds.has(u.id),
          );
          setSearchState({ kind: "success", data: filtered });
        }
      } catch {
        if (!controller.signal.aborted) {
          setSearchState({ kind: "error", message: t("contacts.failedLoadContacts") });
        }
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [query, accessToken, isAuthenticated, user?.id, contacts, t]);

  useEffect(() => {
    return () => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
    };
  }, []);

  async function handleAddContact(targetUser: SearchUserResult) {
    if (!accessToken) return;
    setActionLoading(`add-${targetUser.id}`);
    setActionMessage(null);
    try {
      await addContact(accessToken, { userId: targetUser.id });
      setQuery("");
      setSearchState({ kind: "idle" });
      setActionMessage({ kind: "success", text: t("contacts.contactAdded") });
      await loadContacts(accessToken);
    } catch (err) {
      const message = localizeApiError(err, "contacts.failedAddContact", t);
      setActionMessage({ kind: "error", text: message });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemoveContact(contactUserId: string) {
    if (!accessToken) return;
    setActionLoading(`remove-${contactUserId}`);
    setActionMessage(null);
    try {
      await removeContact(accessToken, contactUserId);
      setActionMessage({ kind: "success", text: t("contacts.contactRemoved") });
      await loadContacts(accessToken);
    } catch (err) {
      const message = localizeApiError(err, "contacts.failedRemoveContact", t);
      setActionMessage({ kind: "error", text: message });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleStartChat(contactUserId: string) {
    if (!accessToken) return;
    setActionLoading(`chat-${contactUserId}`);
    setActionMessage(null);
    try {
      const conversation = await startDmFromContact(accessToken, contactUserId);
      router.push(`/direct/${conversation.id}`);
    } catch (err) {
      const message = localizeApiError(err, "contacts.failedStartDm", t);
      setActionMessage({ kind: "error", text: message });
      setActionLoading(null);
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
      <PageHeader title={t("contacts.title")} subtitle={t("contacts.subtitle")} />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("contacts.searchPeople")}</CardTitle>
          <CardDescription>{t("contacts.searchPlaceholder")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="contacts-search"
              data-testid="contacts-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("contacts.searchPlaceholder")}
              className="pl-9"
            />
          </div>

          {query.trim().length > 0 && query.trim().length < 2 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("contacts.searchQueryTooShort")}
            </p>
          )}

          {searchState.kind === "loading" && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              {t("contacts.searching")}
            </div>
          )}

          {searchState.kind === "error" && (
            <p className="mt-2 text-xs text-destructive">{searchState.message}</p>
          )}

          {searchState.kind === "success" && query.trim().length >= 2 && searchState.data.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{t("contacts.noUsersFound")}</p>
          )}

          {searchState.kind === "success" && searchState.data.length > 0 && (
            <ul className="mt-3 space-y-1">
              {searchState.data.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar src={u.avatarUrl} name={u.displayName || u.username} size="sm" alt="" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.displayName || u.username}</p>
                      <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    data-testid="contacts-add-button"
                    disabled={actionLoading === `add-${u.id}`}
                    onClick={() => handleAddContact(u)}
                  >
                    {actionLoading === `add-${u.id}` ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <UserPlus size={14} className="mr-1" />
                        {t("contacts.addContact")}
                      </>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {actionMessage && (
        <div
          className={`mt-4 rounded-lg border p-2.5 text-sm ${
            actionMessage.kind === "success"
              ? "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/40 dark:text-emerald-400"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("contacts.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.kind === "idle" || contacts.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 size={16} className="animate-spin" />
              {t("contacts.searching")}
            </div>
          ) : contacts.kind === "error" ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {contacts.message}
            </div>
          ) : contacts.data.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t("contacts.noContacts")}
              description={t("contacts.noContactsDescription")}
            />
          ) : (
            <ul data-testid="contacts-list" className="space-y-2">
              {contacts.data.map((contact) => (
                <li
                  key={contact.id}
                  data-testid={`contact-list-item-${contact.contactUserId}`}
                  className="group rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-indigo-50/30 shadow-sm transition-all hover:border-primary/30 hover:shadow-md dark:to-indigo-950/10"
                >
                  <div className="flex items-center gap-3 p-3 min-w-0">
                    <Avatar
                      src={contact.avatarUrl}
                      name={contact.displayName || contact.username}
                      size="md"
                      alt=""
                      className="ring-2 ring-border group-hover:ring-primary/20 transition-all"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {contact.displayName || contact.username}
                      </p>
                      <p className="text-xs text-muted-foreground">@{contact.username}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        data-testid="contacts-start-chat-button"
                        disabled={actionLoading === `chat-${contact.contactUserId}`}
                        onClick={() => handleStartChat(contact.contactUserId)}
                      >
                        {actionLoading === `chat-${contact.contactUserId}` ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <>
                            <MessageSquare size={14} className="mr-1" />
                            {t("contacts.startChat")}
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        data-testid="contacts-remove-button"
                        disabled={actionLoading === `remove-${contact.contactUserId}`}
                        onClick={() => handleRemoveContact(contact.contactUserId)}
                        aria-label={t("contacts.removeContact")}
                      >
                        {actionLoading === `remove-${contact.contactUserId}` ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <X size={14} />
                        )}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
