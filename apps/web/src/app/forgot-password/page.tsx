"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Mail, XCircle } from "lucide-react";
import { forgotPassword } from "@/lib/auth-api";
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
import { Input } from "@/components/ui/Input";

type FormState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "sent" }
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

export default function ForgotPasswordPage() {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [formState, setFormState] = useState<FormState>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setFormState({ kind: "loading" });
    try {
      await forgotPassword({ email: email.trim() });
      setFormState({ kind: "sent" });
    } catch (err) {
      setFormState({
        kind: "error",
        message: localizeApiError(err, "auth.passwordResetFailed", t),
      });
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{t("auth.forgotPasswordTitle")}</CardTitle>
          <CardDescription>{t("auth.forgotPasswordSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="forgot-password-email" className="text-sm font-medium">
                {t("auth.email")}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="forgot-password-email"
                  name="forgot-password-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="pl-9"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={formState.kind === "loading" || formState.kind === "sent"}
            >
              {formState.kind === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("auth.loading")}
                </>
              ) : (
                t("auth.sendResetLink")
              )}
            </Button>
          </form>

          {formState.kind === "sent" && (
            <Alert variant="success">
              <span className="font-medium">{t("auth.resetLinkSent")}</span>
            </Alert>
          )}

          {formState.kind === "error" && (
            <Alert variant="error">
              <span className="font-medium">{formState.message}</span>
            </Alert>
          )}

          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary transition-colors"
            >
              {t("auth.backToSignIn")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
