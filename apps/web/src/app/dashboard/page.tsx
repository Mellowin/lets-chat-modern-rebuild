"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getWorkspaces,
  createWorkspace,
  archiveWorkspace,
  listArchivedWorkspaces,
  restoreWorkspace,
  type Workspace,
} from "@/lib/workspaces-api";
import {
  getPendingInvites,
  acceptInvite,
  declineInvite,
  type PendingInvite,
} from "@/lib/invites-api";
import {
  getPendingChannelInvites,
  acceptChannelInvite,
  declineChannelInvite,
  type PendingChannelInvite,
} from "@/lib/channel-invites-api";
import { slugify } from "@/lib/transliterate";
import { useLocale, translate, getLocale } from "@/lib/locale";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Loader2,
  Plus,
  Inbox,
  Mail,
  Building2,
  Archive,
  Settings,
} from "lucide-react";

type WorkspacesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Workspace[] }
  | { kind: "error"; message: string };

type CreateState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

type InvitesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: PendingInvite[] }
  | { kind: "error"; message: string };

type ChannelInvitesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: PendingChannelInvite[] }
  | { kind: "error"; message: string };

type ArchivedWorkspacesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Workspace[] }
  | { kind: "error"; message: string };

function ErrorAlert({
  message,
  className = "",
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm ${className}`}
    >
      <div className="flex items-center gap-2 font-medium text-destructive">
        <span className="h-2 w-2 rounded-full bg-destructive" />
        {message}
      </div>
    </div>
  );
}

function Spinner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
      <Loader2 className="h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}

export default function DashboardPage() {
  const { user, accessToken, isLoading: authLoading, isAuthenticated } = useAuth();
  const { t } = useLocale();
  const [workspaces, setWorkspaces] = useState<WorkspacesState>({ kind: "idle" });
  const [createState, setCreateState] = useState<CreateState>({ kind: "idle" });
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const router = useRouter();
  const [invites, setInvites] = useState<InvitesState>({ kind: "idle" });
  const [inviteActionError, setInviteActionError] = useState<string | null>(null);
  const [channelInvites, setChannelInvites] = useState<ChannelInvitesState>({
    kind: "idle",
  });
  const [channelInviteActionError, setChannelInviteActionError] = useState<string | null>(
    null
  );
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<ArchivedWorkspacesState>({
    kind: "idle",
  });
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async (token: string) => {
    setWorkspaces({ kind: "loading" });
    try {
      const data = await getWorkspaces(token);
      setWorkspaces({ kind: "success", data });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : translate(getLocale(), "dashboard.errorLoadWorkspacesFailed");
      setWorkspaces({ kind: "error", message });
    }
  }, []);

  const loadPendingInvites = useCallback(async (token: string) => {
    setInvites({ kind: "loading" });
    try {
      const data = await getPendingInvites(token);
      setInvites({ kind: "success", data });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : translate(getLocale(), "dashboard.errorLoadInvitesFailed");
      setInvites({ kind: "error", message });
    }
  }, []);

  const loadPendingChannelInvites = useCallback(async (token: string) => {
    setChannelInvites({ kind: "loading" });
    try {
      const data = await getPendingChannelInvites(token);
      setChannelInvites({ kind: "success", data });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : translate(getLocale(), "dashboard.errorLoadChannelInvitesFailed");
      setChannelInvites({ kind: "error", message });
    }
  }, []);

  const loadArchivedWorkspaces = useCallback(async (token: string) => {
    setArchivedWorkspaces({ kind: "loading" });
    try {
      const data = await listArchivedWorkspaces(token);
      setArchivedWorkspaces({ kind: "success", data });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : translate(getLocale(), "dashboard.errorLoadArchivedWorkspacesFailed");
      setArchivedWorkspaces({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!accessToken) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWorkspaces(accessToken);
    loadPendingInvites(accessToken);
    loadPendingChannelInvites(accessToken);
    loadArchivedWorkspaces(accessToken);
  }, [
    isAuthenticated,
    accessToken,
    loadWorkspaces,
    loadPendingInvites,
    loadPendingChannelInvites,
    loadArchivedWorkspaces,
  ]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName) {
      setCreateState({ kind: "error", message: t("dashboard.errorNameRequired") });
      return;
    }
    if (!accessToken) return;

    setCreateState({ kind: "loading" });
    try {
      const input: { name: string; slug?: string } = { name: trimmedName };
      const processedSlug = slugify(trimmedSlug || trimmedName);
      if (processedSlug.length >= 3) input.slug = processedSlug;
      await createWorkspace(accessToken, input);
      setName("");
      setSlug("");
      setCreateState({ kind: "idle" });
      await loadWorkspaces(accessToken);
      window.dispatchEvent(new Event("workspaces:changed"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("dashboard.errorCreateWorkspaceFailed");
      setCreateState({ kind: "error", message });
    }
  }

  async function handleArchiveWorkspace(
    e: React.MouseEvent,
    workspaceId: string,
    wsName: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !window.confirm(
        `${t("dashboard.confirmArchiveWorkspacePrefix")} "${wsName}"?\n${t("dashboard.confirmArchiveWorkspaceBody")}`
      )
    ) {
      return;
    }
    if (!accessToken) return;
    setArchiveError(null);
    try {
      await archiveWorkspace(accessToken, workspaceId);
      await loadWorkspaces(accessToken);
      window.dispatchEvent(new Event("workspaces:changed"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("dashboard.errorArchiveWorkspaceFailed");
      setArchiveError(message);
    }
  }

  async function handleAcceptInvite(inviteId: string, workspaceId: string) {
    if (!accessToken) return;
    setInviteActionError(null);
    try {
      await acceptInvite(accessToken, inviteId);
      await loadPendingInvites(accessToken);
      await loadWorkspaces(accessToken);
      window.dispatchEvent(new Event("workspaces:changed"));
      router.push(`/workspaces/${workspaceId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("dashboard.errorAcceptInviteFailed");
      setInviteActionError(message);
    }
  }

  async function handleDeclineInvite(inviteId: string) {
    if (!window.confirm(t("dashboard.confirmDeclineInvitation"))) return;
    if (!accessToken) return;
    setInviteActionError(null);
    try {
      await declineInvite(accessToken, inviteId);
      await loadPendingInvites(accessToken);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("dashboard.errorDeclineInviteFailed");
      setInviteActionError(message);
    }
  }

  async function handleAcceptChannelInvite(
    inviteId: string,
    workspaceId: string,
    channelId: string
  ) {
    if (!accessToken) return;
    setChannelInviteActionError(null);
    try {
      await acceptChannelInvite(accessToken, inviteId);
      await loadPendingChannelInvites(accessToken);
      window.dispatchEvent(new Event("channels:changed"));
      router.push(`/workspaces/${workspaceId}/channels/${channelId}`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("dashboard.errorAcceptChannelInviteFailed");
      setChannelInviteActionError(message);
    }
  }

  async function handleDeclineChannelInvite(inviteId: string) {
    if (!window.confirm(t("dashboard.confirmDeclineChannelInvitation"))) return;
    if (!accessToken) return;
    setChannelInviteActionError(null);
    try {
      await declineChannelInvite(accessToken, inviteId);
      await loadPendingChannelInvites(accessToken);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("dashboard.errorDeclineChannelInviteFailed");
      setChannelInviteActionError(message);
    }
  }

  async function handleRestoreWorkspace(
    e: React.MouseEvent,
    workspaceId: string,
    wsName: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`${t("dashboard.confirmRestoreWorkspacePrefix")} "${wsName}"?`)) {
      return;
    }
    if (!accessToken) return;
    setRestoreError(null);
    try {
      await restoreWorkspace(accessToken, workspaceId);
      await loadWorkspaces(accessToken);
      await loadArchivedWorkspaces(accessToken);
      window.dispatchEvent(new Event("workspaces:changed"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("dashboard.errorRestoreWorkspaceFailed");
      setRestoreError(message);
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <Spinner text={t("auth.loadingSession")} />
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
            <p className="text-sm text-muted-foreground">
              {t("auth.pleaseSignInDashboard")}
            </p>
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
    <div className="flex flex-col gap-6 p-6 sm:p-10 max-w-3xl">
      <PageHeader
        title={`${t("dashboard.welcome")}, ${user?.displayName || user?.username}`}
        subtitle={`${t("dashboard.signedInAs")} ${user?.email}.`}
        actions={
          <Avatar
            src={user?.avatarUrl}
            name={user?.displayName || user?.username}
            size="lg"
            alt=""
          />
        }
      />

      <div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Settings size={14} aria-hidden />
          {t("dashboard.profileSettings")}
        </Link>
      </div>

      {/* Create workspace */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus size={18} aria-hidden />
            {t("dashboard.createWorkspace")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
            <Input
              id="create-workspace-name"
              name="create-workspace-name"
              type="text"
              placeholder={t("dashboard.workspaceName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label={t("dashboard.workspaceName")}
              className="flex-1"
            />
            <Input
              id="create-workspace-slug"
              name="create-workspace-slug"
              type="text"
              placeholder={t("dashboard.workspaceSlug")}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              aria-label={t("dashboard.workspaceSlug")}
              className="flex-1"
            />
            <Button type="submit" disabled={createState.kind === "loading"}>
              {createState.kind === "loading"
                ? t("dashboard.creating")
                : t("dashboard.create")}
            </Button>
          </form>
          {createState.kind === "error" && (
            <ErrorAlert message={createState.message} className="mt-3" />
          )}
        </CardContent>
      </Card>

      {/* Pending invitations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox size={18} aria-hidden />
            {t("dashboard.pendingInvitations")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invites.kind === "idle" || invites.kind === "loading" ? (
            <Spinner text={t("dashboard.loadingInvites")} />
          ) : invites.kind === "error" ? (
            <ErrorAlert message={invites.message} />
          ) : invites.data.length === 0 ? (
            <EmptyState icon={Inbox} title={t("dashboard.noPendingInvitations")} />
          ) : (
            <>
              {inviteActionError && (
                <ErrorAlert message={inviteActionError} className="mb-3" />
              )}
              <ul className="divide-y divide-border">
                {invites.data.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">{inv.workspace.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("dashboard.invitedBy")}{" "}
                        {inv.invitedBy.displayName?.trim()
                          ? inv.invitedBy.displayName
                          : `@${inv.invitedBy.username}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("dashboard.joinAs")} {inv.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDeclineInvite(inv.id)}
                      >
                        {t("dashboard.decline")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAcceptInvite(inv.id, inv.workspace.id)}
                      >
                        {t("dashboard.accept")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pending channel invitations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail size={18} aria-hidden />
            {t("dashboard.pendingChannelInvitations")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {channelInvites.kind === "idle" || channelInvites.kind === "loading" ? (
            <Spinner text={t("dashboard.loadingChannelInvites")} />
          ) : channelInvites.kind === "error" ? (
            <ErrorAlert message={channelInvites.message} />
          ) : channelInvites.data.length === 0 ? (
            <EmptyState
              icon={Mail}
              title={t("dashboard.noPendingChannelInvitations")}
            />
          ) : (
            <>
              {channelInviteActionError && (
                <ErrorAlert message={channelInviteActionError} className="mb-3" />
              )}
              <ul className="divide-y divide-border">
                {channelInvites.data.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">
                        {inv.workspace.name}
                        <span className="mx-1.5 text-muted-foreground">·</span>
                        <span className="text-foreground">{inv.channel.name}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("dashboard.invitedBy")}{" "}
                        {inv.invitedBy.displayName?.trim()
                          ? inv.invitedBy.displayName
                          : `@${inv.invitedBy.username}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("dashboard.joinAs")} {inv.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDeclineChannelInvite(inv.id)}
                      >
                        {t("dashboard.decline")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          handleAcceptChannelInvite(
                            inv.id,
                            inv.workspace.id,
                            inv.channel.id
                          )
                        }
                      >
                        {t("dashboard.accept")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* Workspace list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 size={18} aria-hidden />
            {t("dashboard.yourWorkspaces")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workspaces.kind === "idle" || workspaces.kind === "loading" ? (
            <Spinner text={t("dashboard.loadingWorkspaces")} />
          ) : workspaces.kind === "error" ? (
            <ErrorAlert message={workspaces.message} />
          ) : workspaces.data.length === 0 ? (
            <EmptyState icon={Building2} title={t("dashboard.noWorkspaces")} />
          ) : (
            <>
              {archiveError && <ErrorAlert message={archiveError} className="mb-3" />}
              <ul className="divide-y divide-border">
                {workspaces.data.map((ws) => (
                  <li
                    key={ws.id}
                    className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 hover:bg-accent/50 -mx-2 px-2 rounded-md transition-colors"
                  >
                    <Link href={`/workspaces/${ws.id}`} className="flex-1 min-w-0">
                      <div>
                        <p className="text-sm font-medium">{ws.name}</p>
                        <p className="text-xs text-muted-foreground">{ws.slug}</p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(ws.createdAt).toLocaleDateString()}
                      </span>
                      {ws.ownerId === user?.id && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleArchiveWorkspace(e, ws.id, ws.name)}
                        >
                          {t("dashboard.archive")}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* Archived workspaces */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Archive size={18} aria-hidden />
            {t("dashboard.archivedWorkspaces")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {archivedWorkspaces.kind === "idle" ||
          archivedWorkspaces.kind === "loading" ? (
            <Spinner text={t("dashboard.loadingArchived")} />
          ) : archivedWorkspaces.kind === "error" ? (
            <ErrorAlert message={archivedWorkspaces.message} />
          ) : archivedWorkspaces.data.length === 0 ? (
            <EmptyState
              icon={Archive}
              title={t("dashboard.noArchivedWorkspaces")}
            />
          ) : (
            <>
              {restoreError && (
                <ErrorAlert message={restoreError} className="mb-3" />
              )}
              <ul className="divide-y divide-border">
                {archivedWorkspaces.data.map((ws) => (
                  <li
                    key={ws.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 hover:bg-accent/50 -mx-2 px-2 rounded-md transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-muted-foreground">
                        {ws.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ws.slug} · {t("dashboard.archivedLabel")}{" "}
                        {ws.deletedAt
                          ? new Date(ws.deletedAt).toLocaleDateString()
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={(e) => handleRestoreWorkspace(e, ws.id, ws.name)}
                      >
                        {t("dashboard.restore")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
