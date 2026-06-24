"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Users, X, Search } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  listGroups,
  createGroup,
  searchUsers,
  type GroupSummary,
  type SearchUserResult,
} from "@/lib/groups-api";
import { createSocket } from "@/lib/socket-client";

type GroupsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: GroupSummary[] }
  | { kind: "error"; message: string };

type CreateState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export default function GroupsPage() {
  const { accessToken, isLoading: authLoading, isAuthenticated, user } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupsState>({ kind: "idle" });
  const [createState, setCreateState] = useState<CreateState>({ kind: "idle" });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<SearchUserResult[]>([]);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const loadGroups = useCallback(
    async (token: string) => {
      setGroups({ kind: "loading" });
      try {
        const data = await listGroups(token);
        setGroups({ kind: "success", data });
      } catch (err) {
        const message = localizeApiError(err, "groups.failedLoadGroups", t);
        setGroups({ kind: "error", message });
      }
    },
    [t],
  );

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadGroups(accessToken);
  }, [isAuthenticated, accessToken, loadGroups]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const socket = createSocket(accessToken);
    socketRef.current = socket;

    function handleConversationUpdated() {
      if (!accessToken) return;
      void loadGroups(accessToken);
      window.dispatchEvent(new CustomEvent("groups:changed"));
    }

    socket.on("group:conversation:updated", handleConversationUpdated);

    return () => {
      socket.off("group:conversation:updated", handleConversationUpdated);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, accessToken, loadGroups]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken || !isModalOpen) return;

    const trimmed = memberQuery.trim();
    if (!trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearchLoading(true);
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const data = await searchUsers(accessToken, trimmed);
        if (!controller.signal.aborted) {
          const filtered = data.filter(
            (u) => u.id !== user?.id && !selectedMembers.some((m) => m.id === u.id),
          );
          setSearchResults(filtered);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [memberQuery, isModalOpen, accessToken, isAuthenticated, user?.id, selectedMembers]);

  useEffect(() => {
    return () => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
    };
  }, []);

  function toggleMemberSelection(member: SearchUserResult) {
    setSelectedMembers((prev) => {
      const exists = prev.some((m) => m.id === member.id);
      if (exists) return prev.filter((m) => m.id !== member.id);
      return [...prev, member];
    });
    setSearchResults((prev) => prev.filter((m) => m.id !== member.id));
  }

  function removeSelectedMember(member: SearchUserResult) {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== member.id));
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = groupName.trim();
    if (!trimmedName || !accessToken) return;

    setCreateState({ kind: "loading" });
    try {
      const group = await createGroup(accessToken, {
        name: trimmedName,
        memberIds: selectedMembers.map((m) => m.id),
      });
      setGroupName("");
      setSelectedMembers([]);
      setMemberQuery("");
      setSearchResults([]);
      setIsModalOpen(false);
      setCreateState({ kind: "idle" });
      window.dispatchEvent(new CustomEvent("groups:changed"));
      router.push(`/groups/${group.id}`);
    } catch (err) {
      const message = localizeApiError(err, "groups.failedCreateGroup", t);
      setCreateState({ kind: "error", message });
    }
  }

  function closeModal() {
    setIsModalOpen(false);
    setCreateState({ kind: "idle" });
    setGroupName("");
    setMemberQuery("");
    setSearchResults([]);
    setSelectedMembers([]);
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
      <PageHeader
        title={t("groups.title")}
        subtitle={t("groups.subtitle")}
        actions={
          <Button
            data-testid="group-create-button"
            onClick={() => setIsModalOpen(true)}
          >
            <Plus size={16} className="mr-1.5" />
            {t("groups.createGroup")}
          </Button>
        }
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("groups.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {groups.kind === "idle" || groups.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 size={16} className="animate-spin" />
              {t("groups.loadingGroups")}
            </div>
          ) : groups.kind === "error" ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {groups.message}
            </div>
          ) : groups.data.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t("groups.noGroups")}
              description={t("groups.noGroupsDescription")}
            />
          ) : (
            <ul data-testid="groups-list" className="space-y-2">
              {groups.data.map((group) => (
                <li
                  key={group.id}
                  data-testid={`group-list-item-${group.id}`}
                  className="group rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-indigo-50/30 shadow-sm transition-all hover:border-primary/30 hover:shadow-md dark:to-indigo-950/10"
                >
                  <Link
                    href={`/groups/${group.id}`}
                    className="flex items-center gap-3 p-3 min-w-0"
                  >
                    <Avatar
                      src={null}
                      name={group.name}
                      size="md"
                      alt={group.name}
                      className="ring-2 ring-border group-hover:ring-primary/20 transition-all"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {group.name}
                      </p>
                      {group.lastMessage ? (
                        <p className="text-xs text-muted-foreground truncate">
                          {group.lastMessage.content}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/70">
                          {t("groups.noMessages")}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                        {t("groups.memberCount", String(group.memberCount))}
                      </p>
                    </div>
                    {group.unreadCount > 0 && (
                      <Badge variant="default" className="shrink-0">
                        {group.unreadCount > 99 ? "99+" : group.unreadCount}
                      </Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 sm:pt-24"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-label={t("groups.createGroup")}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("groups.createGroup")}</h2>
              <Button variant="icon" size="sm" onClick={closeModal} aria-label={t("groups.closeSettings")}>
                <X size={18} />
              </Button>
            </div>
            <form onSubmit={handleCreateGroup} className="mt-4 space-y-4">
              <div>
                <label htmlFor="group-name-input" className="block text-sm font-medium">
                  {t("groups.groupName")}
                </label>
                <Input
                  id="group-name-input"
                  data-testid="group-name-input"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder={t("groups.groupNamePlaceholder")}
                  className="mt-1"
                />
              </div>

              <div>
                <label htmlFor="group-member-search" className="block text-sm font-medium">
                  {t("groups.searchMembers")}
                </label>
                <div className="relative mt-1">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="group-member-search"
                    data-testid="group-member-search"
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder={t("groups.searchMembers")}
                    className="pl-9"
                  />
                </div>
                {searchLoading && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 size={12} className="animate-spin" />
                    {t("channel.searching")}
                  </div>
                )}
                {!searchLoading && memberQuery.trim() && searchResults.length === 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("groups.noMembersFound")}
                  </p>
                )}
                {searchResults.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border">
                    {searchResults.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => toggleMemberSelection(u)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <Avatar src={u.avatarUrl} name={u.displayName || u.username} size="sm" alt="" />
                          <span className="truncate">{u.displayName || u.username}</span>
                          <span className="ml-auto text-xs text-muted-foreground">@{u.username}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selectedMembers.length > 0 && (
                <div>
                  <p className="text-sm font-medium">{t("groups.selectedMembers")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedMembers.map((m) => (
                      <Badge
                        key={m.id}
                        variant="muted"
                        className="flex items-center gap-1 pr-1"
                      >
                        {m.displayName || m.username}
                        <button
                          type="button"
                          onClick={() => removeSelectedMember(m)}
                          className="rounded-full p-0.5 hover:bg-secondary-foreground/10"
                          aria-label={t("channel.remove")}
                        >
                          <X size={12} />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {createState.kind === "error" && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive">
                  {createState.message}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={closeModal}>
                  {t("channel.cancel")}
                </Button>
                <Button type="submit" disabled={!groupName.trim() || createState.kind === "loading"}>
                  {createState.kind === "loading" ? (
                    <>
                      <Loader2 size={16} className="mr-1.5 animate-spin" />
                      {t("dashboard.creating")}
                    </>
                  ) : (
                    <>
                      <Plus size={16} className="mr-1.5" />
                      {t("groups.createGroup")}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
