"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createDemoSession, isApiTimeoutError } from "@/lib/auth-api";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";

export default function DemoPage() {
  const router = useRouter();
  const { loginSuccess } = useAuth();
  const { t } = useLocale();
  const [state, setState] = useState<{
    kind: "loading" | "error" | "timeout";
    message?: string;
  }>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function startDemo() {
      try {
        const session = await createDemoSession();
        if (cancelled) return;
        loginSuccess(session);
        router.replace(
          `/workspaces/${session.workspace.id}/channels/${session.defaultChannel.id}`,
        );
      } catch (err) {
        if (cancelled) return;
        if (isApiTimeoutError(err)) {
          setState({ kind: "timeout" });
          return;
        }
        setState({
          kind: "error",
          message: localizeApiError(err, "auth.demoUnavailable", t),
        });
      }
    }

    startDemo();

    return () => {
      cancelled = true;
    };
  }, [loginSuccess, router, t]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{t("auth.tryDemo")}</CardTitle>
          <CardDescription>
            {state.kind === "loading"
              ? t("auth.demoLoading")
              : t("auth.demoUnavailable")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.kind === "loading" && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {state.kind === "timeout" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
              <div className="font-medium">{t("api.timeoutError")}</div>
              <p className="mt-1 text-xs opacity-90">{t("api.coldStartHint")}</p>
            </div>
          )}

          {state.kind === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
              <span className="font-medium">{state.message}</span>
            </div>
          )}

          {state.kind !== "loading" && (
            <Button asChild variant="secondary" className="w-full">
              <a href="/login">{t("auth.backToSignIn")}</a>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
