"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { getWorkspace, getWorkspaceMembers, leaveWorkspace, removeWorkspaceMember, updateWorkspaceMemberRole, deleteWorkspace, type Workspace, type WorkspaceMember } from "@/lib/workspaces-api";
import { MessageAuthor } from "@/components/MessageAuthor";
import { createWorkspaceInvite } from "@/lib/invites-api";
import WorkspaceInvitesSection from "@/components/WorkspaceInvitesSection";
import WorkspaceMessageSearch from "@/components/WorkspaceMessageSearch";
import { getChannels, getArchivedChannels, createChannel, archiveChannel, restoreChannel, deleteChannel, type Channel, type CreateChannelInput } from "@/lib/channels-api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Users, FolderArchive, MessageSquare, AlertTriangle, Trash2, Hash, Lock, ArrowLeft, LogOut, UserX, Shield, Loader2 } from "lucide-react";

type DetailState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Workspace }
  | { kind: "error"; message: string };

type ChannelsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Channel[] }
  | { kind: "error"; message: string };

type MembersState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: WorkspaceMember[] }
  | { kind: "error"; message: string };

type ArchivedChannelsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Channel[] }
  | { kind: "error"; message: string };

function ErrorAlert({ message, className = "" }: { message: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm ${className}`}>
      <div className="flex items-center gap-2 font-medium text-destructive">
        <span className="h-2 w-2 rounded-full bg-destructive" />
        {message}
      </div>
    </div>
  );
}

function SuccessAlert({ message, className = "" }: { message: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30 ${className}`}>
      <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {message}
      </div>
    </div>
  );
}

