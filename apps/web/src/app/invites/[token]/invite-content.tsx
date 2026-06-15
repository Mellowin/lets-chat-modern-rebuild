"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Users,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import {
  previewInvite,
  acceptInviteByToken,
  type AcceptInviteResult,
} from "@/lib/invites-api";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

type PreviewState =
  | { kind: "loading" }
  | {
      kind: "success";
      data: {
        workspaceName: string | null;
        expiresAt: string;
        valid: boolean;
      };
    }
  | { kind: "error"; message: string };

type AcceptState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; result: AcceptInviteResult }
  | { kind: "error"; message: string };

function Alert({
  variant,
  children,
}: {
  variant: "success" | "error" | "warning";
  children: React.ReactNode;
}) {
  const variants = {
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400",
    error:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400",
    warning:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400",
  };
  const icons = {
    success: <CheckCircle2 className="h-4 w-4 shrink-0" />,
    error: <XCircle className="h-4 w-4 shrink-0" />,
    warning: <AlertTriangle className="h-4 w-4 shrink-0" />,
  };
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${variants[variant]}`}
      role="alert"
    >
      {icons[variant]}
      <div className="flex-1">{children}</div>
    </div>
  );
}

export default function InviteAcceptContent() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const { t } = useLocale();
  const { isLoading: authLoading, isAuthenticated, accessToken } = useAuth();

  const [preview, setPreview] = useState<PreviewState>({ kind: "loading" });
  const [acceptState, setAcceptState] = useState<AcceptState>({ kind: "idle" });

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview({ kind: "error", message: t("invite.invalidOrExpired") });
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const data = await previewInvite(token);
        if (!cancelled) setPreview({ kind: "success", data });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("invite.invalidOrExpired");
        if (!cancelled) setPreview({ kind: "error", message });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  async function handleAccept() {
    if (!accessToken || !token) return;
    setAcceptState({ kind: "loading" });
    try {
      const result = await acceptInviteByToken(accessToken, token);
      setAcceptState({ kind: "success", result });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("invite.acceptFailed");
      setAcceptState({ kind: "error", message });
    }
  }

  const expiresAt =
    preview.kind === "success" ? new Date(preview.data.expiresAt) : null;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users size={24} />
          </div>
          <CardTitle>{t("invite.acceptInvite")}</CardTitle>

        </CardHeader>
        <CardContent className="space-y-4">
          {preview.kind === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("invite.loadingInvite")}
            </div>
          )}

          {preview.kind === "error" && (
            <>
              <Alert variant="error">
                <span className="font-medium">{preview.message}</span>
              </Alert>
              <Button asChild className="w-full">
                <Link href="/login">{t("invite.goToLogin")}</Link>
              </Button>
            </>
          )}

          {preview.kind === "success" && !preview.data.valid && (
            <>
              <Alert variant="error">
                <span className="font-medium">{t("invite.invalidOrExpired")}</span>
              </Alert>
              <Button asChild className="w-full">
                <Link href="/login">{t("invite.goToLogin")}</Link>
              </Button>
            </>
          )}

          {preview.kind === "success" && preview.data.valid && (
            <>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {t("invite.invitedToJoin")}
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {preview.data.workspaceName ||
                    t("workspace.fallbackThisWorkspace")}
                </p>
              </div>

              {expiresAt && (
                <Badge variant="default" className="mx-auto">
                  {t("invite.inviteExpires")}:{" "}
                  {expiresAt.toLocaleDateString()}{" "}
                  {expiresAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Badge>
              )}

              {acceptState.kind === "success" ? (
                <>
                  <Alert variant="success">
                    <span className="font-medium">{t("invite.inviteAccepted")}</span>
                  </Alert>
                  <Button asChild className="w-full">
                    <Link href={`/workspaces/${acceptState.result.workspaceId}`}>
                      {t("invite.goToWorkspace")}
                    </Link>
                  </Button>
                </>
              ) : authLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("auth.loadingSession")}
                </div>
              ) : isAuthenticated ? (
                <>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleAccept}
                    disabled={acceptState.kind === "loading"}
                  >
                    {acceptState.kind === "loading" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("invite.acceptingInvite")}
                      </>
                    ) : (
                      t("invite.acceptInvite")
                    )}
                  </Button>

                  {acceptState.kind === "error" && (
                    <Alert variant="error">
                      <span className="font-medium">{acceptState.message}</span>
                    </Alert>
                  )}
                </>
              ) : (
                <>
                  <Alert variant="warning">
                    <span className="font-medium">
                      {t("invite.signInToAccept")}
                    </span>
                  </Alert>
                  <Button asChild className="w-full">
                    <Link href="/login">{t("invite.goToLogin")}</Link>
                  </Button>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
