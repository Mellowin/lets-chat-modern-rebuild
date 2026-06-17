"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale, translate, getLocale } from "@/lib/locale";
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
import { Users, FolderArchive, MessageSquare, AlertTriangle, Trash2 } from "lucide-react";

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
    async function loadPrimary(t: string, id: string) {
      setDetail({ kind: "loading" });
      setChannels({ kind: "loading" });
      try {
        const [wsData, chData] = await Promise.all([
          getWorkspace(t, id),
          getChannels(t, id),
        ]);
        if (!cancelled) {
          setDetail({ kind: "success", data: wsData });
          setChannels({ kind: "success", data: chData });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : translate(getLocale(), "workspace.errorLoadWorkspaceFailed");
        if (!cancelled) {
          setDetail({ kind: "error", message });
          setChannels({ kind: "error", message });
          if (message.toLowerCase().includes("workspace not found")) {
            window.dispatchEvent(new Event("workspaces:changed"));
            router.push("/dashboard");
          }
        }
      }
    }
    loadPrimary(accessToken, workspaceId);
    return () => { cancelled = true; };
  }, [isAuthenticated, accessToken, workspaceId, router]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId) return;
    if (!accessToken) return;

    let cancelled = false;
    async function loadMembers(t: string, id: string) {
      setMembers({ kind: "loading" });
      try {
        const memData = await getWorkspaceMembers(t, id);
        if (!cancelled) {
          setMembers({ kind: "success", data: memData });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : translate(getLocale(), "workspace.errorLoadMembersFailed");
        if (!cancelled) {
          setMembers({ kind: "error", message });
        }
      }
    }
    loadMembers(accessToken, workspaceId);
    return () => { cancelled = true; };
  }, [isAuthenticated, accessToken, workspaceId]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId) return;
    if (!accessToken) return;

    let cancelled = false;
    async function loadArchived(t: string, id: string) {
      setArchivedChannels({ kind: "loading" });
      try {
        const data = await getArchivedChannels(t, id);
        if (!cancelled) {
          setArchivedChannels({ kind: "success", data });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : translate(getLocale(), "workspace.errorLoadArchivedChannelsFailed");
        if (!cancelled) {
          setArchivedChannels({ kind: "error", message });
        }
      }
    }
    loadArchived(accessToken, workspaceId);
    return () => { cancelled = true; };
  }, [isAuthenticated, accessToken, workspaceId]);

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
      const message = err instanceof Error ? err.message : t("workspace.errorCreateChannelFailed");
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
      const message = err instanceof Error ? err.message : t("workspace.errorArchiveChannelFailed");
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
      setRestoreError(err instanceof Error ? err.message : t("workspace.errorRestoreChannelFailed"));
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
      setDeleteError(err instanceof Error ? err.message : t("workspace.errorDeleteChannelFailed"));
    } finally {
      setDeletingChannelId(null);
    }
  }

  async function handleDeleteWorkspace() {
    if (!accessToken || !workspaceId) return;
    setIsDeletingWorkspace(true);
    setDeleteWorkspaceError(null);
    try {
      await deleteWorkspace(accessToken, workspaceId);
      window.dispatchEvent(new Event("workspaces:changed"));
      router.push("/dashboard");
    } catch (err) {
      setDeleteWorkspaceError(err instanceof Error ? err.message : t("workspace.errorDeleteWorkspaceFailed"));
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
      const message = err instanceof Error ? err.message : t("workspace.errorAddMemberFailed");
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
      const message = err instanceof Error ? err.message : t("workspace.errorLeaveWorkspaceFailed");
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
      const message = err instanceof Error ? err.message : t("workspace.errorRemoveMemberFailed");
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
      const message = err instanceof Error ? err.message : t("workspace.errorUpdateRoleFailed");
      setUpdateRoleState({ kind: "error", message });
    } finally {
      setUpdatingRoleMemberId(null);
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          {t("auth.loadingSession")}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t("auth.authRequired")}</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t("auth.pleaseSignInWorkspace")}
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
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        {t("workspace.backToDashboard")}
      </Link>

      {detail.kind === "loading" && (
        <div className="mt-6 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          {t("workspace.loading")}
        </div>
      )}

      {detail.kind === "error" && (
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            {detail.message}
          </div>
        </div>
      )}

      {detail.kind === "success" && (
        <PageHeader
          title={detail.data.name}
          subtitle={detail.data.slug}
          className="mt-6"
          actions={
            myRole === "OWNER" ? (
              <Button
                variant="danger"
                size="sm"
                data-testid="workspace-delete-header-button"
                onClick={() => {
                  setIsDeleteWorkspaceDialogOpen(true);
                  setDeleteWorkspaceConfirmName("");
                  setDeleteWorkspaceError(null);
                }}
              >
                <Trash2 size={16} />
                {t("workspace.deleteWorkspace")}
              </Button>
            ) : undefined
          }
        />
      )}

      {accessToken && (
        <div className="mt-5">
          <WorkspaceMessageSearch workspaceId={workspaceId} accessToken={accessToken} />
        </div>
      )}

      {/* Create channel */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{t("workspace.createChannel")}</CardTitle>
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
                aria-label="Channel type"
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
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                {createChannelState.message}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Channel list */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("workspace.channels")}</CardTitle>
        </CardHeader>
        <CardContent>
          {channels.kind === "loading" && (
            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              {t("workspace.loadingChannels")}
            </div>
          )}

          {channels.kind === "error" && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                {channels.message}
              </div>
            </div>
          )}

          {channels.kind === "success" && channels.data.length === 0 && (
            <EmptyState icon={MessageSquare} title={t("workspace.noChannels")} />
          )}

          {archiveError && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                {archiveError}
              </div>
            </div>
          )}

          {deleteError && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                {deleteError}
              </div>
            </div>
          )}

          {channels.kind === "success" && channels.data.length > 0 && (
            <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
              {channels.data.map((ch) => (
                <li
                  key={ch.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 -mx-2 px-2 rounded-md transition-colors"
                >
                  <Link
                    href={`/workspaces/${workspaceId}/channels/${ch.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{ch.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {ch.slug}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {ch.description && (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate max-w-[12rem]">
                        {ch.description}
                      </span>
                    )}
                    {ch.createdById === user?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleArchiveChannel(e, ch.id, ch.name)}
                        className="text-amber-600 hover:bg-amber-500/10 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
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
                        className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
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
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("workspace.members")}</CardTitle>
        </CardHeader>
        <CardContent>
          {members.kind === "loading" && (
            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              {t("workspace.loadingMembers")}
            </div>
          )}

          {members.kind === "error" && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                {members.message}
              </div>
            </div>
          )}

          {members.kind === "success" && members.data.length === 0 && (
            <EmptyState icon={Users} title={t("workspace.noMembers")} />
          )}

          {members.kind === "success" && members.data.length > 0 && (
            (() => {
              const myRole = members.data.find((m) => m.user.id === user?.id)?.role;
              return (
                <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
                  {members.data.map((m) => {
                    const isSelf = m.user.id === user?.id;
                    const canRemove =
                      (myRole === "OWNER" && m.role !== "OWNER" && !isSelf) ||
                      (myRole === "ADMIN" && m.role === "MEMBER" && !isSelf);
                    const canUpdateRole = myRole === "OWNER" && m.role !== "OWNER" && !isSelf;
                    return (
                      <li key={m.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <MessageAuthor author={m.user} />
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {canRemove && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMember(m.id, m.user.displayName?.trim() || `@${m.user.username}`)}
                              disabled={removingMemberId === m.id}
                              className="text-destructive hover:text-destructive"
                            >
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
                              {m.role === "OWNER" ? t("workspace.owner") : m.role === "ADMIN" ? t("workspace.admin") : t("workspace.member")}
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
                  <form onSubmit={handleAddMember} className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-2">
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
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                      <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        {addMemberState.message}
                      </div>
                    </div>
                  )}

                  {addMemberState.kind === "error" && (
                    <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium text-destructive">
                        <span className="h-2 w-2 rounded-full bg-destructive" />
                        {addMemberState.message}
                      </div>
                    </div>
                  )}
                </>
              ) : null;
            })()
          )}

          {members.kind === "success" && removeMemberState.kind === "success" && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {removeMemberState.message}
              </div>
            </div>
          )}

          {members.kind === "success" && removeMemberState.kind === "error" && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                {removeMemberState.message}
              </div>
            </div>
          )}

          {members.kind === "success" && updateRoleState.kind === "success" && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {updateRoleState.message}
              </div>
            </div>
          )}

          {members.kind === "success" && updateRoleState.kind === "error" && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                {updateRoleState.message}
              </div>
            </div>
          )}

          {members.kind === "success" && (
            (() => {
              const myRole = members.data.find((m) => m.user.id === user?.id)?.role;
              const canLeave = myRole === "MEMBER" || myRole === "ADMIN";
              return canLeave ? (
                <div className="mt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLeaveWorkspace}
                    className="text-destructive hover:text-destructive"
                  >
                    {t("workspace.leaveWorkspace")}
                  </Button>
                  {leaveError && (
                    <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-[10px]">
                      <div className="flex items-center gap-1 font-medium text-destructive">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                        {leaveError}
                      </div>
                    </div>
                  )}
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
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("workspace.archivedChannels")}</CardTitle>
        </CardHeader>
        <CardContent>
          {archivedChannels.kind === "loading" && (
            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              {t("workspace.loadingArchived")}
            </div>
          )}

          {archivedChannels.kind === "error" && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                {archivedChannels.message}
              </div>
            </div>
          )}

          {archivedChannels.kind === "success" && archivedChannels.data.length === 0 && (
            <EmptyState icon={FolderArchive} title={t("workspace.noArchivedChannels")} />
          )}

          {restoreError && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                {restoreError}
              </div>
            </div>
          )}

          {archivedChannels.kind === "success" && archivedChannels.data.length > 0 && (
            <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
              {archivedChannels.data.map((ch) => (
                <li key={ch.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 -mx-2 px-2 rounded-md transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{ch.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{ch.slug}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {ch.createdById === user?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestoreChannel(ch.id, ch.name)}
                        disabled={restoringChannelId === ch.id}
                        className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
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
                        className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
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
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm" data-testid="workspace-danger-zone">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} />
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
                {deleteWorkspaceError && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium text-destructive">
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                      {deleteWorkspaceError}
                    </div>
                  </div>
                )}
                <div className="flex flex-col-reverse sm:flex-row gap-2">
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