export default function WorkspaceDetailPage() {
  const params = useParams();
  const workspaceId = typeof params.workspaceId === "string" ? params.workspaceId : "";
  const { accessToken, isLoading: authLoading, isAuthenticated, user } = useAuth();
  const [detail, setDetail] = useState<DetailState>({ kind: "idle" });
  const [channels, setChannels] = useState<ChannelsState>({ kind: "idle" });
  const [members, setMembers] = useState<MembersState>({ kind: "idle" });
  const [memberIdentifier, setMemberIdentifier] = useState("");
  const [memberRole, setMemberRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [addMemberState, setAddMemberState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [channelName, setChannelName] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [channelType, setChannelType] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [createChannelState, setCreateChannelState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archivedChannels, setArchivedChannels] = useState<ArchivedChannelsState>({ kind: "idle" });
  const [restoringChannelId, setRestoringChannelId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [removeMemberState, setRemoveMemberState] = useState<
    | { kind: "idle" }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [updatingRoleMemberId, setUpdatingRoleMemberId] = useState<string | null>(null);
  const [updateRoleState, setUpdateRoleState] = useState<
    | { kind: "idle" }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [isDeleteWorkspaceDialogOpen, setIsDeleteWorkspaceDialogOpen] = useState(false);
  const [deleteWorkspaceConfirmName, setDeleteWorkspaceConfirmName] = useState("");
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
  const [deleteWorkspaceError, setDeleteWorkspaceError] = useState<string | null>(null);
  const router = useRouter();
  const { t } = useLocale();

  const myRole = members.kind === "success" ? members.data.find((m) => m.user.id === user?.id)?.role : undefined;
  const canManageMembers = myRole === "OWNER" || myRole === "ADMIN";

  useEffect(() => {
    if (!isAuthenticated || !workspaceId) return;
    if (!accessToken) return;

    let cancelled = false;
    async function loadPrimary(token: string, id: string) {
      setDetail({ kind: "loading" });
      setChannels({ kind: "loading" });
      try {
        const [wsData, chData] = await Promise.all([
          getWorkspace(token, id),
          getChannels(token, id),
        ]);
        if (!cancelled) {
          setDetail({ kind: "success", data: wsData });
          setChannels({ kind: "success", data: chData });
        }
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : "";
        const message = localizeApiError(err, "workspace.errorLoadWorkspaceFailed", t);
        if (!cancelled) {
          setDetail({ kind: "error", message });
          setChannels({ kind: "error", message });
          if (rawMessage.toLowerCase().includes("workspace not found")) {
            window.dispatchEvent(new Event("workspaces:changed"));
            router.push("/dashboard");
          }
        }
      }
    }
    loadPrimary(accessToken, workspaceId);
    return () => { cancelled = true; };
  }, [isAuthenticated, accessToken, workspaceId, router, t]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId) return;
    if (!accessToken) return;

    let cancelled = false;
    async function loadMembers(token: string, id: string) {
      setMembers({ kind: "loading" });
      try {
        const memData = await getWorkspaceMembers(token, id);
        if (!cancelled) {
          setMembers({ kind: "success", data: memData });
        }
      } catch (err) {
        const message = localizeApiError(err, "workspace.errorLoadMembersFailed", t);
        if (!cancelled) {
          setMembers({ kind: "error", message });
        }
      }
    }
    loadMembers(accessToken, workspaceId);
    return () => { cancelled = true; };
  }, [isAuthenticated, accessToken, workspaceId, t]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId) return;
    if (!accessToken) return;

    let cancelled = false;
    async function loadArchived(token: string, id: string) {
      setArchivedChannels({ kind: "loading" });
      try {
        const data = await getArchivedChannels(token, id);
        if (!cancelled) {
          setArchivedChannels({ kind: "success", data });
        }
      } catch (err) {
        const message = localizeApiError(err, "workspace.errorLoadArchivedChannelsFailed", t);
        if (!cancelled) {
          setArchivedChannels({ kind: "error", message });
        }
      }
    }
    loadArchived(accessToken, workspaceId);
    return () => { cancelled = true; };
  }, [isAuthenticated, accessToken, workspaceId, t]);

  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = channelName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setCreateChannelState({ kind: "error", message: t("workspace.errorChannelNameTooShort") });
      return;
    }
    if (!accessToken || !workspaceId) return;

    setCreateChannelState({ kind: "loading" });
    try {
      const input: CreateChannelInput = {
        name: trimmedName,
        description: channelDescription.trim() || undefined,
        type: channelType,
      };
      await createChannel(accessToken, workspaceId, input);
      setChannelName("");
      setChannelDescription("");
      setChannelType("PUBLIC");
      setCreateChannelState({ kind: "idle" });
      // refresh channel list
      const refreshed = await getChannels(accessToken, workspaceId);
      setChannels({ kind: "success", data: refreshed });
      window.dispatchEvent(new Event("channels:changed"));
    } catch (err) {
      const message = localizeApiError(err, "workspace.errorCreateChannelFailed", t);
      setCreateChannelState({ kind: "error", message });
    }
  }

  async function handleArchiveChannel(e: React.MouseEvent, channelId: string, name: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`${t("workspace.confirmArchiveChannelPrefix")} "${name}"?\n${t("workspace.confirmArchiveChannelBody")}`)) {
      return;
    }
    if (!accessToken || !workspaceId) return;
    setArchiveError(null);
    try {
      await archiveChannel(accessToken, workspaceId, channelId);
      const [active, archived] = await Promise.all([
        getChannels(accessToken, workspaceId),
        getArchivedChannels(accessToken, workspaceId),
      ]);
      setChannels({ kind: "success", data: active });
      setArchivedChannels({ kind: "success", data: archived });
      window.dispatchEvent(new Event("channels:changed"));
    } catch (err) {
      const message = localizeApiError(err, "workspace.errorArchiveChannelFailed", t);
      setArchiveError(message);
    }
  }

  async function handleRestoreChannel(channelId: string, name: string) {
    if (!window.confirm(`${t("workspace.confirmRestoreChannelPrefix")} "${name}"?`)) return;
    if (!accessToken || !workspaceId) return;
    setRestoringChannelId(channelId);
    setRestoreError(null);
    try {
      await restoreChannel(accessToken, workspaceId, channelId);
      const [active, archived] = await Promise.all([
        getChannels(accessToken, workspaceId),
        getArchivedChannels(accessToken, workspaceId),
      ]);
      setChannels({ kind: "success", data: active });
      setArchivedChannels({ kind: "success", data: archived });
      window.dispatchEvent(new Event("channels:changed"));
    } catch (err) {
      setRestoreError(localizeApiError(err, "workspace.errorRestoreChannelFailed", t));
    } finally {
      setRestoringChannelId(null);
    }
  }

  async function handleDeleteChannel(channelId: string, name: string) {
    if (!window.confirm(`${t("workspace.confirmDeleteChannelPrefix")} "${name}"?\n${t("workspace.confirmDeleteChannelBody")}`)) {
      return;
    }
    if (!accessToken || !workspaceId) return;
    setDeletingChannelId(channelId);
    setDeleteError(null);
    try {
      await deleteChannel(accessToken, workspaceId, channelId);
      const [active, archived] = await Promise.all([
        getChannels(accessToken, workspaceId),
        getArchivedChannels(accessToken, workspaceId),
      ]);
      setChannels({ kind: "success", data: active });
      setArchivedChannels({ kind: "success", data: archived });
      window.dispatchEvent(new Event("channels:changed"));
    } catch (err) {
      setDeleteError(localizeApiError(err, "workspace.errorDeleteChannelFailed", t));
    } finally {
      setDeletingChannelId(null);
    }
  }

  async function handleDeleteWorkspace() {
    if (!accessToken || !workspaceId) return;
    if (detail.kind !== "success") return;
    if (!window.confirm(t("workspace.confirmDeleteWorkspace", detail.data.name))) {
      return;
    }
    setIsDeletingWorkspace(true);
    setDeleteWorkspaceError(null);
    try {
      await deleteWorkspace(accessToken, workspaceId);
      window.dispatchEvent(new Event("workspaces:changed"));
      router.push("/dashboard");
    } catch (err) {
      setDeleteWorkspaceError(localizeApiError(err, "workspace.errorDeleteWorkspaceFailed", t));
      setIsDeletingWorkspace(false);
    }
  }

  function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = memberIdentifier.trim();
    if (!trimmed) {
      setAddMemberState({ kind: "error", message: t("workspace.errorEnterUsernameOrEmail") });
      return;
    }
    if (!accessToken || !workspaceId) return;

    setAddMemberState({ kind: "loading" });
    try {
      if (looksLikeEmail(trimmed)) {
        await createWorkspaceInvite(accessToken, workspaceId, { email: trimmed, role: memberRole });
      } else {
        await createWorkspaceInvite(accessToken, workspaceId, { identifier: trimmed, role: memberRole });
      }
      setMemberIdentifier("");
      setMemberRole("MEMBER");
      setAddMemberState({ kind: "success", message: t("workspace.invitationSent") });
    } catch (err) {
      const message = localizeApiError(err, "workspace.errorAddMemberFailed", t);
      setAddMemberState({ kind: "error", message });
    }
  }

  async function handleLeaveWorkspace() {
    if (!window.confirm(`${t("workspace.confirmLeaveWorkspacePrefix")} "${detail.kind === "success" ? detail.data.name : t("workspace.fallbackThisWorkspace")}"?`)) {
      return;
    }
    if (!accessToken || !workspaceId) return;
    setLeaveError(null);
    try {
      await leaveWorkspace(accessToken, workspaceId);
      window.dispatchEvent(new Event("workspaces:changed"));
      router.push("/dashboard");
    } catch (err) {
      const message = localizeApiError(err, "workspace.errorLeaveWorkspaceFailed", t);
      setLeaveError(message);
    }
  }

  async function handleRemoveMember(memberId: string, displayName: string) {
    if (!window.confirm(`${t("workspace.confirmRemoveMemberPrefix")} "${displayName}" ${t("workspace.confirmRemoveMemberSuffix")}`)) return;
    if (!accessToken || !workspaceId) return;
    setRemovingMemberId(memberId);
    setRemoveMemberState({ kind: "idle" });
    try {
      await removeWorkspaceMember(accessToken, workspaceId, memberId);
      setMembers((prev) => {
        if (prev.kind !== "success") return prev;
        return { kind: "success", data: prev.data.filter((m) => m.id !== memberId) };
      });
      setRemoveMemberState({ kind: "success", message: t("workspace.memberRemoved") });
    } catch (err) {
      const message = localizeApiError(err, "workspace.errorRemoveMemberFailed", t);
      setRemoveMemberState({ kind: "error", message });
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleUpdateRole(memberId: string, newRole: "ADMIN" | "MEMBER", displayName: string) {
    const roleLabel = newRole === "ADMIN" ? t("workspace.admin") : t("workspace.member");
    if (!window.confirm(t("workspace.confirmChangeRole", displayName, roleLabel))) return;
    if (!accessToken || !workspaceId) return;
    setUpdatingRoleMemberId(memberId);
    setUpdateRoleState({ kind: "idle" });
    try {
      const updated = await updateWorkspaceMemberRole(accessToken, workspaceId, memberId, newRole);
      setMembers((prev) => {
        if (prev.kind !== "success") return prev;
        return { kind: "success", data: prev.data.map((m) => (m.id === memberId ? updated : m)) };
      });
      setUpdateRoleState({ kind: "success", message: t("workspace.roleUpdated") });
    } catch (err) {
      const message = localizeApiError(err, "workspace.errorUpdateRoleFailed", t);
      setUpdateRoleState({ kind: "error", message });
    } finally {
      setUpdatingRoleMemberId(null);
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
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
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("auth.pleaseSignInWorkspace")}</p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {t("auth.signIn")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-5 sm:p-8 lg:p-10 max-w-3xl">
      <Link
        href="/dashboard"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card/80 px-3 py-1.5 text-sm text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <ArrowLeft size={14} aria-hidden />
        {t("workspace.backToDashboard")}
      </Link>

      {detail.kind === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("workspace.loading")}
        </div>
      )}

      {detail.kind === "error" && (
        <ErrorAlert message={detail.message} />
      )}

      {detail.kind === "success" && (
        <PageHeader
          title={detail.data.name}
          subtitle={detail.data.slug}
          className=""
        />
      )}

      {accessToken && (
        <div className="">
          <WorkspaceMessageSearch workspaceId={workspaceId} accessToken={accessToken} />
        </div>
      )}

      {/* Create channel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquare size={16} aria-hidden />
            </div>
            {t("workspace.createChannel")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateChannel} className="flex flex-col gap-3">
            <Input
              id="channel-name"
              name="channel-name"
              type="text"
              placeholder={t("workspace.channelName")}
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              aria-label={t("workspace.channelName")}
            />
            <Input
              id="channel-description"
              name="channel-description"
              type="text"
              placeholder={t("workspace.channelDescription")}
              value={channelDescription}
              onChange={(e) => setChannelDescription(e.target.value)}
              aria-label={t("workspace.channelDescription")}
            />
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Select
                id="channel-type"
                name="channel-type"
                value={channelType}
                onChange={(e) => setChannelType(e.target.value as "PUBLIC" | "PRIVATE")}
                aria-label={t("workspace.channelType")}
                className="w-40"
              >
                <option value="PUBLIC">{t("workspace.publicChannel")}</option>
                <option value="PRIVATE">{t("workspace.privateChannel")}</option>
              </Select>
              <Button type="submit" disabled={createChannelState.kind === "loading"}>
                {createChannelState.kind === "loading" ? t("workspace.creating") : t("workspace.create")}
              </Button>
            </div>
          </form>
          {createChannelState.kind === "error" && (
            <ErrorAlert message={createChannelState.message} className="mt-3" />
          )}
        </CardContent>
      </Card>

      {/* Channel list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Hash size={16} aria-hidden />
            </div>
            {t("workspace.channels")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {channels.kind === "loading" && (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("workspace.loadingChannels")}
            </div>
          )}

          {channels.kind === "error" && (
            <ErrorAlert message={channels.message} />
          )}

          {channels.kind === "success" && channels.data.length === 0 && (
            <EmptyState icon={MessageSquare} title={t("workspace.noChannels")} />
          )}

          {archiveError && <ErrorAlert message={archiveError} />}
          {deleteError && <ErrorAlert message={deleteError} />}

          {channels.kind === "success" && channels.data.length > 0 && (
            <ul className="flex flex-col gap-2">
              {channels.data.map((ch) => (
                <li
                  key={ch.id}
                  className="group flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3 shadow-sm transition-all hover:bg-accent/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <Link
                    href={`/workspaces/${workspaceId}/channels/${ch.id}`}
                    className="flex min-w-0 items-center gap-2.5"
                  >
                    <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {ch.type === "PUBLIC" ? <Hash size={16} aria-hidden /> : <Lock size={16} aria-hidden />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{ch.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{ch.slug}</p>
                    </div>
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    {ch.description && (
                      <span className="max-w-[12rem] truncate text-xs text-muted-foreground">
                        {ch.description}
                      </span>
                    )}
                    {ch.createdById === user?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleArchiveChannel(e, ch.id, ch.name)}
                        className="text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                      >
                        {t("workspace.archive")}
                      </Button>
                    )}
                    {myRole === "OWNER" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteChannel(ch.id, ch.name)}
                        disabled={deletingChannelId === ch.id}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        {deletingChannelId === ch.id ? t("workspace.deleting") : t("workspace.delete")}
                      </Button>
                    )}
                    <Badge variant={ch.type === "PUBLIC" ? "success" : "warning"}>
                      {ch.type === "PUBLIC" ? t("workspace.publicChannel") : t("workspace.privateChannel")}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Users size={16} aria-hidden />
            </div>
            {t("workspace.members")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {members.kind === "loading" && (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("workspace.loadingMembers")}
            </div>
          )}

          {members.kind === "error" && (
            <ErrorAlert message={members.message} />
          )}

          {members.kind === "success" && members.data.length === 0 && (
            <EmptyState icon={Users} title={t("workspace.noMembers")} />
          )}

          {members.kind === "success" && members.data.length > 0 && (
            (() => {
              const myRole = members.data.find((m) => m.user.id === user?.id)?.role;
              return (
                <ul className="flex flex-col gap-2">
                  {members.data.map((m) => {
                    const isSelf = m.user.id === user?.id;
                    const canRemove =
                      (myRole === "OWNER" && m.role !== "OWNER" && !isSelf) ||
                      (myRole === "ADMIN" && m.role === "MEMBER" && !isSelf);
                    const canUpdateRole = myRole === "OWNER" && m.role !== "OWNER" && !isSelf;
                    return (
                      <li
                        key={m.id}
                        className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <MessageAuthor author={m.user} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                          {canRemove && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMember(m.id, m.user.displayName?.trim() || `@${m.user.username}`)}
                              disabled={removingMemberId === m.id}
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <UserX size={14} aria-hidden />
                              {removingMemberId === m.id ? t("workspace.removing") : t("workspace.remove")}
                            </Button>
                          )}
                          {canUpdateRole ? (
                            <Select
                              id={`workspace-member-role-${m.id}`}
                              name="workspace-member-role"
                              value={m.role}
                              onChange={(e) => handleUpdateRole(m.id, e.target.value as "ADMIN" | "MEMBER", m.user.displayName?.trim() || `@${m.user.username}`)}
                              disabled={updatingRoleMemberId === m.id}
                              aria-label={t("workspace.changeRole")}
                              className="w-28"
                            >
                              <option value="MEMBER">{t("workspace.member")}</option>
                              <option value="ADMIN">{t("workspace.admin")}</option>
                            </Select>
                          ) : (
                            <Badge variant={m.role === "OWNER" ? "default" : m.role === "ADMIN" ? "info" : "muted"}>
                              {m.role === "OWNER" ? (
                                <span className="inline-flex items-center gap-1">
                                  <Shield size={11} aria-hidden />
                                  {t("workspace.owner")}
                                </span>
                              ) : m.role === "ADMIN" ? t("workspace.admin") : t("workspace.member")}
                            </Badge>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              );
            })()
          )}

          {members.kind === "success" && (
            (() => {
              const myRole = members.data.find((m) => m.user.id === user?.id)?.role;
              const canManageMembers = myRole === "OWNER" || myRole === "ADMIN";
              return canManageMembers ? (
                <>
                  <form onSubmit={handleAddMember} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      id="invite-username-or-email"
                      name="invite-username-or-email"
                      type="text"
                      placeholder={t("workspace.invitePlaceholder")}
                      value={memberIdentifier}
                      onChange={(e) => setMemberIdentifier(e.target.value)}
                      aria-label={t("workspace.invitePlaceholder")}
                      className="flex-1"
                    />
                    {myRole === "OWNER" && (
                      <Select
                        id="workspace-invite-role"
                        name="workspace-invite-role"
                        data-testid="workspace-invite-role"
                        value={memberRole}
                        onChange={(e) => setMemberRole(e.target.value as "MEMBER" | "ADMIN")}
                        aria-label={t("workspace.inviteRole")}
                        className="w-28"
                      >
                        <option value="MEMBER">{t("workspace.member")}</option>
                        <option value="ADMIN">{t("workspace.admin")}</option>
                      </Select>
                    )}
                    <Button type="submit" disabled={addMemberState.kind === "loading"}>
                      {addMemberState.kind === "loading" ? t("workspace.addingMember") : t("workspace.addMember")}
                    </Button>
                  </form>

                  {addMemberState.kind === "success" && (
                    <SuccessAlert message={addMemberState.message} />
                  )}

                  {addMemberState.kind === "error" && (
                    <ErrorAlert message={addMemberState.message} />
                  )}
                </>
              ) : null;
            })()
          )}

          {members.kind === "success" && removeMemberState.kind === "success" && (
            <SuccessAlert message={removeMemberState.message} />
          )}

          {members.kind === "success" && removeMemberState.kind === "error" && (
            <ErrorAlert message={removeMemberState.message} />
          )}

          {members.kind === "success" && updateRoleState.kind === "success" && (
            <SuccessAlert message={updateRoleState.message} />
          )}

          {members.kind === "success" && updateRoleState.kind === "error" && (
            <ErrorAlert message={updateRoleState.message} />
          )}

          {members.kind === "success" && (
            (() => {
              const myRole = members.data.find((m) => m.user.id === user?.id)?.role;
              const canLeave = myRole === "MEMBER" || myRole === "ADMIN";
              return canLeave ? (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLeaveWorkspace}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut size={14} aria-hidden />
                    {t("workspace.leaveWorkspace")}
                  </Button>
                  {leaveError && <ErrorAlert message={leaveError} className="mt-2" />}
                </div>
              ) : null;
            })()
          )}
        </CardContent>
      </Card>

      {accessToken && (
        <WorkspaceInvitesSection
          workspaceId={workspaceId}
          accessToken={accessToken}
          canManage={canManageMembers}
        />
      )}

      {/* Archived channels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FolderArchive size={16} aria-hidden />
            </div>
            {t("workspace.archivedChannels")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {archivedChannels.kind === "loading" && (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("workspace.loadingArchived")}
            </div>
          )}

          {archivedChannels.kind === "error" && (
            <ErrorAlert message={archivedChannels.message} />
          )}

          {archivedChannels.kind === "success" && archivedChannels.data.length === 0 && (
            <EmptyState icon={FolderArchive} title={t("workspace.noArchivedChannels")} />
          )}

          {restoreError && <ErrorAlert message={restoreError} />}

          {archivedChannels.kind === "success" && archivedChannels.data.length > 0 && (
            <ul className="flex flex-col gap-2">
              {archivedChannels.data.map((ch) => (
                <li
                  key={ch.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      {ch.type === "PUBLIC" ? <Hash size={16} aria-hidden /> : <Lock size={16} aria-hidden />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-muted-foreground">{ch.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{ch.slug}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    {ch.createdById === user?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestoreChannel(ch.id, ch.name)}
                        disabled={restoringChannelId === ch.id}
                        className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                      >
                        {restoringChannelId === ch.id ? t("workspace.restoring") : t("workspace.restore")}
                      </Button>
                    )}
                    {myRole === "OWNER" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteChannel(ch.id, ch.name)}
                        disabled={deletingChannelId === ch.id}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        {deletingChannelId === ch.id ? t("workspace.deleting") : t("workspace.delete")}
                      </Button>
                    )}
                    <Badge variant={ch.type === "PUBLIC" ? "success" : "warning"}>
                      {ch.type === "PUBLIC" ? t("workspace.publicChannel") : t("workspace.privateChannel")}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {myRole === "OWNER" && detail.kind === "success" && (
        <Card
          className="border-destructive/25 bg-gradient-to-br from-destructive/5 via-card to-destructive/[0.03] shadow-sm"
          data-testid="workspace-danger-zone"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10">
                <AlertTriangle size={16} />
              </div>
              {t("workspace.dangerZone")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!isDeleteWorkspaceDialogOpen ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("workspace.deleteWorkspaceDescription")}
                </p>
                <Button
                  variant="danger"
                  data-testid="workspace-delete-danger-button"
                  onClick={() => {
                    setIsDeleteWorkspaceDialogOpen(true);
                    setDeleteWorkspaceConfirmName("");
                    setDeleteWorkspaceError(null);
                  }}
                >
                  <Trash2 size={16} />
                  {t("workspace.deleteWorkspace")}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
                  <p className="font-medium text-destructive">
                    {t("workspace.deleteWorkspaceConfirmPrefix")}: {detail.data.name}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {t("workspace.deleteWorkspaceConfirmBody")}
                  </p>
                </div>
                <Input
                  value={deleteWorkspaceConfirmName}
                  onChange={(e) => setDeleteWorkspaceConfirmName(e.target.value)}
                  placeholder={t("workspace.deleteWorkspaceInputPlaceholder")}
                  className="border-destructive/30"
                />
                {deleteWorkspaceError && <ErrorAlert message={deleteWorkspaceError} />}
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button
                    variant="secondary"
                    onClick={() => setIsDeleteWorkspaceDialogOpen(false)}
                    disabled={isDeletingWorkspace}
                    className="w-full sm:w-auto"
                  >
                    {t("channel.cancel")}
                  </Button>
                  <Button
                    variant="danger"
                    data-testid="workspace-delete-confirm-button"
                    onClick={handleDeleteWorkspace}
                    disabled={
                      isDeletingWorkspace ||
                      deleteWorkspaceConfirmName.trim() !== detail.data.name.trim()
                    }
                    className="w-full sm:w-auto"
                  >
                    {isDeletingWorkspace ? t("workspace.deletingWorkspace") : t("workspace.deleteWorkspace")}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
