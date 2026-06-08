"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, resendVerification, type AuthResult } from "@/lib/auth-api";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";

type FormState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: AuthResult }
  | { kind: "error"; message: string }
  | { kind: "unverified"; email: string }
  | { kind: "resend-loading"; email: string }
  | { kind: "resend-success"; message: string };

export default function LoginPage() {
  const router = useRouter();
  const { loginSuccess } = useAuth();
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formState, setFormState] = useState<FormState>({ kind: "idle" });

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
      const message = err instanceof Error ? err.message : t("auth.loginFailed");
      if (message.toLowerCase().includes("email not verified") || message.toLowerCase().includes("not verified")) {
        setFormState({ kind: "unverified", email: email.trim() });
      } else {
        setFormState({ kind: "error", message });
      }
    }
  }

  async function handleResend() {
    if (formState.kind !== "unverified") return;
    setFormState({ kind: "resend-loading", email: formState.email });
    try {
      const data = await resendVerification({ email: formState.email });
      setFormState({ kind: "resend-success", message: data.message });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("auth.loginFailed");
      setFormState({ kind: "error", message });
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{t("auth.loginTitle")}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("auth.loginSubtitle")}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              {t("auth.email")}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
              placeholder={t("auth.emailPlaceholder")}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={formState.kind === "loading" || formState.kind === "resend-loading"}
            className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {formState.kind === "loading" ? t("auth.signingIn") : t("auth.signIn")}
          </button>

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline underline-offset-2 transition-colors"
            >
              {t("auth.forgotPassword")}
            </Link>
          </div>
        </form>

        {formState.kind === "unverified" && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {t("auth.emailNotVerified")}
              </div>
            </div>
            <button
              type="button"
              onClick={handleResend}
              className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {t("auth.resendVerification")}
            </button>
          </div>
        )}

        {formState.kind === "resend-success" && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {formState.message}
            </div>
          </div>
        )}

        {formState.kind === "success" && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t("auth.signedInAs")} {formState.data.user.email}
            </div>
          </div>
        )}

        {formState.kind === "error" && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {formState.message}
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {t("auth.noAccount")}{" "}
          <Link
            href="/register"
            className="font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
          >
            {t("auth.createOne")}
          </Link>
        </p>
      </div>
    </div>
  );
}
