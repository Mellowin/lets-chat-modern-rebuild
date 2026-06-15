"use client";

import { useLayoutEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";

import { useAuth } from "@/lib/auth-context";
import { updateDisplayName, uploadAvatar, updateInterfaceLanguage, requestEmailChange, changePassword, listSessions, revokeOtherSessions, revokeSession } from "@/lib/auth-api";
import { useLocale, type Locale, localeLabel } from "@/lib/locale";
import { getAvatarUrl } from "@/lib/avatar-url";

type FormState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const LOCALE_OPTIONS: Locale[] = ["en", "uk", "ru"];

type TabKey = "account" | "security" | "sessions" | "language";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 dark:text-zinc-400">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
        <path d="M4 4l16 16" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 dark:text-zinc-400">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PasswordField({
  value,
  onChange,
  disabled,
  placeholder,
  "data-testid": dataTestId,
  id,
  name,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  placeholder?: string;
  "data-testid"?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
}) {
  const [show, setShow] = useState(false);
  const { t } = useLocale();
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        aria-label={ariaLabel}
        data-testid={dataTestId}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 pr-10 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100 disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t("profile.hidePassword") : t("profile.showPassword")}
        aria-pressed={show}
        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
        data-testid={dataTestId ? `${dataTestId}-toggle` : undefined}
      >
        <EyeIcon open={show} />
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const { user, accessToken, isLoading: authLoading, isAuthenticated, setUser } = useAuth();
  const { locale, setLocale: setLocaleState, t } = useLocale();

  const [activeTab, setActiveTab] = useState<TabKey>("account");

  const [displayNameInput, setDisplayNameInput] = useState("");
  const [displayNameState, setDisplayNameState] = useState<FormState>({ kind: "idle" });

  const [avatarState, setAvatarState] = useState<FormState>({ kind: "idle" });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [localeFormState, setLocaleFormState] = useState<FormState>({ kind: "idle" });

  const [newEmailInput, setNewEmailInput] = useState("");
  const [emailChangeState, setEmailChangeState] = useState<FormState>({ kind: "idle" });

  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordChangeState, setPasswordChangeState] = useState<FormState>({ kind: "idle" });
  const [passwordError, setPasswordError] = useState("");

  const [sessions, setSessions] = useState<import("@/lib/auth-api").SessionResponse[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [revokeState, setRevokeState] = useState<FormState>({ kind: "idle" });
  const [sessionRevokeState, setSessionRevokeState] = useState<
    | { kind: "idle" }
    | { kind: "loading"; sessionId: string }
    | { kind: "success"; sessionId: string }
    | { kind: "error"; sessionId: string; message: string }
  >({ kind: "idle" });
  const [showSessionsList, setShowSessionsList] = useState(false);
  const [showInactiveSessions, setShowInactiveSessions] = useState(false);

  useLayoutEffect(() => {
    if (user?.displayName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayNameInput(user.displayName);
    }
  }, [user?.displayName]);

  const loadSessions = useCallback(async () => {
    if (!accessToken || !isAuthenticated) return;
    setSessionsLoading(true);
    setSessionsError("");
    try {
      const data = await listSessions(accessToken);
      setSessions(data);
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : t("profile.loadingSessionsFailed"));
    } finally {
      setSessionsLoading(false);
    }
  }, [accessToken, isAuthenticated, t]);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSessions();
  }, [loadSessions]);

  const initials = useCallback(() => {
    const name = user?.displayName || user?.username || "?";
    return name.slice(0, 2).toUpperCase();
  }, [user?.displayName, user?.username]);

  async function handleRevokeOtherSessions() {
    if (!accessToken) return;
    const confirmed = window.confirm(t("profile.revokeOthersConfirm"));
    if (!confirmed) return;
    setRevokeState({ kind: "loading" });
    try {
      await revokeOtherSessions(accessToken);
      setRevokeState({ kind: "success" });
      await loadSessions();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("profile.revokeOthersFailed");
      setRevokeState({ kind: "error", message });
      await loadSessions();
    }
  }

  async function handleRevokeSession(sessionId: string, isCurrent: boolean) {
    if (!accessToken) return;
    if (isCurrent) {
      window.alert(t("profile.revokeCurrentSessionDisabled"));
      return;
    }
    if (!window.confirm(t("profile.revokeSessionConfirm"))) return;

    setSessionRevokeState({ kind: "loading", sessionId });
    try {
      await revokeSession(accessToken, sessionId);
      setSessionRevokeState({ kind: "success", sessionId });
      await loadSessions();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const isNotFound = raw.toLowerCase().includes("not found") || raw.includes("404");
      const message = isNotFound ? t("profile.sessionNotFoundRefreshed") : raw || t("profile.revokeSessionFailed");
      setSessionRevokeState({ kind: "error", sessionId, message });
      await loadSessions();
    }
  }

  async function handleSetLocale(next: Locale) {
    if (accessToken && isAuthenticated) {
      setLocaleFormState({ kind: "loading" });
      try {
        const updated = await updateInterfaceLanguage(accessToken, next);
        setUser(updated);
        setLocaleState(next);
        setLocaleFormState({ kind: "success" });
      } catch (err) {
        const message = err instanceof Error ? err.message : t("profile.languageSaveFailed");
        setLocaleFormState({ kind: "error", message });
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
      const message = err instanceof Error ? err.message : t("profile.errorUpdateDisplayNameFailed");
      setDisplayNameState({ kind: "error", message });
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setAvatarState({ kind: "error", message: t("profile.errorAvatarInvalidType") });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setAvatarState({ kind: "error", message: t("profile.errorAvatarTooLarge") });
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
        const message = err instanceof Error ? err.message : t("profile.errorUploadAvatarFailed");
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

  const TAB_ITEMS: { key: TabKey; label: string }[] = [
    { key: "account", label: t("profile.account") },
    { key: "security", label: t("profile.security") },
    { key: "sessions", label: t("profile.sessions") },
    { key: "language", label: t("profile.languageSection") },
  ];

  const activeCount = sessions.filter((s) => s.isActive && !s.revokedAt).length;
  const visibleSessions = showInactiveSessions
    ? sessions
    : sessions.filter((s) => s.isActive && !s.revokedAt);

  return (
    <div className="flex flex-col p-6 sm:p-10 max-w-3xl">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        {t("profile.back")}
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{t("profile.title")}</h1>

      <nav className="mt-6 flex flex-nowrap gap-2 overflow-x-auto pb-1" aria-label={t("profile.profileSettings")}>
        {TAB_ITEMS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={
                "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors shrink-0 " +
                (active
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800")
              }
              data-testid={`profile-tab-${tab.key}`}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "account" && (
        <div className="mt-6 space-y-6">
          <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("profile.accountInfo")}</h2>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">{t("profile.email")}</span>
              <span className="min-w-0 font-medium break-words">{user?.email}</span>
              <span className="text-zinc-500 dark:text-zinc-400">{t("profile.username")}</span>
              <span className="min-w-0 font-medium break-words">{user?.username}</span>
              <span className="text-zinc-500 dark:text-zinc-400">{t("profile.displayName")}</span>
              <span className="min-w-0 font-medium break-words">{user?.displayName ?? "—"}</span>
            </div>
          </div>

<div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("profile.avatar")}</h2>
            <div className="mt-3 flex items-center gap-4">
              <div className="relative h-16 w-16 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                {avatarPreview ? (
                  <Image src={avatarPreview} alt={t("profile.avatarPreviewAlt")} fill className="object-cover" unoptimized />
                ) : user?.avatarUrl ? (
                  <Image src={getAvatarUrl(user.avatarUrl) || ""} alt={t("profile.avatarAlt")} fill className="object-cover" unoptimized />
                ) : (
                  <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                    {initials()}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  id="profile-avatar-upload"
                  name="profile-avatar-upload"
                  aria-label={t("profile.avatar")}
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
                  className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors shrink-0"
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

          <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("profile.editDisplayName")}</h2>
            <form onSubmit={handleUpdateDisplayName} className="mt-3 flex flex-col sm:flex-row items-start gap-3">
              <input
                id="profile-display-name"
                name="profile-display-name"
                aria-label={t("profile.displayName")}
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
                className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors sm:shrink-0"
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
        </div>
      )}

      {activeTab === "security" && (
        <div className="mt-6 space-y-6">
          <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm" data-testid="change-email-section">
            <h2 className="text-sm font-semibold">{t("auth.changeEmailTitle")}</h2>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">{t("auth.currentEmail")}</span>
              <span className="min-w-0 font-medium break-words">{user?.email}</span>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!accessToken || !newEmailInput.trim()) return;
                setEmailChangeState({ kind: "loading" });
                try {
                  await requestEmailChange(accessToken, { newEmail: newEmailInput.trim() });
                  setEmailChangeState({ kind: "success" });
                  setNewEmailInput("");
                } catch (err) {
                  const message = err instanceof Error ? err.message : t("auth.emailChangeFailed");
                  setEmailChangeState({ kind: "error", message });
                }
              }}
              className="mt-3 flex flex-col sm:flex-row items-start gap-3"
            >
              <input
                id="profile-new-email"
                name="profile-new-email"
                aria-label={t("auth.changeEmailTitle")}
                type="email"
                placeholder={t("auth.emailPlaceholder")}
                value={newEmailInput}
                onChange={(e) => setNewEmailInput(e.target.value)}
                disabled={emailChangeState.kind === "loading"}
                className="flex-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100 disabled:opacity-60"
                data-testid="change-email-input"
              />
              <button
                type="submit"
                disabled={emailChangeState.kind === "loading"}
                className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors sm:shrink-0"
                data-testid="change-email-submit"
              >
                {emailChangeState.kind === "loading" ? t("profile.saving") : t("auth.requestChange")}
              </button>
            </form>
            {emailChangeState.kind === "success" && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {t("auth.emailChangeRequested")}
                </div>
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                  {t("auth.emailChangeLatestOnly")}
                </p>
              </div>
            )}
            {emailChangeState.kind === "error" && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {emailChangeState.message}
                </div>
              </div>
            )}
          </div>

          <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("profile.changePassword")}</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {t("profile.passwordFieldsRequired")}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPasswordError("");
                if (!accessToken) return;
                if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput) {
                  setPasswordError(t("profile.passwordFieldsRequired"));
                  return;
                }
                if (newPasswordInput !== confirmPasswordInput) {
                  setPasswordError(t("profile.passwordsDoNotMatch"));
                  return;
                }
                setPasswordChangeState({ kind: "loading" });
                try {
                  await changePassword(accessToken, {
                    currentPassword: currentPasswordInput,
                    newPassword: newPasswordInput,
                  });
                  setPasswordChangeState({ kind: "success" });
                  setCurrentPasswordInput("");
                  setNewPasswordInput("");
                  setConfirmPasswordInput("");
                } catch (err) {
                  const message = err instanceof Error ? err.message : t("profile.passwordChangeFailed");
                  setPasswordChangeState({ kind: "error", message });
                }
              }}
              className="mt-3 flex flex-col gap-3"
            >
              <PasswordField
                id="profile-current-password"
                name="profile-current-password"
                aria-label={t("profile.currentPassword")}
                placeholder={t("profile.currentPassword")}
                value={currentPasswordInput}
                onChange={(e) => setCurrentPasswordInput(e.target.value)}
                disabled={passwordChangeState.kind === "loading"}
                data-testid="current-password-field"
              />
              <PasswordField
                id="profile-new-password"
                name="profile-new-password"
                aria-label={t("profile.newPassword")}
                placeholder={t("profile.newPassword")}
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                disabled={passwordChangeState.kind === "loading"}
                data-testid="new-password-field"
              />
              <PasswordField
                id="profile-confirm-password"
                name="profile-confirm-password"
                aria-label={t("profile.confirmNewPassword")}
                placeholder={t("profile.confirmNewPassword")}
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value)}
                disabled={passwordChangeState.kind === "loading"}
                data-testid="confirm-password-field"
              />
              <button
                type="submit"
                disabled={passwordChangeState.kind === "loading"}
                className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors sm:shrink-0"
                data-testid="change-password-submit"
              >
                {passwordChangeState.kind === "loading" ? t("profile.saving") : t("profile.changePassword")}
              </button>
            </form>
            {passwordError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {passwordError}
                </div>
              </div>
            )}
            {passwordChangeState.kind === "success" && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {t("profile.passwordChanged")}
                </div>
              </div>
            )}
            {passwordChangeState.kind === "error" && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {passwordChangeState.message}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "sessions" && (
        <div className="mt-6 space-y-6">
          <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("profile.sessions")}</h2>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {t("profile.sessionsExplanation")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {!sessionsError && (
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  {t("profile.activeSessionsCount", String(activeCount))}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowSessionsList((s) => !s)}
                aria-expanded={showSessionsList}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                data-testid="toggle-sessions-list"
              >
                {showSessionsList ? t("profile.hideSessions") : t("profile.showSessions")}
              </button>
            </div>

            {sessionsError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {sessionsError}
                </div>
              </div>
            )}

            {showSessionsList && (
              <div className="mt-4">
                {sessionsLoading && (
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    {t("profile.loadingSessions")}
                  </div>
                )}
                {sessionsError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
                    <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      {sessionsError}
                    </div>
                  </div>
                )}
                {!sessionsLoading && !sessionsError && sessions.length === 0 && (
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    {t("profile.noSessions")}
                  </div>
                )}
                {!sessionsLoading && !sessionsError && sessions.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        id="show-inactive-sessions"
                        type="checkbox"
                        checked={showInactiveSessions}
                        onChange={(e) => setShowInactiveSessions(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:checked:bg-zinc-100 dark:checked:text-zinc-900"
                      />
                      <label htmlFor="show-inactive-sessions" className="text-xs text-zinc-600 dark:text-zinc-400">
                        {t("profile.showInactiveSessions")}
                      </label>
                    </div>
                    {visibleSessions.length === 0 && (
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        {t("profile.noInactiveSessions")}
                      </div>
                    )}
                    {visibleSessions.map((session) => {
                      let statusLabel = t("profile.sessionActive");
                      let statusClass = "text-emerald-600 dark:text-emerald-400";
                      if (session.revokedAt) {
                        statusLabel = t("profile.sessionRevoked");
                        statusClass = "text-zinc-500 dark:text-zinc-400";
                      } else if (!session.isActive) {
                        statusLabel = t("profile.sessionExpired");
                        statusClass = "text-amber-600 dark:text-amber-400";
                      }
                      const canRevoke = !session.revokedAt && session.isActive && !session.isCurrent;
                      const isRevoking = sessionRevokeState.kind === "loading" && sessionRevokeState.sessionId === session.id;
                      return (
                        <div
                          key={session.id}
                          data-testid={`session-item-${session.id}`}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-sm"
                        >
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-zinc-700 dark:text-zinc-300">
                              {t("profile.createdAt")}: {new Date(session.createdAt).toLocaleString()}
                            </span>
                            <span className="text-zinc-500 dark:text-zinc-400">
                              {t("profile.expiresAt")}: {new Date(session.expiresAt).toLocaleString()}
                            </span>
                            {session.userAgent && (
                              <span className="truncate text-zinc-500 dark:text-zinc-400" title={session.userAgent}>
                                {t("profile.sessionDevice")}: {session.userAgent}
                              </span>
                            )}
                            {session.ipAddress && (
                              <span className="text-zinc-500 dark:text-zinc-400">
                                IP: {session.ipAddress}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`font-medium ${statusClass}`}>{statusLabel}</span>
                            {session.isCurrent && (
                              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                                {t("profile.currentSession")}
                              </span>
                            )}
                            {session.isCurrent ? (
                              <span
                                className="inline-flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                                title={t("profile.revokeCurrentSessionDisabled")}
                                data-testid={`revoke-session-disabled-${session.id}`}
                              >
                                {t("profile.revokeSession")}
                              </span>
                            ) : canRevoke ? (
                              <button
                                type="button"
                                onClick={() => handleRevokeSession(session.id, session.isCurrent)}
                                disabled={isRevoking}
                                className="inline-flex items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-60 transition-colors"
                                data-testid={`revoke-session-${session.id}`}
                              >
                                {isRevoking ? t("profile.revokingSession") : t("profile.revokeSession")}
                              </button>
                            ) : null}
                          </div>
                          {sessionRevokeState.kind === "success" && sessionRevokeState.sessionId === session.id && (
                            <div className="sm:contents">
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
                                <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  {t("profile.revokeSessionSuccess")}
                                </div>
                              </div>
                            </div>
                          )}
                          {sessionRevokeState.kind === "error" && sessionRevokeState.sessionId === session.id && (
                            <div className="sm:contents">
                              <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs dark:border-red-900 dark:bg-red-950/30">
                                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                  {sessionRevokeState.message}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {sessionRevokeState.kind === "success" && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
                        <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {t("profile.revokeSessionSuccess")}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={handleRevokeOtherSessions}
                disabled={revokeState.kind === "loading" || sessionsLoading || activeCount <= 1}
                className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors sm:shrink-0"
                data-testid="revoke-other-sessions-button"
              >
                {revokeState.kind === "loading" ? t("profile.saving") : t("profile.revokeOtherSessions")}
              </button>
            </div>
            {revokeState.kind === "success" && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {t("profile.revokeOthersSuccess")}
                </div>
              </div>
            )}
            {revokeState.kind === "error" && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {revokeState.message}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "language" && (
        <div className="mt-6 space-y-6">
          <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("profile.interfaceLanguage")}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {LOCALE_OPTIONS.map((loc) => {
                const active = locale === loc;
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => handleSetLocale(loc)}
                    disabled={localeFormState.kind === "loading"}
                    className={
                      "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 shrink-0 " +
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
            {localeFormState.kind === "success" && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {t("profile.languageSaved")}
                </div>
              </div>
            )}
            {localeFormState.kind === "error" && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {localeFormState.message}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
