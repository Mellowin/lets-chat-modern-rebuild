"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { confirmEmailChange } from "@/lib/auth-api";
import { useLocale } from "@/lib/locale";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

function Alert({
  variant,
  children,
}: {
  variant: "success" | "error";
  children: React.ReactNode;
}) {
  const variants = {
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400",
    error:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400",
  };
  const icons = {
    success: <CheckCircle2 className="h-4 w-4 shrink-0" />,
    error: <XCircle className="h-4 w-4 shrink-0" />,
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

export function ConfirmEmailChangeContent() {
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const token = searchParams.get("token");
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: "error", message: t("auth.emailChangeFailed") });
      return;
    }
    setState({ kind: "loading" });
    confirmEmailChange({ token })
      .then(() => setState({ kind: "success" }))
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : t("auth.emailChangeFailed");
        setState({ kind: "error", message });
      });
  }, [token, t]);

  return (
    <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{t("auth.confirmEmailChangeTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.kind === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("auth.loading")}
            </div>
          )}

          {state.kind === "success" && (
            <Alert variant="success">
              <div className="font-medium">{t("auth.emailChanged")}</div>
              <p className="mt-1 text-xs opacity-90">
                <Link
                  href="/login"
                  className="underline underline-offset-2 hover:text-emerald-900 dark:hover:text-emerald-200"
                >
                  {t("auth.backToSignIn")}
                </Link>
              </p>
            </Alert>
          )}

          {state.kind === "error" && (
            <Alert variant="error">
              <div className="font-medium">{state.message}</div>
              <p className="mt-1 text-xs opacity-90">
                <Link
                  href="/login"
                  className="underline underline-offset-2 hover:text-red-900 dark:hover:text-red-200"
                >
                  {t("auth.backToSignIn")}
                </Link>
              </p>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ConfirmEmailChangePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Confirm email change</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <ConfirmEmailChangeContent />
    </Suspense>
  );
}
