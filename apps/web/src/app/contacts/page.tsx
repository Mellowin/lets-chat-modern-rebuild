"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Flag,
  Loader2,
  MessageSquare,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { searchUsers, type SearchUserResult } from "@/lib/groups-api";
import {
  listContacts,
  addContact,
  removeContact,
  startDmFromContact,
  listContactRequests,
  acceptContactRequest,
  declineContactRequest,
  cancelContactRequest,
  type Contact,
  type ContactRequest,
  type CreateContactResult,
  type ContactPrivacySetting,
} from "@/lib/contacts-api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { BlockUserButton } from "@/components/BlockUserButton";
import { ReportModal } from "@/components/ReportModal";

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

type RequestsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: ContactRequest[] }
  | { kind: "error"; message: string };

function isForbiddenError(err: unknown): boolean {
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    return message.includes("403") || message.includes("forbidden");
  }
  return false;
}

export default function ContactsPage() {
  const { accessToken, isLoading: authLoading, isAuthenticated, user } = useAuth();
  const { t } = useLocale();
  const router = useRouter();

  const [contacts, setContacts] = useState<ContactsState>({ kind: "idle" });
  const [requests, setRequests] = useState<RequestsState>({ kind: "idle" });
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>({ kind: "idle" });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );
  const [reportTarget, setReportTarget] = useState<{ userId: string; name: string } | null>(null);
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

  const loadRequests = useCallback(
    async (token: string) => {
      setRequests({ kind: "loading" });
      try {
        const data = await listContactRequests(token);
        setRequests({ kind: "success", data });
      } catch (err) {
        const message = localizeApiError(err, "contacts.failedLoadRequests", t);
        setRequests({ kind: "error", message });
      }
    },
    [t],
  );

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadContacts(accessToken);
     
    void loadRequests(accessToken);
  }, [isAuthenticated, accessToken, loadContacts, loadRequests]);

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
          const requestUserIds = new Set(
            requests.kind === "success" ? requests.data.map((r) => r.fromUserId) : [],
          );
          const filtered = data.filter(
            (u) =>
              u.id !== user?.id &&
              !contactIds.has(u.id) &&
              !requestUserIds.has(u.id),
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
  }, [query, accessToken, isAuthenticated, user?.id, contacts, requests, t]);

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
      const result: CreateContactResult = await addContact(accessToken, { userId: targetUser.id });
      setQuery("");
      setSearchState({ kind: "idle" });
      if (result.type === "contact") {
        setActionMessage({ kind: "success", text: t("contacts.contactAdded") });
        await loadContacts(accessToken);
      } else {
        setActionMessage({ kind: "success", text: t("contacts.contactRequestSent") });
        await loadRequests(accessToken);
      }
    } catch (err) {
      if (isForbiddenError(err)) {
        setActionMessage({ kind: "error", text: t("contacts.doesNotAcceptContacts") });
      } else {
        const message = localizeApiError(err, "contacts.failedAddContact", t);
        setActionMessage({ kind: "error", text: message });
      }
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

  async function handleAcceptRequest(requestId: string) {
    if (!accessToken) return;
    setActionLoading(`accept-${requestId}`);
    setActionMessage(null);
    try {
      await acceptContactRequest(accessToken, requestId);
      setActionMessage({ kind: "success", text: t("contacts.contactAdded") });
      await loadRequests(accessToken);
      await loadContacts(accessToken);
    } catch (err) {
      const message = localizeApiError(err, "contacts.failedAcceptRequest", t);
      setActionMessage({ kind: "error", text: message });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeclineRequest(requestId: string) {
    if (!accessToken) return;
    setActionLoading(`decline-${requestId}`);
    setActionMessage(null);
    try {
      await declineContactRequest(accessToken, requestId);
      setActionMessage({ kind: "success", text: t("contacts.declineRequest") });
      await loadRequests(accessToken);
    } catch (err) {
      const message = localizeApiError(err, "contacts.failedDeclineRequest", t);
      setActionMessage({ kind: "error", text: message });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancelRequest(requestId: string) {
    if (!accessToken) return;
    setActionLoading(`cancel-${requestId}`);
    setActionMessage(null);
    try {
      await cancelContactRequest(accessToken, requestId);
      setActionMessage({ kind: "success", text: t("contacts.cancelRequest") });
      await loadRequests(accessToken);
    } catch (err) {
      const message = localizeApiError(err, "contacts.failedCancelRequest", t);
      setActionMessage({ kind: "error", text: message });
    } finally {
      setActionLoading(null);
    }
  }

  function getPrivacyStatus(
    setting?: ContactPrivacySetting | null,
  ): { disabled: boolean; hint: string | null; label: string } {
    if (setting === "NOBODY") {
      return {
        disabled: true,
        hint: t("contacts.doesNotAcceptContacts"),
        label: t("contacts.addContact"),
      };
    }
    if (setting === "REQUESTS_ONLY") {
      return {
        disabled: false,
        hint: null,
        label: t("contacts.sendRequest"),
      };
    }
    return { disabled: false, hint: null, label: t("contacts.addContact") };
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
              {searchState.data.map((u) => {
                const privacy = getPrivacyStatus(u.contactPrivacySetting);
                return (
                  <li
                    key={u.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar src={u.avatarUrl} name={u.displayName || u.username} size="sm" alt="" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{u.displayName || u.username}</p>
                        <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
                        {privacy.hint && (
                          <p className="truncate text-xs text-destructive">{privacy.hint}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <BlockUserButton
                        accessToken={accessToken ?? ""}
                        userId={u.id}
                        userName={u.displayName || u.username}
                        variant="ghost"
                        size="sm"
                        showLabel={false}
                        onBlocked={() => {
                          setActionMessage({ kind: "success", text: t("safety.block") });
                          setSearchState((prev) =>
                            prev.kind === "success"
                              ? { kind: "success", data: prev.data.filter((item) => item.id !== u.id) }
                              : prev,
                          );
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={t("contacts.report")}
                        onClick={() =>
                          setReportTarget({
                            userId: u.id,
                            name: u.displayName || u.username,
                          })
                        }
                      >
                        <Flag size={14} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        data-testid="contacts-add-button"
                        disabled={privacy.disabled || actionLoading === `add-${u.id}`}
                        onClick={() => handleAddContact(u)}
                      >
                        {actionLoading === `add-${u.id}` ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <>
                            <UserPlus size={14} className="mr-1" />
                            {privacy.label}
                          </>
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
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
          <CardTitle className="text-base">{t("contacts.requestsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.kind === "idle" || requests.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 size={16} className="animate-spin" />
              {t("contacts.searching")}
            </div>
          ) : requests.kind === "error" ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {requests.message}
            </div>
          ) : requests.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("contacts.noRequests")}</p>
          ) : (
            <ul data-testid="contact-requests-list" className="space-y-2">
              {requests.data.map((request) => (
                <li
                  key={request.id}
                  data-testid={`contact-request-item-${request.id}`}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar
                      src={request.fromUser.avatarUrl}
                      name={request.fromUser.displayName || request.fromUser.username}
                      size="sm"
                      alt=""
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {request.fromUser.displayName || request.fromUser.username}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        @{request.fromUser.username} · {t("contacts.requestReceived")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {request.fromUserId === user?.id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={actionLoading === `cancel-${request.id}`}
                        onClick={() => handleCancelRequest(request.id)}
                      >
                        {actionLoading === `cancel-${request.id}` ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <>
                            <X size={14} className="mr-1" />
                            {t("contacts.cancelRequest")}
                          </>
                        )}
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={actionLoading === `accept-${request.id}`}
                          onClick={() => handleAcceptRequest(request.id)}
                        >
                          {actionLoading === `accept-${request.id}` ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <>
                              <Check size={14} className="mr-1" />
                              {t("contacts.acceptRequest")}
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={actionLoading === `decline-${request.id}`}
                          onClick={() => handleDeclineRequest(request.id)}
                        >
                          {actionLoading === `decline-${request.id}` ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <>
                              <X size={14} className="mr-1" />
                              {t("contacts.declineRequest")}
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
                      <BlockUserButton
                        accessToken={accessToken ?? ""}
                        userId={contact.contactUserId}
                        userName={contact.displayName || contact.username}
                        variant="ghost"
                        size="sm"
                        showLabel={false}
                        onBlocked={() => {
                          setActionMessage({ kind: "success", text: t("safety.block") });
                          void loadContacts(accessToken ?? "");
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={t("contacts.report")}
                        onClick={() =>
                          setReportTarget({
                            userId: contact.contactUserId,
                            name: contact.displayName || contact.username,
                          })
                        }
                      >
                        <Flag size={14} />
                      </Button>
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

      <ReportModal
        isOpen={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        accessToken={accessToken ?? ""}
        reportedUserId={reportTarget?.userId ?? ""}
        reportedUserName={reportTarget?.name ?? ""}
        onSubmitted={() => {
          setTimeout(() => setReportTarget(null), 1500);
        }}
      />
    </div>
  );
}
