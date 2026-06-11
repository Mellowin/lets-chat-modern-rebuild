"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/locale";
import {
  createWorkspaceInvite,
  listWorkspaceInvites,
  revokeWorkspaceInvite,
  type WorkspaceInvite,
} from "@/lib/invites-api";

interface Props {
  workspaceId: string;
  accessToken: string;
  canManage: boolean;
}

export default function WorkspaceInvitesSection({
  workspaceId,
  accessToken,
  canManage,
}: Props) {
  const { t } = useLocale();
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inviteType, setInviteType] = useState<"public" | "targeted">("public");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [maxUses, setMaxUses] = useState<number>(10);
  const [identifier, setIdentifier] = useState("");

  const [createState, setCreateState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; token: string; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listWorkspaceInvites(accessToken, workspaceId);
        if (!cancelled) setInvites(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : t("workspace.errorLoadInvitesFailed");
        if (!cancelled) {
          setError(message);
          if (message.toLowerCase().includes("permission") || message.includes("403")) {
            setError(t("workspace.noPermissionToManageInvites"));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [accessToken, workspaceId, canManage, t]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || !accessToken || !workspaceId) return;

    setCreateState({ kind: "loading" });
    setCopied(false);
    try {
      if (inviteType === "public") {
        const res = await createWorkspaceInvite(accessToken, workspaceId, {
          role,
          maxUses: Math.max(1, maxUses),
        });
        setCreateState({
          kind: "success",
          token: res.token,
          message: t("workspace.inviteLinkCreated"),
        });
      } else {
        const trimmed = identifier.trim();
        if (!trimmed) {
          setCreateState({ kind: "error", message: t("workspace.errorEnterUsernameOrEmail") });
          return;
        }
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
        await createWorkspaceInvite(accessToken, workspaceId, {
          [isEmail ? "email" : "identifier"]: trimmed,
          role,
        });
        setIdentifier("");
        setCreateState({ kind: "success", token: "", message: t("workspace.invitationSent") });
      }
      // refresh list
      const data = await listWorkspaceInvites(accessToken, workspaceId);
      setInvites(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("workspace.errorCreateInviteFailed");
      setCreateState({ kind: "error", message });
    }
  }

  async function handleCopy(token: string) {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/invites/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: show in alert is not great; we keep input selectable
      setCopied(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    if (!accessToken || !workspaceId) return;
    setRevokingId(inviteId);
    setRevokeError(null);
    try {
      await revokeWorkspaceInvite(accessToken, workspaceId, inviteId);
      setInvites((prev) =>
        prev.map((inv) =>
          inv.id === inviteId ? { ...inv, status: "REVOKED" as const, deletedAt: new Date().toISOString() } : inv
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : t("workspace.errorRevokeInviteFailed");
      setRevokeError(message);
    } finally {
      setRevokingId(null);
    }
  }

  if (!canManage) return null;

  const activeInvites = invites.filter((i) => i.status === "PENDING");
  const pastInvites = invites.filter((i) => i.status !== "PENDING");

  return (
    <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
      <h2 className="text-sm font-semibold">{t("workspace.invites")}</h2>

      <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setInviteType("public"); setCreateState({ kind: "idle" }); }}
            className={`text-xs rounded-lg px-3 py-1.5 border transition-colors ${
              inviteType === "public"
                ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
                : "bg-white text-zinc-700 border-zinc-300 dark:bg-zinc-950 dark:text-zinc-300 dark:border-zinc-700"
            }`}
          >
            {t("workspace.publicInviteLink")}
          </button>
          <button
            type="button"
            onClick={() => { setInviteType("targeted"); setCreateState({ kind: "idle" }); }}
            className={`text-xs rounded-lg px-3 py-1.5 border transition-colors ${
              inviteType === "targeted"
                ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
                : "bg-white text-zinc-700 border-zinc-300 dark:bg-zinc-950 dark:text-zinc-300 dark:border-zinc-700"
            }`}
          >
            {t("workspace.targetedInvite")}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "MEMBER" | "ADMIN")}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          >
            <option value="MEMBER">{t("workspace.member")}</option>
            <option value="ADMIN">{t("workspace.admin")}</option>
          </select>

          {inviteType === "public" ? (
            <input
              type="number"
              min={1}
              max={1000}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
              placeholder={t("workspace.maxUses")}
            />
          ) : (
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={t("workspace.inviteByEmail")}
              className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
            />
          )}

          <button
            type="submit"
            disabled={createState.kind === "loading"}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {createState.kind === "loading"
              ? t("workspace.addingMember")
              : inviteType === "public"
              ? t("workspace.createInviteLink")
              : t("workspace.addMember")}
          </button>
        </div>
      </form>

      {createState.kind === "success" && createState.token && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {createState.message}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/invites/${createState.token}`}
              className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => handleCopy(createState.token)}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              {copied ? t("workspace.copied") : t("workspace.copyInviteLink")}
            </button>
          </div>
        </div>
      )}

      {createState.kind === "success" && !createState.token && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {createState.message}
          </div>
        </div>
      )}

      {createState.kind === "error" && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
          <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {createState.message}
          </div>
        </div>
      )}

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          {t("workspace.loadingMembers")}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
          <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {error}
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {activeInvites.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {t("workspace.active")}
              </h3>
              <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
                {activeInvites.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {inv.email || t("workspace.publicInviteLink")}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {t("workspace.inviteRole")}: {inv.role} •{" "}
                        {inv.maxUses != null
                          ? `${inv.usesCount} / ${inv.maxUses} ${t("workspace.uses")}`
                          : `${t("workspace.uses")}: ${inv.usesCount}`} •{" "}
                        {t("workspace.expires")}: {new Date(inv.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      disabled={revokingId === inv.id}
                      className="text-[10px] text-red-600 dark:text-red-400 hover:underline disabled:opacity-60 disabled:cursor-not-allowed shrink-0 ml-2"
                    >
                      {revokingId === inv.id ? t("workspace.removing") : t("workspace.revokeInvite")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pastInvites.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {t("workspace.past")}
              </h3>
              <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
                {pastInvites.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {inv.email || t("workspace.publicInviteLink")}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {t("workspace.inviteRole")}: {inv.role} •{" "}
                        {inv.maxUses != null
                          ? `${inv.usesCount} / ${inv.maxUses} ${t("workspace.uses")}`
                          : `${t("workspace.uses")}: ${inv.usesCount}`} •{" "}
                        {t("workspace.expires")}: {new Date(inv.expiresAt).toLocaleDateString()} •{" "}
                        {inv.status}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeInvites.length === 0 && pastInvites.length === 0 && (
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
              {t("workspace.noInvites")}
            </p>
          )}
        </>
      )}

      {revokeError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
          <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {revokeError}
          </div>
        </div>
      )}
    </div>
  );
}
