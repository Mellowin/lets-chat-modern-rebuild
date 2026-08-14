"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { cancelAccountDeletion } from "@/lib/auth-api";
import { useLocale } from "@/lib/locale";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export function CancelAccountDeletionContent() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "verifying" }
    | { kind: "success" }
    | { kind: "error"; message: string }
  >(() => {
    const token = searchParams.get("token");
    return token ? { kind: "verifying" } : { kind: "error", message: t("cancelAccountDeletion.errorMessage") };
  });

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token || state.kind !== "verifying") return;

    let cancelled = false;
    cancelAccountDeletion({ token })
      .then(() => {
        if (cancelled) return;
        setState({ kind: "success" });
        // Remove token from address bar without adding a history entry.
        const url = new URL(window.location.href);
        url.search = "";
        window.history.replaceState({}, "", url.toString());
      })
      .catch(() => {
        if (cancelled) return;
        setState({ kind: "error", message: t("cancelAccountDeletion.errorMessage") });
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, t, state.kind]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center p-6">
      <Card data-testid="cancel-account-deletion-card">
        <CardHeader>
          <CardTitle>{t("cancelAccountDeletion.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.kind === "verifying" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              {t("cancelAccountDeletion.verifying")}
            </div>
          )}

          {state.kind === "success" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
                {t("cancelAccountDeletion.successMessage")}
              </div>
              <Button asChild variant="primary">
                <Link href="/login">{t("cancelAccountDeletion.backToSignIn")}</Link>
              </Button>
            </div>
          )}

          {(state.kind === "error" || state.kind === "idle") && (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                {state.kind === "error"
                  ? state.message
                  : t("cancelAccountDeletion.errorMessage")}
              </div>
              <Button asChild variant="primary">
                <Link href="/login">{t("cancelAccountDeletion.backToSignIn")}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
