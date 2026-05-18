"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getWorkspace, getWorkspaceMembers, addWorkspaceMember, leaveWorkspace, type Workspace, type WorkspaceMember } from "@/lib/workspaces-api";
import { createWorkspaceInvite } from "@/lib/invites-api";
import { getChannels, getArchivedChannels, createChannel, archiveChannel, restoreChannel, type Channel, type CreateChannelInput } from "@/lib/channels-api";

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
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const router = useRouter();

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
        const message = err instanceof Error ? err.message : "Failed to load workspace";
        if (!cancelled) {
          setDetail({ kind: "error", message });
          setChannels({ kind: "error", message });
        }
      }
    }
    loadPrimary(accessToken, workspaceId);
    return () => { cancelled = true; };
  }, [isAuthenticated, accessToken, workspaceId]);

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
        const message = err instanceof Error ? err.message : "Failed to load members";
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
        const message = err instanceof Error ? err.message : "Failed to load archived channels";
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
      setCreateChannelState({ kind: "error", message: "Channel name must be at least 2 characters" });
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
      const message = err instanceof Error ? err.message : "Failed to create channel";
      setCreateChannelState({ kind: "error", message });
    }
  }

  async function handleArchiveChannel(e: React.MouseEvent, channelId: string, name: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Archive channel "${name}"?\nThis will hide the channel from the workspace. Only the channel owner can do this.`)) {
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
      const message = err instanceof Error ? err.message : "Failed to archive channel";
      setArchiveError(message);
    }
  }

  async function handleRestoreChannel(channelId: string, name: string) {
    if (!window.confirm(`Restore channel "${name}"?`)) return;
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
      setRestoreError(err instanceof Error ? err.message : "Failed to restore channel");
    } finally {
      setRestoringChannelId(null);
    }
  }

  function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = memberIdentifier.trim();
    if (!trimmed) {
      setAddMemberState({ kind: "error", message: "Enter a username or email" });
      return;
    }
    if (!accessToken || !workspaceId) return;

    setAddMemberState({ kind: "loading" });
    try {
      if (looksLikeEmail(trimmed)) {
        await createWorkspaceInvite(accessToken, workspaceId, { email: trimmed, role: "MEMBER" });
        setMemberIdentifier("");
        setAddMemberState({ kind: "success", message: "Invitation sent" });
      } else {
        const newMember = await addWorkspaceMember(accessToken, workspaceId, { identifier: trimmed, role: "MEMBER" });
        setMemberIdentifier("");
        setAddMemberState({ kind: "success", message: "Member added" });
        setMembers((prev) => {
          if (prev.kind !== "success") return { kind: "success", data: [newMember] };
          const existingIndex = prev.data.findIndex((m) => m.id === newMember.id);
          if (existingIndex >= 0) {
            const next = [...prev.data];
            next[existingIndex] = newMember;
            return { kind: "success", data: next };
          }
          return { kind: "success", data: [...prev.data, newMember] };
        });
        // background refresh in case server state differs
        try {
          const refreshed = await getWorkspaceMembers(accessToken, workspaceId);
          setMembers({ kind: "success", data: refreshed });
        } catch {
          // ignore refresh failure; local state already updated
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add member";
      setAddMemberState({ kind: "error", message });
    }
  }

  async function handleLeaveWorkspace() {
    if (!window.confirm(`Leave workspace "${detail.kind === "success" ? detail.data.name : workspaceId}"?`)) {
      return;
    }
    if (!accessToken || !workspaceId) return;
    setLeaveError(null);
    try {
      await leaveWorkspace(accessToken, workspaceId);
      window.dispatchEvent(new Event("workspaces:changed"));
      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to leave workspace";
      setLeaveError(message);
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
            Please sign in to view this workspace.
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
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        ← Back to dashboard
      </Link>

      {detail.kind === "loading" && (
        <div className="mt-6 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          Loading workspace…
        </div>
      )}

      {detail.kind === "error" && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/30">
          <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {detail.message}
          </div>
        </div>
      )}

      {detail.kind === "success" && (
        <>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            {detail.data.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {detail.data.slug}
          </p>
        </>
      )}

      {/* Create channel */}
      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Create channel</h2>
        <form onSubmit={handleCreateChannel} className="mt-4 flex flex-col gap-3">
          <input
            type="text"
            placeholder="Channel name"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={channelDescription}
            onChange={(e) => setChannelDescription(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
          <div className="flex items-center gap-3">
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value as "PUBLIC" | "PRIVATE")}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
            >
              <option value="PUBLIC">Public</option>
              <option value="PRIVATE">Private</option>
            </select>
            <button
              type="submit"
              disabled={createChannelState.kind === "loading"}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              {createChannelState.kind === "loading" ? "Creating…" : "Create channel"}
            </button>
          </div>
        </form>
        {createChannelState.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {createChannelState.message}
            </div>
          </div>
        )}
      </div>

      {/* Channel list */}
      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold">Channels</h2>

        {channels.kind === "loading" && (
          <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
            Loading channels…
          </div>
        )}

        {channels.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {channels.message}
            </div>
          </div>
        )}

        {channels.kind === "success" && channels.data.length === 0 && (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No channels yet.
          </p>
        )}

        {archiveError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {archiveError}
            </div>
          </div>
        )}

        {channels.kind === "success" && channels.data.length > 0 && (
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {channels.data.map((ch) => (
              <li
                key={ch.id}
                className="flex items-center justify-between py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 -mx-2 px-2 rounded-md transition-colors"
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
                    <button
                      onClick={(e) => handleArchiveChannel(e, ch.id, ch.name)}
                      className="text-[10px] text-red-600 dark:text-red-400 hover:underline"
                    >
                      Archive
                    </button>
                  )}
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      ch.type === "PUBLIC"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                    }`}
                  >
                    {ch.type}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Members */}
      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Members</h2>

        {members.kind === "loading" && (
          <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
            Loading members…
          </div>
        )}

        {members.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {members.message}
            </div>
          </div>
        )}

        {members.kind === "success" && members.data.length === 0 && (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No members yet.
          </p>
        )}

        {members.kind === "success" && members.data.length > 0 && (
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {members.data.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{m.user.displayName?.trim() ? m.user.displayName : `@${m.user.username}`}</span>
                  {m.user.displayName?.trim() && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">@{m.user.username}</span>
                  )}
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    m.role === "OWNER"
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400"
                      : m.role === "ADMIN"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        )}

        {members.kind === "success" && (
          (() => {
            const myRole = members.data.find((m) => m.user.id === user?.id)?.role;
            const canManageMembers = myRole === "OWNER" || myRole === "ADMIN";
            return canManageMembers ? (
              <>
                <form onSubmit={handleAddMember} className="mt-4 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Username or email"
                    value={memberIdentifier}
                    onChange={(e) => setMemberIdentifier(e.target.value)}
                    className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
                  />
                  <button
                    type="submit"
                    disabled={addMemberState.kind === "loading"}
                    className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                  >
                    {addMemberState.kind === "loading" ? "Adding…" : "Add member"}
                  </button>
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
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                    <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      {addMemberState.message}
                    </div>
                  </div>
                )}
              </>
            ) : null;
          })()
        )}

        {members.kind === "success" && (
          (() => {
            const myRole = members.data.find((m) => m.user.id === user?.id)?.role;
            const canLeave = myRole === "MEMBER" || myRole === "ADMIN";
            return canLeave ? (
              <div className="mt-4">
                <button
                  onClick={handleLeaveWorkspace}
                  className="text-[10px] text-red-600 dark:text-red-400 hover:underline"
                >
                  Leave workspace
                </button>
                {leaveError && (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[10px] dark:border-red-900 dark:bg-red-950/30">
                    <div className="flex items-center gap-1 font-medium text-red-800 dark:text-red-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      {leaveError}
                    </div>
                  </div>
                )}
              </div>
            ) : null;
          })()
        )}
      </div>

      {/* Archived channels */}
      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold">Archived channels</h2>

        {archivedChannels.kind === "loading" && (
          <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
            Loading archived channels…
          </div>
        )}

        {archivedChannels.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {archivedChannels.message}
            </div>
          </div>
        )}

        {archivedChannels.kind === "success" && archivedChannels.data.length === 0 && (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No archived channels.
          </p>
        )}

        {restoreError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {restoreError}
            </div>
          </div>
        )}

        {archivedChannels.kind === "success" && archivedChannels.data.length > 0 && (
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {archivedChannels.data.map((ch) => (
              <li key={ch.id} className="flex items-center justify-between py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 -mx-2 px-2 rounded-md transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{ch.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{ch.slug}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {ch.createdById === user?.id && (
                    <button
                      onClick={() => handleRestoreChannel(ch.id, ch.name)}
                      disabled={restoringChannelId === ch.id}
                      className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {restoringChannelId === ch.id ? "Restoring…" : "Restore"}
                    </button>
                  )}
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${ch.type === "PUBLIC" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"}`}>
                    {ch.type}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
