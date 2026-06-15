"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  XCircle,
} from "lucide-react";
import { verifyEmail, resendVerification } from "@/lib/auth-api";
import { useLocale } from "@/lib/locale";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type VerifyState =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "success" }
  | { kind: "error"; message: string }
  | { kind: "missing-token" }
  | { kind: "resend-loading" }
  | { kind: "resend-success"; message: string };

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

export default function VerifyEmailPage() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [verifyState, setVerifyState] = useState<VerifyState>({ kind: "idle" });
  const [emailInput, setEmailInput] = useState("");

  const doVerify = useCallback(
    async (verifyToken: string) => {
      setVerifyState({ kind: "verifying" });
      try {
        await verifyEmail({ token: verifyToken });
        setVerifyState({ kind: "success" });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : t("auth.emailVerificationFailed");
        setVerifyState({ kind: "error", message });
      }
    },
    [t],
  );

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVerifyState({ kind: "missing-token" });
      return;
    }
    void doVerify(token);
  }, [token, doVerify]);

  async function handleResend() {
    const email = emailInput.trim();
    if (!email) return;
    setVerifyState({ kind: "resend-loading" });
    try {
      const data = await resendVerification({ email });
      setVerifyState({ kind: "resend-success", message: data.message });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("auth.emailVerificationFailed");
      setVerifyState({ kind: "error", message });
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{t("auth.verifyEmailTitle")}</CardTitle>

        </CardHeader>
        <CardContent className="space-y-4">
          {verifyState.kind === "verifying" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("auth.verifyingEmail")}
            </div>
          )}

          {verifyState.kind === "success" && (
            <>
              <Alert variant="success">
                <span className="font-medium">{t("auth.emailVerified")}</span>
              </Alert>
              <p className="text-center text-sm text-muted-foreground">
                {t("auth.signInAfterVerification")}
              </p>
              <Button asChild className="w-full">
                <Link href="/login">{t("auth.signIn")}</Link>
              </Button>
            </>
          )}

          {verifyState.kind === "missing-token" && (
            <>
              <Alert variant="error">
                <span className="font-medium">
                  {t("auth.emailVerificationMissingToken")}
                </span>
              </Alert>
              <Button asChild className="w-full">
                <Link href="/login">{t("auth.backToSignIn")}</Link>
              </Button>
            </>
          )}

          {verifyState.kind === "error" && (
            <>
              <Alert variant="error">
                <span className="font-medium">{verifyState.message}</span>
              </Alert>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("auth.resendVerification")}
                </p>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="verify-email-email"
                    name="verify-email-email"
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder={t("auth.emailPlaceholder")}
                    aria-label={t("auth.email")}
                    className="pl-9"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={handleResend}
                >
                  {t("auth.resendVerification")}
                </Button>
              </div>

              <Button asChild className="w-full">
                <Link href="/login">{t("auth.backToSignIn")}</Link>
              </Button>
            </>
          )}

          {verifyState.kind === "resend-success" && (
            <Alert variant="success">
              <span className="font-medium">{verifyState.message}</span>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
