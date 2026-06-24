"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X, UserPlus, UserMinus, LogOut, Archive, Save } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  addGroupMember,
  removeGroupMember,
  updateGroup,
  searchUsers,
  leaveGroup,
  archiveGroup,
  type GroupSummary,
  type SearchUserResult,
} from "@/lib/groups-api";

interface GroupSettingsModalProps {
  group: GroupSummary;
  currentUserId: string;
  accessToken: string;
  onClose: () => void;
  onUpdate: (group: GroupSummary) => void;
  onLeave: () => void;
  onArchive: () => void;
}

export default function GroupSettingsModal({
  group,
  currentUserId,
  accessToken,
  onClose,
  onUpdate,
  onLeave,
  onArchive,
}: GroupSettingsModalProps) {
  const { t } = useLocale();
  const isOwner = group.myRole === "OWNER";

  const [renameValue, setRenameValue] = useState(group.name);
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [memberQuery, setMemberQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRenameValue(group.name);
  }, [group.name]);

  useEffect(() => {
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
          const existingIds = new Set(group.members.map((m) => m.id));
          setSearchResults(data.filter((u) => !existingIds.has(u.id) && u.id !== currentUserId));
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
  }, [memberQuery, accessToken, group.members, currentUserId]);

  useEffect(() => {
    return () => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
    };
  }, []);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === group.name) return;

    setRenameLoading(true);
    setRenameError(null);
    try {
      const updated = await updateGroup(accessToken, group.id, { name: trimmed });
      onUpdate(updated);
      setActionMessage({ kind: "success", text: t("groups.groupRenamed") });
      window.dispatchEvent(new CustomEvent("groups:changed"));
    } catch (err) {
      const message = localizeApiError(err, "groups.failedRenameGroup", t);
      setRenameError(message);
      setActionMessage({ kind: "error", text: message });
    } finally {
      setRenameLoading(false);
    }
  }

  async function handleAddMember(userId: string) {
    setActionLoading(`add-${userId}`);
    setActionMessage(null);
    try {
      const updated = await addGroupMember(accessToken, group.id, { userId });
      onUpdate(updated);
      setMemberQuery("");
      setSearchResults([]);
      setActionMessage({ kind: "success", text: t("groups.memberAdded") });
      window.dispatchEvent(new CustomEvent("groups:changed"));
    } catch (err) {
      const message = localizeApiError(err, "groups.failedAddMember", t);
      setActionMessage({ kind: "error", text: message });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!window.confirm(t("groups.confirmRemoveMember"))) return;
    setActionLoading(`remove-${userId}`);
    setActionMessage(null);
    try {
      const updated = await removeGroupMember(accessToken, group.id, userId);
      onUpdate(updated);
      setActionMessage({ kind: "success", text: t("groups.memberRemoved") });
      window.dispatchEvent(new CustomEvent("groups:changed"));
    } catch (err) {
      const message = localizeApiError(err, "groups.failedRemoveMember", t);
      setActionMessage({ kind: "error", text: message });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLeave() {
    if (isOwner) {
      setActionMessage({ kind: "error", text: t("groups.leaveOwnerError") });
      return;
    }
    if (!window.confirm(t("groups.confirmLeave"))) return;
    setActionLoading("leave");
    setActionMessage(null);
    try {
      await leaveGroup(accessToken, group.id);
      window.dispatchEvent(new CustomEvent("groups:changed"));
      onLeave();
    } catch (err) {
      const message = localizeApiError(err, "groups.failedLeaveGroup", t);
      setActionMessage({ kind: "error", text: message });
      setActionLoading(null);
    }
  }

  async function handleArchive() {
    if (!window.confirm(t("groups.confirmArchive"))) return;
    setActionLoading("archive");
    setActionMessage(null);
    try {
      await archiveGroup(accessToken, group.id);
      window.dispatchEvent(new CustomEvent("groups:changed"));
      onArchive();
    } catch (err) {
      const message = localizeApiError(err, "groups.failedArchiveGroup", t);
      setActionMessage({ kind: "error", text: message });
      setActionLoading(null);
    }
  }

  function getMemberName(member: GroupSummary["members"][number]) {
    return member.displayName || member.username;
  }

  return (
    <div
      data-testid="group-settings-modal"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 sm:pt-24"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t("groups.settings")}
    >
      <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("groups.settings")}</h2>
          <Button variant="icon" size="sm" onClick={onClose} aria-label={t("groups.closeSettings")}>
            <X size={18} />
          </Button>
        </div>

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

        {isOwner && (
          <form onSubmit={handleRename} className="mt-4 space-y-2">
            <label htmlFor="group-rename-input" className="block text-sm font-medium">
              {t("groups.renameGroup")}
            </label>
            <div className="flex gap-2">
              <Input
                id="group-rename-input"
                data-testid="group-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder={t("groups.groupNamePlaceholder")}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={renameLoading || !renameValue.trim() || renameValue.trim() === group.name}
              >
                {renameLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
              </Button>
            </div>
            {renameError && (
              <p className="text-xs text-destructive">{renameError}</p>
            )}
          </form>
        )}

        {isOwner && (
          <div className="mt-4">
            <label htmlFor="group-add-member-search" className="block text-sm font-medium">
              {t("groups.addMember")}
            </label>
            <div className="relative mt-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="group-add-member-search"
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
              <p className="mt-2 text-xs text-muted-foreground">{t("groups.noMembersFound")}</p>
            )}
            {searchResults.length > 0 && (
              <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border">
                {searchResults.map((u) => (
                  <li key={u.id} className="flex items-center justify-between px-3 py-2 hover:bg-accent">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar src={u.avatarUrl} name={u.displayName || u.username} size="sm" alt="" />
                      <span className="truncate text-sm">{u.displayName || u.username}</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      data-testid="group-add-member-button"
                      disabled={actionLoading === `add-${u.id}`}
                      onClick={() => handleAddMember(u.id)}
                    >
                      {actionLoading === `add-${u.id}` ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <>
                          <UserPlus size={14} className="mr-1" />
                          {t("channel.add")}
                        </>
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-5">
          <h3 className="text-sm font-medium">{t("groups.members")}</h3>
          <ul className="mt-2 space-y-1">
            {group.members.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar src={member.avatarUrl} name={getMemberName(member)} size="sm" alt="" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{getMemberName(member)}</p>
                    <p className="truncate text-xs text-muted-foreground">@{member.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={member.role === "OWNER" ? "warning" : "muted"}>
                    {member.role === "OWNER" ? t("groups.owner") : t("groups.member")}
                  </Badge>
                  {isOwner && member.id !== currentUserId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={actionLoading === `remove-${member.id}`}
                      onClick={() => handleRemoveMember(member.id)}
                      aria-label={t("groups.removeMember")}
                    >
                      {actionLoading === `remove-${member.id}` ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <UserMinus size={14} />
                      )}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
          {isOwner ? (
            <Button
              data-testid="group-archive-button"
              variant="danger"
              disabled={actionLoading === "archive"}
              onClick={handleArchive}
            >
              {actionLoading === "archive" ? (
                <Loader2 size={16} className="mr-1.5 animate-spin" />
              ) : (
                <Archive size={16} className="mr-1.5" />
              )}
              {t("groups.archiveGroup")}
            </Button>
          ) : (
            <Button
              data-testid="group-leave-button"
              variant="secondary"
              disabled={actionLoading === "leave"}
              onClick={handleLeave}
            >
              {actionLoading === "leave" ? (
                <Loader2 size={16} className="mr-1.5 animate-spin" />
              ) : (
                <LogOut size={16} className="mr-1.5" />
              )}
              {t("groups.leaveGroup")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
