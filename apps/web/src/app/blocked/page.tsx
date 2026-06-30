"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Shield } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { listBlockedUsers, unblockUser, type BlockedUser } from "@/lib/safety-api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

type BlocksState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: BlockedUser[] }
  | { kind: "error"; message: string };

export default function BlockedUsersPage() {
  const { accessToken, isLoading: authLoading, isAuthenticated } = useAuth();
  const { t } = useLocale();

  const [blocks, setBlocks] = useState<BlocksState>({ kind: "idle" });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const loadBlocks = useCallback(
    async (token: string) => {
      setBlocks({ kind: "loading" });
      try {
        const data = await listBlockedUsers(token);
        setBlocks({ kind: "success", data });
      } catch (err) {
        const message = localizeApiError(err, "errors.generic", t);
        setBlocks({ kind: "error", message });
      }
    },
    [t],
  );

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBlocks(accessToken);
  }, [isAuthenticated, accessToken, loadBlocks]);

  async function handleUnblock(blockedUser: BlockedUser) {
    if (!accessToken) return;

    const displayName = blockedUser.displayName || blockedUser.username;
    const confirmed = window.confirm(t("safety.confirmUnblock", displayName));
    if (!confirmed) return;

    setActionLoading(blockedUser.blockedUserId);
    setActionMessage(null);
    try {
      await unblockUser(accessToken, blockedUser.blockedUserId);
      setActionMessage({ kind: "success", text: t("contacts.contactRemoved") });
      await loadBlocks(accessToken);
    } catch (err) {
      const message = localizeApiError(err, "safety.unblockFailed", t);
      setActionMessage({ kind: "error", text: message });
    } finally {
      setActionLoading(null);
    }
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
      <Button variant="ghost" size="sm" asChild className="mb-4 w-fit">
        <Link href="/profile">
          <ChevronLeft size={16} className="mr-1" />
          {t("profile.back")}
        </Link>
      </Button>

      <PageHeader
        title={t("safety.blockedUsers")}
        subtitle={t("safety.blockedUsersDescription")}
      />

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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("safety.blockedUsers")}</CardTitle>
        </CardHeader>
        <CardContent>
          {blocks.kind === "idle" || blocks.kind === "loading" ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              {t("contacts.searching")}
            </div>
          ) : blocks.kind === "error" ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {blocks.message}
            </div>
          ) : blocks.data.length === 0 ? (
            <EmptyState
              icon={Shield}
              title={t("safety.noBlockedUsers")}
              description={t("safety.blockedUsersDescription")}
            />
          ) : (
            <ul className="space-y-2">
              {blocks.data.map((blocked) => (
                <li
                  key={blocked.id}
                  className="group rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-rose-50/30 shadow-sm transition-all hover:border-primary/30 hover:shadow-md dark:to-rose-950/10"
                >
                  <div className="flex items-center gap-3 p-3 min-w-0">
                    <Avatar
                      src={blocked.avatarUrl}
                      name={blocked.displayName || blocked.username}
                      size="md"
                      alt=""
                      className="ring-2 ring-border group-hover:ring-primary/20 transition-all"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {blocked.displayName || blocked.username}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        @{blocked.username}
                      </p>
                      {blocked.reason && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {blocked.reason}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={actionLoading === blocked.blockedUserId}
                      onClick={() => handleUnblock(blocked)}
                    >
                      {actionLoading === blocked.blockedUserId ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        t("safety.unblock")
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
