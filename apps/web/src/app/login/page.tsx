"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MessageSquare,
  XCircle,
} from "lucide-react";
import { login, resendVerification, type AuthResult, isApiTimeoutError } from "@/lib/auth-api";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { useResendCooldown } from "@/lib/use-resend-cooldown";
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
  | { kind: "success"; data: AuthResult }
  | { kind: "error"; message: string }
  | { kind: "timeout" }
  | { kind: "unverified"; email: string }
  | { kind: "resend-loading"; email: string }
  | { kind: "resend-success"; email: string };

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

function BrandHero() {
  return (
    <div className="mb-5 flex flex-col items-center text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10 shadow-sm">
        <MessageSquare className="h-6 w-6" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { loginSuccess } = useAuth();
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formState, setFormState] = useState<FormState>({ kind: "idle" });
  const { cooldown, limitReached, canResend, startCooldown } =
    useResendCooldown();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setFormState({ kind: "error", message: t("auth.emailPasswordRequired") });
      return;
    }
    setFormState({ kind: "loading" });
    try {
      const data = await login({ email: email.trim(), password });
      loginSuccess(data);
      setFormState({ kind: "success", data });
      router.push("/dashboard");
    } catch (err) {
      if (isApiTimeoutError(err)) {
        setFormState({ kind: "timeout" });
        return;
      }
      const rawMessage = err instanceof Error ? err.message : "";
      if (
        rawMessage.toLowerCase().includes("email not verified") ||
        rawMessage.toLowerCase().includes("not verified")
      ) {
        setFormState({ kind: "unverified", email: email.trim() });
      } else {
        setFormState({
          kind: "error",
          message: localizeApiError(err, "auth.loginFailed", t),
        });
      }
    }
  }

  async function handleResend() {
    if (formState.kind !== "unverified" || !canResend) return;
    const targetEmail = formState.email;
    setFormState({ kind: "resend-loading", email: targetEmail });
    try {
      await resendVerification({ email: targetEmail });
      startCooldown();
      setFormState({ kind: "resend-success", email: targetEmail });
    } catch (err) {
      setFormState({
        kind: "error",
        message: localizeApiError(err, "auth.loginFailed", t),
      });
    }
  }

  const resendEmail =
    formState.kind === "unverified" || formState.kind === "resend-loading"
      ? formState.email
      : formState.kind === "resend-success"
        ? formState.email
        : "";

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4 sm:p-6">
      <BrandHero />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{t("auth.loginTitle")}</CardTitle>
          <CardDescription>{t("auth.loginSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-sm font-medium">
                {t("auth.email")}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-email"
                  name="login-email"
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
              <label htmlFor="login-password" className="text-sm font-medium">
                {t("auth.password")}
              </label>
              <div className="relative">
                <Input
                  id="login-password"
                  name="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
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
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={
                formState.kind === "loading" ||
                formState.kind === "resend-loading"
              }
            >
              {formState.kind === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("auth.signingIn")}
                </>
              ) : (
                t("auth.signIn")
              )}
            </Button>

            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button asChild variant="secondary" className="w-full">
            <Link href="/demo">{t("auth.tryDemo")}</Link>
          </Button>

          {(formState.kind === "unverified" ||
            formState.kind === "resend-loading") && (
            <div className="space-y-3">
              <Alert variant="warning">
                <div className="font-medium">{t("auth.emailNotVerified")}</div>
                <p className="mt-1 text-xs opacity-90">
                  {t("auth.emailNotVerifiedHint", resendEmail)}
                </p>
              </Alert>
              {limitReached ? (
                <Alert variant="error">
                  <span className="font-medium">
                    {t("auth.resendLimitReached")}
                  </span>
                </Alert>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={handleResend}
                  disabled={formState.kind === "resend-loading" || !canResend}
                >
                  {formState.kind === "resend-loading" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("auth.resendingVerification")}
                    </>
                  ) : cooldown > 0 ? (
                    t("auth.resendCooldown", String(cooldown))
                  ) : (
                    t("auth.resendVerification")
                  )}
                </Button>
              )}
            </div>
          )}

          {formState.kind === "resend-success" && (
            <div className="space-y-3">
              <Alert variant="success">
                <div className="font-medium">
                  {t("auth.resendVerificationSuccess")}
                </div>
                <p className="mt-1 text-xs opacity-90">
                  {t("auth.emailNotVerifiedHint", resendEmail)}
                </p>
              </Alert>
            </div>
          )}

          {formState.kind === "success" && (
            <Alert variant="success">
              <span className="font-medium">
                {t("auth.signedInAs")} {formState.data.user.email}
              </span>
            </Alert>
          )}

          {formState.kind === "error" && (
            <Alert variant="error">
              <span className="font-medium">{formState.message}</span>
            </Alert>
          )}

          {formState.kind === "timeout" && (
            <Alert variant="warning">
              <div className="font-medium">{t("api.timeoutError")}</div>
              <p className="mt-1 text-xs opacity-90">{t("api.coldStartHint")}</p>
            </Alert>
          )}

          <p className="text-center text-sm text-muted-foreground">
            {t("auth.noAccount")}{" "}
            <Link
              href="/register"
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary transition-colors"
            >
              {t("auth.createOne")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
