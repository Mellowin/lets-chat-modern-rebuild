"use client";

import { useEffect, useLayoutEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaces, createWorkspace, archiveWorkspace, type Workspace } from "@/lib/workspaces-api";
import { updateDisplayName } from "@/lib/auth-api";
import { getPendingInvites, acceptInvite, declineInvite, type PendingInvite } from "@/lib/invites-api";
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

type DisplayNameState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

type InvitesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: PendingInvite[] }
  | { kind: "error"; message: string };

export default function DashboardPage() {
  const { user, accessToken, isLoading: authLoading, isAuthenticated, setUser } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspacesState>({ kind: "idle" });
  const [createState, setCreateState] = useState<CreateState>({ kind: "idle" });
  const [displayNameState, setDisplayNameState] = useState<DisplayNameState>({ kind: "idle" });
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [invites, setInvites] = useState<InvitesState>({ kind: "idle" });
  const [inviteActionError, setInviteActionError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (user?.displayName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayNameInput(user.displayName);
    }
  }, [user?.displayName]);

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

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!accessToken) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWorkspaces(accessToken);
    loadPendingInvites(accessToken);
  }, [isAuthenticated, accessToken, loadWorkspaces, loadPendingInvites]);

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

  async function handleUpdateDisplayName(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setDisplayNameState({ kind: "loading" });
    try {
      const updated = await updateDisplayName(accessToken, displayNameInput);
      setUser(updated);
      setDisplayNameState({ kind: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update display name";
      setDisplayNameState({ kind: "error", message });
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

  async function handleAcceptInvite(inviteId: string) {
    if (!accessToken) return;
    setInviteActionError(null);
    try {
      await acceptInvite(accessToken, inviteId);
      await loadPendingInvites(accessToken);
      await loadWorkspaces(accessToken);
      window.dispatchEvent(new Event("workspaces:changed"));
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
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome, {user?.username}
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        You are signed in as {user?.email}.
      </p>

      {/* Display name form */}
      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Display name</h2>
        <form onSubmit={handleUpdateDisplayName} className="mt-3 flex flex-col sm:flex-row items-start gap-3">
          <input
            type="text"
            placeholder="Your display name"
            value={displayNameInput}
            onChange={(e) => setDisplayNameInput(e.target.value)}
            className="flex-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
          <button
            type="submit"
            disabled={displayNameState.kind === "loading"}
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {displayNameState.kind === "loading" ? "Saving…" : "Save"}
          </button>
        </form>
        {displayNameState.kind === "success" && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Display name updated.
            </div>
          </div>
        )}
        {displayNameState.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {displayNameState.message}
            </div>
          </div>
        )}
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
                          : `@${inv.invitedBy.username}`}{" "}
                        · {inv.role}
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
                        onClick={() => handleAcceptInvite(inv.id)}
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
                      <button
                        onClick={(e) => handleArchiveWorkspace(e, ws.id, ws.name)}
                        className="text-[10px] text-red-600 dark:text-red-400 hover:underline"
                      >
                        Archive
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
