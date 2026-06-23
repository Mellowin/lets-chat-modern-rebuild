"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  User,
  XCircle,
} from "lucide-react";
import { register, resendVerification } from "@/lib/auth-api";
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
  | { kind: "success"; email: string }
  | { kind: "error"; message: string }
  | { kind: "resend-loading"; email: string }
  | { kind: "resend-success"; message: string };

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

export default function RegisterPage() {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formState, setFormState] = useState<FormState>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUsername = username.trim();
    if (!email.trim() || !trimmedUsername || !password.trim()) {
      setFormState({ kind: "error", message: t("auth.allFieldsRequired") });
      return;
    }
    if (!/^[a-zA-Z0-9_а-яА-ЯёЁіІїЇєЄґҐ]+$/.test(trimmedUsername)) {
      setFormState({ kind: "error", message: t("auth.usernameInvalid") });
      return;
    }
    setFormState({ kind: "loading" });
    try {
      const data = await register({
        email: email.trim(),
        username: username.trim(),
        password,
      });
      setFormState({ kind: "success", email: data.email });
    } catch (err) {
      setFormState({
        kind: "error",
        message: localizeApiError(err, "auth.registrationFailed", t),
      });
    }
  }

  async function handleResend() {
    const targetEmail =
      formState.kind === "success" || formState.kind === "resend-loading"
        ? formState.email
        : email;
    setFormState({ kind: "resend-loading", email: targetEmail });
    try {
      const data = await resendVerification({ email: targetEmail });
      setFormState({ kind: "resend-success", message: data.message });
    } catch (err) {
      setFormState({
        kind: "error",
        message: localizeApiError(err, "auth.registrationFailed", t),
      });
    }
  }

  const showSuccessPanel =
    formState.kind === "success" ||
    formState.kind === "resend-loading" ||
    formState.kind === "resend-success";
  const displayEmail =
    formState.kind === "success" || formState.kind === "resend-loading"
      ? formState.email
      : email;

  return (
    <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{t("auth.registerTitle")}</CardTitle>
          <CardDescription>{t("auth.registerSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showSuccessPanel ? (
            <div className="space-y-4">
              <Alert variant="success">
                <div className="font-medium">{t("auth.checkYourEmail")}</div>
                <p className="mt-1 text-xs opacity-90">
                  {t("auth.verificationEmailSent")}{" "}
                  <span className="font-semibold">{displayEmail}</span>
                </p>
              </Alert>

              {formState.kind === "resend-success" && (
                <Alert variant="success">
                  <span className="font-medium">{formState.message}</span>
                </Alert>
              )}

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={handleResend}
                disabled={formState.kind === "resend-loading"}
              >
                {formState.kind === "resend-loading"
                  ? t("auth.resendingVerification")
                  : t("auth.resendVerification")}
              </Button>

              <Button asChild className="w-full">
                <Link href="/login">{t("auth.signIn")}</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="register-email" className="text-sm font-medium">
                  {t("auth.email")}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="register-email"
                    name="register-email"
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

              <div className="space-y-1.5">
                <label htmlFor="register-username" className="text-sm font-medium">
                  {t("auth.username")}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="register-username"
                    name="register-username"
                    type="text"
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={32}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("auth.usernamePlaceholder")}
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("auth.usernameHint")}
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="register-password" className="text-sm font-medium">
                  {t("auth.password")}
                </label>
                <div className="relative">
                  <Input
                    id="register-password"
                    name="register-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <Button
                    type="button"
                    variant="icon"
                    size="sm"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={
                      showPassword
                        ? t("profile.hidePassword")
                        : t("profile.showPassword")
                    }
                    aria-pressed={showPassword}
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("auth.passwordHint")}
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={formState.kind === "loading"}
              >
                {formState.kind === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("auth.creatingAccount")}
                  </>
                ) : (
                  t("auth.registerTitle")
                )}
              </Button>
            </form>
          )}

          {formState.kind === "error" && (
            <Alert variant="error">
              <span className="font-medium">{formState.message}</span>
            </Alert>
          )}

          {!showSuccessPanel && (
            <p className="text-center text-sm text-muted-foreground">
              {t("auth.alreadyHaveAccount")}{" "}
              <Link
                href="/login"
                className="font-medium text-foreground underline underline-offset-2 hover:text-primary transition-colors"
              >
                {t("auth.signIn")}
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
