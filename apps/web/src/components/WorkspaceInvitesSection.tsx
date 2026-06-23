"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { getRoleLabel, getInviteStatusLabel } from "@/lib/labels";
import {
  createWorkspaceInvite,
  listWorkspaceInvites,
  revokeWorkspaceInvite,
  type WorkspaceInvite,
} from "@/lib/invites-api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  UserPlus,
  Link2,
  Mail,
  Users,
  Copy,
  Check,
  Loader2,
  XCircle,
} from "lucide-react";

interface Props {
  workspaceId: string;
  accessToken: string;
  canManage: boolean;
}

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

function SuccessAlert({
  message,
  className = "",
  children,
}: {
  message: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30 ${className}`}
    >
      <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {message}
      </div>
      {children}
    </div>
  );
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
        const rawMessage = err instanceof Error ? err.message : "";
        const message = localizeApiError(err, "workspace.errorLoadInvitesFailed", t);
        if (!cancelled) {
          setError(message);
          if (
            rawMessage.toLowerCase().includes("permission") ||
            rawMessage.includes("403")
          ) {
            setError(t("workspace.noPermissionToManageInvites"));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
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
          setCreateState({
            kind: "error",
            message: t("workspace.errorEnterUsernameOrEmail"),
          });
          return;
        }
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
        await createWorkspaceInvite(accessToken, workspaceId, {
          [isEmail ? "email" : "identifier"]: trimmed,
          role,
        });
        setIdentifier("");
        setCreateState({
          kind: "success",
          token: "",
          message: t("workspace.invitationSent"),
        });
      }
      const data = await listWorkspaceInvites(accessToken, workspaceId);
      setInvites(data);
    } catch (err) {
      const message = localizeApiError(err, "workspace.errorCreateInviteFailed", t);
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
          inv.id === inviteId
            ? {
                ...inv,
                status: "REVOKED" as const,
                deletedAt: new Date().toISOString(),
              }
            : inv
        )
      );
    } catch (err) {
      const message = localizeApiError(err, "workspace.errorRevokeInviteFailed", t);
      setRevokeError(message);
    } finally {
      setRevokingId(null);
    }
  }

  if (!canManage) return null;

  const activeInvites = invites.filter((i) => i.status === "PENDING");
  const pastInvites = invites.filter((i) => i.status !== "PENDING");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <UserPlus size={16} aria-hidden />
          </div>
          {t("workspace.invites")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="inline-flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1">
            <Button
              type="button"
              variant={inviteType === "public" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                setInviteType("public");
                setCreateState({ kind: "idle" });
              }}
            >
              <Link2 size={14} aria-hidden />
              {t("workspace.publicInviteLink")}
            </Button>
            <Button
              type="button"
              variant={inviteType === "targeted" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                setInviteType("targeted");
                setCreateState({ kind: "idle" });
              }}
            >
              <Mail size={14} aria-hidden />
              {t("workspace.targetedInvite")}
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Select
              id="invite-role"
              name="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "MEMBER" | "ADMIN")}
              aria-label={t("workspace.inviteRole")}
              className="w-28"
            >
              <option value="MEMBER">{t("workspace.member")}</option>
              <option value="ADMIN">{t("workspace.admin")}</option>
            </Select>

            {inviteType === "public" ? (
              <Input
                type="number"
                id="invite-max-uses"
                name="invite-max-uses"
                min={1}
                max={1000}
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value))}
                placeholder={t("workspace.maxUses")}
                aria-label={t("workspace.maxUses")}
                className="w-24"
              />
            ) : (
              <Input
                type="text"
                id="invite-email"
                name="invite-email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={t("workspace.inviteByEmail")}
                aria-label={t("workspace.inviteByEmail")}
                className="flex-1"
              />
            )}

            <Button type="submit" disabled={createState.kind === "loading"} className="shrink-0 whitespace-nowrap">
              {createState.kind === "loading"
                ? t("workspace.addingMember")
                : inviteType === "public"
                  ? t("workspace.createInviteLink")
                  : t("workspace.addMember")}
            </Button>
          </div>
        </form>

        {createState.kind === "success" && createState.token && (
          <SuccessAlert message={createState.message} className="mt-4">
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="invite-link"
                name="invite-link"
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/invites/${createState.token}`}
                aria-label={t("workspace.copyInviteLink")}
              />
              <Button type="button" onClick={() => handleCopy(createState.token)}>
                {copied ? (
                  <>
                    <Check size={16} aria-hidden />
                    {t("workspace.copied")}
                  </>
                ) : (
                  <>
                    <Copy size={16} aria-hidden />
                    {t("workspace.copyInviteLink")}
                  </>
                )}
              </Button>
            </div>
          </SuccessAlert>
        )}

        {createState.kind === "success" && !createState.token && (
          <SuccessAlert message={createState.message} className="mt-4" />
        )}

        {createState.kind === "error" && (
          <ErrorAlert message={createState.message} className="mt-4" />
        )}

        {loading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("workspace.loadingMembers")}
          </div>
        )}

        {error && <ErrorAlert message={error} className="mt-4" />}

        {!loading && !error && (
          <>
            {activeInvites.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("workspace.active")}
                </h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {activeInvites.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 text-sm">
                        <p className="truncate font-medium text-foreground">
                          {inv.email || (
                            <span className="inline-flex items-center gap-1.5">
                              <Link2 size={13} aria-hidden className="text-primary" />
                              {t("workspace.publicInviteLink")}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>
                            {t("workspace.inviteRole")}:{" "}
                            <Badge variant={inv.role === "ADMIN" ? "info" : "default"}>{getRoleLabel(inv.role, t)}</Badge>
                          </span>
                          <span>
                            {inv.maxUses != null
                              ? `${inv.usesCount} / ${inv.maxUses} ${t("workspace.uses")}`
                              : `${t("workspace.uses")}: ${inv.usesCount}`}
                          </span>
                          <span>
                            {t("workspace.expires")}:{" "}
                            {new Date(inv.expiresAt).toLocaleDateString()}
                          </span>
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(inv.id)}
                        disabled={revokingId === inv.id}
                        className="w-fit text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <XCircle size={14} aria-hidden />
                        {revokingId === inv.id
                          ? t("workspace.removing")
                          : t("workspace.revokeInvite")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pastInvites.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("workspace.past")}
                </h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {pastInvites.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex flex-col gap-1 rounded-xl border border-border/60 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 text-sm">
                        <p className="truncate font-medium text-muted-foreground">
                          {inv.email || t("workspace.publicInviteLink")}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>
                            {t("workspace.inviteRole")}:{" "}
                            <Badge variant="muted">{getRoleLabel(inv.role, t)}</Badge>
                          </span>
                          <span>
                            {inv.maxUses != null
                              ? `${inv.usesCount} / ${inv.maxUses} ${t("workspace.uses")}`
                              : `${t("workspace.uses")}: ${inv.usesCount}`}
                          </span>
                          <span>
                            {t("workspace.expires")}:{" "}
                            {new Date(inv.expiresAt).toLocaleDateString()}
                          </span>
                          <Badge variant="muted">{getInviteStatusLabel(inv.status, t)}</Badge>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activeInvites.length === 0 && pastInvites.length === 0 && (
              <EmptyState
                icon={Users}
                title={t("workspace.noInvites")}
                className="mt-4"
              />
            )}
          </>
        )}

        {revokeError && <ErrorAlert message={revokeError} className="mt-4" />}
      </CardContent>
    </Card>
  );
}
