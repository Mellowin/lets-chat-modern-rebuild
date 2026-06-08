"use client";

import { useState } from "react";
import Link from "next/link";
import { register, resendVerification } from "@/lib/auth-api";
import { useLocale } from "@/lib/locale";

type FormState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; email: string }
  | { kind: "error"; message: string }
  | { kind: "resend-loading"; email: string }
  | { kind: "resend-success"; message: string };

export default function RegisterPage() {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
      const message = err instanceof Error ? err.message : t("auth.registrationFailed");
      setFormState({ kind: "error", message });
    }
  }

  async function handleResend() {
    const targetEmail = formState.kind === "success" || formState.kind === "resend-loading"
      ? formState.email
      : email;
    setFormState({ kind: "resend-loading", email: targetEmail });
    try {
      const data = await resendVerification({ email: targetEmail });
      setFormState({ kind: "resend-success", message: data.message });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("auth.registrationFailed");
      setFormState({ kind: "error", message });
    }
  }

  const showSuccessPanel = formState.kind === "success" || formState.kind === "resend-loading" || formState.kind === "resend-success";
  const displayEmail = formState.kind === "success" || formState.kind === "resend-loading"
    ? formState.email
    : email;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{t("auth.registerTitle")}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("auth.registerSubtitle")}
        </p>

        {showSuccessPanel ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {t("auth.checkYourEmail")}
              </div>
              <p className="mt-2 text-emerald-700 dark:text-emerald-300">
                {t("auth.verificationEmailSent")}{" "}
                <span className="font-medium">{displayEmail}</span>
              </p>
            </div>

            {formState.kind === "resend-success" && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {formState.message}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleResend}
              disabled={formState.kind === "resend-loading"}
              className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {formState.kind === "resend-loading" ? t("auth.resendingVerification") : t("auth.resendVerification")}
            </button>

            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              {t("auth.signIn")}
            </Link>
          </div>
        ) : (
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
              <label htmlFor="username" className="block text-sm font-medium">
                {t("auth.username")}
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                minLength={3}
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
                placeholder={t("auth.usernamePlaceholder")}
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {t("auth.usernameHint")}
              </p>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                {t("auth.password")}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
                placeholder="••••••••"
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {t("auth.passwordHint")}
              </p>
            </div>

            <button
              type="submit"
              disabled={formState.kind === "loading"}
              className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              {formState.kind === "loading" ? t("auth.creatingAccount") : t("auth.registerTitle")}
            </button>
          </form>
        )}

        {formState.kind === "error" && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {formState.message}
            </div>
          </div>
        )}

        {!showSuccessPanel && (
          <p className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {t("auth.alreadyHaveAccount")}{" "}
            <Link
              href="/login"
              className="font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
            >
              {t("auth.signIn")}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
