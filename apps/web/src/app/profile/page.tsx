"use client";

import { useLayoutEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { updateDisplayName, uploadAvatar, updateInterfaceLanguage } from "@/lib/auth-api";
import { useLocale, type Locale, localeLabel } from "@/lib/locale";

type FormState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const LOCALE_OPTIONS: Locale[] = ["en", "uk", "ru"];

export default function ProfilePage() {
  const { user, accessToken, isLoading: authLoading, isAuthenticated, setUser } = useAuth();
  const { locale, setLocale: setLocaleState, t } = useLocale();

  const [displayNameInput, setDisplayNameInput] = useState("");
  const [displayNameState, setDisplayNameState] = useState<FormState>({ kind: "idle" });

  const [avatarState, setAvatarState] = useState<FormState>({ kind: "idle" });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (user?.displayName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayNameInput(user.displayName);
    }
  }, [user?.displayName]);

  const initials = useCallback(() => {
    const name = user?.displayName || user?.username || "?";
    return name.slice(0, 2).toUpperCase();
  }, [user?.displayName, user?.username]);

  async function handleSetLocale(next: Locale) {
    if (accessToken && isAuthenticated) {
      try {
        const updated = await updateInterfaceLanguage(accessToken, next);
        setUser(updated);
        setLocaleState(next);
      } catch {
        setLocaleState(next);
      }
    } else {
      setLocaleState(next);
    }
  }

  async function handleUpdateDisplayName(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setDisplayNameState({ kind: "loading" });
    try {
      const updated = await updateDisplayName(accessToken, displayNameInput);
      setUser(updated);
      setDisplayNameState({ kind: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update display name";
      setDisplayNameState({ kind: "error", message });
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setAvatarState({ kind: "error", message: "Only JPEG, PNG, or WebP images are allowed" });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setAvatarState({ kind: "error", message: "Image must be 2 MB or smaller" });
      return;
    }

    setAvatarState({ kind: "idle" });
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);

    void (async () => {
      if (!accessToken) return;
      setAvatarState({ kind: "loading" });
      try {
        const updated = await uploadAvatar(accessToken, file);
        setUser(updated);
        setAvatarState({ kind: "success" });
        setAvatarPreview(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to upload avatar";
        setAvatarState({ kind: "error", message });
      }
    })();
  }

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          {t("auth.loadingSession")}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t("auth.authRequired")}</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t("auth.pleaseSignIn")}
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {t("auth.signIn")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-6 sm:p-10 max-w-3xl">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        {t("profile.back")}
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{t("profile.title")}</h1>

      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">{t("profile.accountInfo")}</h2>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 dark:text-zinc-400 w-20">{t("profile.email")}</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 dark:text-zinc-400 w-20">{t("profile.username")}</span>
            <span className="font-medium">{user?.username}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 dark:text-zinc-400 w-20">{t("profile.displayName")}</span>
            <span className="font-medium">{user?.displayName ?? "—"}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">{t("profile.avatar")}</h2>
        <div className="mt-3 flex items-center gap-4">
          <div className="relative h-16 w-16 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
            {avatarPreview ? (
              <Image src={avatarPreview} alt="Avatar preview" fill className="object-cover" unoptimized />
            ) : user?.avatarUrl ? (
              <Image src={user.avatarUrl} alt="Avatar" fill className="object-cover" unoptimized />
            ) : (
              <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                {initials()}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarState.kind === "loading"}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              {avatarState.kind === "loading" ? t("profile.uploading") : t("profile.uploadAvatar")}
            </button>
            {avatarState.kind === "success" && (
              <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                {t("profile.avatarUpdated")}
              </div>
            )}
            {avatarState.kind === "error" && (
              <div className="text-sm font-medium text-red-700 dark:text-red-400">
                {avatarState.message}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">{t("profile.editDisplayName")}</h2>
        <form onSubmit={handleUpdateDisplayName} className="mt-3 flex flex-col sm:flex-row items-start gap-3">
          <input
            type="text"
            placeholder={t("profile.displayNamePlaceholder")}
            value={displayNameInput}
            onChange={(e) => setDisplayNameInput(e.target.value)}
            disabled={displayNameState.kind === "loading"}
            className="flex-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={displayNameState.kind === "loading"}
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            {displayNameState.kind === "loading" ? t("profile.saving") : t("profile.save")}
          </button>
        </form>
        {displayNameState.kind === "success" && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t("profile.displayNameUpdated")}
            </div>
          </div>
        )}
        {displayNameState.kind === "error" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {displayNameState.message}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">{t("profile.interfaceLanguage")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {LOCALE_OPTIONS.map((loc) => {
            const active = locale === loc;
            return (
              <button
                key={loc}
                type="button"
                onClick={() => handleSetLocale(loc)}
                className={
                  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors " +
                  (active
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800")
                }
              >
                {localeLabel(loc)}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {t("profile.selected")} {localeLabel(locale)}
        </p>
      </div>
    </div>
  );
}
