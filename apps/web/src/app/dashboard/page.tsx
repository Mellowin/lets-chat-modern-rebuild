"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaces, createWorkspace, archiveWorkspace, listArchivedWorkspaces, restoreWorkspace, type Workspace } from "@/lib/workspaces-api";

import { getPendingInvites, acceptInvite, declineInvite, type PendingInvite } from "@/lib/invites-api";
import { getPendingChannelInvites, acceptChannelInvite, declineChannelInvite, type PendingChannelInvite } from "@/lib/channel-invites-api";
import { slugify } from "@/lib/transliterate";

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

export default function DashboardPage() {
  const { user, accessToken, isLoading: authLoading, isAuthenticated } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspacesState>({ kind: "idle" });
  const [createState, setCreateState] = useState<CreateState>({ kind: "idle" });
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const router = useRouter();
  const [invites, setInvites] = useState<InvitesState>({ kind: "idle" });
  const [inviteActionError, setInviteActionError] = useState<string | null>(null);
  const [channelInvites, setChannelInvites] = useState<ChannelInvitesState>({ kind: "idle" });
  const [channelInviteActionError, setChannelInviteActionError] = useState<string | null>(null);
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<ArchivedWorkspacesState>({ kind: "idle" });
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async (token: string) => {
    setWorkspaces({ kind: "loading" });
    try {
      const data = await getWorkspaces(token);
      setWorkspaces({ kind: "success", data });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load workspaces";
      setWorkspaces({ kind: "error", message });
    }
  }, []);

  const loadPendingInvites = useCallback(async (token: string) => {
    setInvites({ kind: "loading" });
    try {
      const data = await getPendingInvites(token);
      setInvites({ kind: "success", data });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load invites";
      setInvites({ kind: "error", message });
    }
  }, []);

  const loadPendingChannelInvites = useCallback(async (token: string) => {
    setChannelInvites({ kind: "loading" });
    try {
      const data = await getPendingChannelInvites(token);
      setChannelInvites({ kind: "success", data });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load channel invites";
      setChannelInvites({ kind: "error", message });
    }
  }, []);

  const loadArchivedWorkspaces = useCallback(async (token: string) => {
    setArchivedWorkspaces({ kind: "loading" });
    try {
      const data = await listArchivedWorkspaces(token);
      setArchivedWorkspaces({ kind: "success", data });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load archived workspaces";
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
  }, [isAuthenticated, accessToken, loadWorkspaces, loadPendingInvites, loadPendingChannelInvites, loadArchivedWorkspaces]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName) {
      setCreateState({ kind: "error", message: "Name is required" });
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
      const message = err instanceof Error ? err.message : "Failed to create workspace";
      setCreateState({ kind: "error", message });
    }
  }

  async function handleArchiveWorkspace(e: React.MouseEvent, workspaceId: string, wsName: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Archive workspace "${wsName}"?\nThis will hide the workspace and all its channels. Only the workspace owner can do this.`)) {
      return;
    }
    if (!accessToken) return;
    setArchiveError(null);
    try {
      await archiveWorkspace(accessToken, workspaceId);
      await loadWorkspaces(accessToken);
      window.dispatchEvent(new Event("workspaces:changed"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to archive workspace";
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
      const message = err instanceof Error ? err.message : "Failed to accept invite";
      setInviteActionError(message);
    }
  }

  async function handleDeclineInvite(inviteId: string) {
    if (!window.confirm("Decline this invitation?")) return;
    if (!accessToken) return;
    setInviteActionError(null);
    try {
      await declineInvite(accessToken, inviteId);
      await loadPendingInvites(accessToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to decline invite";
      setInviteActionError(message);
    }
  }

  async function handleAcceptChannelInvite(inviteId: string, workspaceId: string, channelId: string) {
    if (!accessToken) return;
    setChannelInviteActionError(null);
    try {
      await acceptChannelInvite(accessToken, inviteId);
      await loadPendingChannelInvites(accessToken);
      window.dispatchEvent(new Event("channels:changed"));
      router.push(`/workspaces/${workspaceId}/channels/${channelId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to accept channel invite";
      setChannelInviteActionError(message);
    }
  }

  async function handleDeclineChannelInvite(inviteId: string) {
    if (!window.confirm("Decline this channel invitation?")) return;
    if (!accessToken) return;
    setChannelInviteActionError(null);
    try {
      await declineChannelInvite(accessToken, inviteId);
      await loadPendingChannelInvites(accessToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to decline channel invite";
      setChannelInviteActionError(message);
    }
  }

  async function handleRestoreWorkspace(e: React.MouseEvent, workspaceId: string, wsName: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Restore workspace "${wsName}"?`)) {
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
      const message = err instanceof Error ? err.message : "Failed to restore workspace";
      setRestoreError(message);
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          Loading session…
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Authentication required</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Please sign in to view your dashboard.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-6 sm:p-10 max-w-3xl">
      <div className="flex items-center gap-4">
        <div className="relative h-12 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
          {user?.avatarUrl ? (
            <Image src={user.avatarUrl} alt="" fill className="object-cover" unoptimized />
          ) : (
            <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
              {(user?.displayName || user?.username || "?").slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {user?.displayName || user?.username}
          </h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            You are signed in as {user?.email}.
          </p>
          {user?.languages && user.languages.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {user.languages.map((lang) => (
                <span
                  key={lang}
                  className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {lang}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <Link
          href="/profile"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Profile settings
        </Link>
      </div>

      {/* Create workspace form */}
      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Create workspace</h2>
        <form onSubmit={handleCreate} className="mt-4 flex flex-col sm:flex-row items-start gap-3">
          <input
            type="text"
            placeholder="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
          <input
            type="text"
            placeholder="slug (optional, auto-generated)"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="flex-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
          <button
            type="submit"
            disabled={createState.kind === "loading"}
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {createState.kind === "loading" ? "Creating…" : "Create"}
          </button>
        </form>
        {createState.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {createState.message}
            </div>
          </div>
        )}
      </div>

      {/* Pending invites */}
      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pending Invitations</h2>
        </div>
        <div className="mt-3">
          {invites.kind === "idle" || invites.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 py-4">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              Loading invites…
            </div>
          ) : invites.kind === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
              <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {invites.message}
              </div>
            </div>
          ) : invites.data.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">
              No pending invitations.
            </p>
          ) : (
            <>
              {inviteActionError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                  <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    {inviteActionError}
                  </div>
                </div>
              )}
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {invites.data.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{inv.workspace.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Invited by{" "}
                        {inv.invitedBy.displayName?.trim()
                          ? inv.invitedBy.displayName
                          : `@${inv.invitedBy.username}`}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        You will join as {inv.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleDeclineInvite(inv.id)}
                        className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleAcceptInvite(inv.id, inv.workspace.id)}
                        className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                      >
                        Accept
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Pending channel invites */}
      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pending Channel Invitations</h2>
        </div>
        <div className="mt-3">
          {channelInvites.kind === "idle" || channelInvites.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 py-4">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              Loading channel invites…
            </div>
          ) : channelInvites.kind === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
              <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {channelInvites.message}
              </div>
            </div>
          ) : channelInvites.data.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">
              No pending channel invitations.
            </p>
          ) : (
            <>
              {channelInviteActionError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                  <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    {channelInviteActionError}
                  </div>
                </div>
              )}
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {channelInvites.data.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{inv.workspace.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{inv.channel.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Invited by{" "}
                        {inv.invitedBy.displayName?.trim()
                          ? inv.invitedBy.displayName
                          : `@${inv.invitedBy.username}`}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        You will join as {inv.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleDeclineChannelInvite(inv.id)}
                        className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleAcceptChannelInvite(inv.id, inv.workspace.id, inv.channel.id)}
                        className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                      >
                        Accept
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Workspace list */}
      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your Workspaces</h2>
        </div>

        <div className="mt-3">
          {workspaces.kind === "idle" || workspaces.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 py-4">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              Loading workspaces…
            </div>
          ) : workspaces.kind === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
              <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {workspaces.message}
              </div>
            </div>
          ) : workspaces.data.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">
              No workspaces yet. Create one to get started.
            </p>
          ) : (
            <>
              {archiveError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                  <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    {archiveError}
                  </div>
                </div>
              )}
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {workspaces.data.map((ws) => (
                  <li
                    key={ws.id}
                    className="flex items-center justify-between py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 -mx-2 px-2 rounded-md transition-colors"
                  >
                    <Link
                      href={`/workspaces/${ws.id}`}
                      className="flex-1 min-w-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{ws.name}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {ws.slug}
                        </p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        {new Date(ws.createdAt).toLocaleDateString()}
                      </span>
                      {ws.ownerId === user?.id && (
                        <button
                          onClick={(e) => handleArchiveWorkspace(e, ws.id, ws.name)}
                          className="text-[10px] text-red-600 dark:text-red-400 hover:underline"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Archived workspaces */}
      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">Archived Workspaces</h2>
        </div>

        <div className="mt-3">
          {archivedWorkspaces.kind === "idle" || archivedWorkspaces.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 py-4">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
              Loading archived workspaces…
            </div>
          ) : archivedWorkspaces.kind === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
              <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {archivedWorkspaces.message}
              </div>
            </div>
          ) : archivedWorkspaces.data.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">
              No archived workspaces.
            </p>
          ) : (
            <>
              {restoreError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                  <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    {restoreError}
                  </div>
                </div>
              )}
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {archivedWorkspaces.data.map((ws) => (
                  <li
                    key={ws.id}
                    className="flex items-center justify-between py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 -mx-2 px-2 rounded-md transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{ws.name}</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        {ws.slug} · Archived {ws.deletedAt ? new Date(ws.deletedAt).toLocaleDateString() : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <button
                        onClick={(e) => handleRestoreWorkspace(e, ws.id, ws.name)}
                        className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Restore
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
