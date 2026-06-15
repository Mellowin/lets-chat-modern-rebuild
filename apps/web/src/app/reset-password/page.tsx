"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  XCircle,
} from "lucide-react";
import { resetPassword } from "@/lib/auth-api";
import { useLocale } from "@/lib/locale";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type FormState =
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

function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const { t } = useLocale();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          className="pl-9 pr-10"
        />
        <Button
          type="button"
          variant="icon"
          size="sm"
          onClick={() => setShow((s) => !s)}
          aria-label={
            show ? t("profile.hidePassword") : t("profile.showPassword")
          }
          aria-pressed={show}
          className="absolute right-1 top-1/2 -translate-y-1/2"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>
      </div>
    </div>
  );
}

export function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formState, setFormState] = useState<FormState>({ kind: "idle" });

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormState({ kind: "error", message: t("auth.passwordResetFailed") });
    }
  }, [token, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirmPassword) {
      setFormState({ kind: "error", message: t("auth.passwordsDoNotMatch") });
      return;
    }
    if (password.length < 8) {
      setFormState({ kind: "error", message: t("auth.passwordMinLength") });
      return;
    }
    setFormState({ kind: "loading" });
    try {
      await resetPassword({ token, password });
      setFormState({ kind: "success" });
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("auth.passwordResetFailed");
      setFormState({ kind: "error", message });
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{t("auth.resetPasswordTitle")}</CardTitle>

        </CardHeader>
        <CardContent className="space-y-4">
          {formState.kind === "success" ? (
            <Alert variant="success">
              <div className="font-medium">{t("auth.passwordResetSuccess")}</div>
              <p className="mt-1 text-xs opacity-90">
                <Link
                  href="/login"
                  className="underline underline-offset-2 hover:text-emerald-900 dark:hover:text-emerald-200"
                >
                  {t("auth.backToSignIn")}
                </Link>
              </p>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <PasswordField
                id="reset-password-password"
                name="reset-password-password"
                label={t("auth.newPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={formState.kind === "loading" || !token}
                placeholder="••••••••"
              />

              <PasswordField
                id="reset-password-confirm-password"
                name="reset-password-confirm-password"
                label={t("auth.confirmPassword")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={formState.kind === "loading" || !token}
                placeholder="••••••••"
              />

              <Button
                type="submit"
                className="w-full"
                disabled={formState.kind === "loading" || !token}
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
          )}

          {formState.kind === "error" && (
            <Alert variant="error">
              <span className="font-medium">{formState.message}</span>
            </Alert>
          )}

          {formState.kind !== "success" && (
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/login"
                className="font-medium text-foreground underline underline-offset-2 hover:text-primary transition-colors"
              >
                {t("auth.backToSignIn")}
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Reset password</CardTitle>
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
      <ResetPasswordContent />
    </Suspense>
  );
}
