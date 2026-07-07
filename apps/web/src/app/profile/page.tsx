"use client";

import { useLayoutEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Bell,
  ChevronLeft,
  ShieldAlert,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Mail,
  Monitor,
  Shield,
  Smartphone,
  User,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import {
  updateDisplayName,
  uploadAvatar,
  updateInterfaceLanguage,
  requestEmailChange,
  changePassword,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  updateContactPrivacy,
} from "@/lib/auth-api";
import { useLocale, type Locale, localeLabel } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { PushNotificationsSection } from "./PushNotificationsSection";
import { NotificationPreferencesSection } from "./NotificationPreferencesSection";
import { PwaInstallSection } from "./PwaInstallSection";

type FormState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const LOCALE_OPTIONS: Locale[] = ["en", "uk", "ru"];

type TabKey = "account" | "security" | "sessions" | "language" | "notifications" | "app" | "safety";

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
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${variants[variant]}`}
      role="alert"
    >
      {children}
    </div>
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
      <Input
        id={id}
        name={name}
        aria-label={ariaLabel}
        data-testid={dataTestId}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="pr-10"
      />
      <Button
        type="button"
        variant="icon"
        size="sm"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t("profile.hidePassword") : t("profile.showPassword")}
        aria-pressed={show}
        data-testid={dataTestId ? `${dataTestId}-toggle` : undefined}
        className="absolute right-1 top-1/2 -translate-y-1/2"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </Button>
    </div>
  );
}

export default function ProfilePage() {
  const {
    user,
    accessToken,
    isLoading: authLoading,
    isAuthenticated,
    setUser,
  } = useAuth();
  const { locale, setLocale: setLocaleState, t } = useLocale();

  const [activeTab, setActiveTab] = useState<TabKey>("account");

  const [displayNameInput, setDisplayNameInput] = useState("");
  const [displayNameState, setDisplayNameState] = useState<FormState>({
    kind: "idle",
  });

  const [contactPrivacyInput, setContactPrivacyInput] = useState<
    "EVERYONE" | "REQUESTS_ONLY" | "NOBODY"
  >("EVERYONE");
  const [contactPrivacyState, setContactPrivacyState] = useState<FormState>({
    kind: "idle",
  });

  const [avatarState, setAvatarState] = useState<FormState>({ kind: "idle" });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [localeFormState, setLocaleFormState] = useState<FormState>({
    kind: "idle",
  });

  const [newEmailInput, setNewEmailInput] = useState("");
  const [emailChangeState, setEmailChangeState] = useState<FormState>({
    kind: "idle",
  });

  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordChangeState, setPasswordChangeState] = useState<FormState>({
    kind: "idle",
  });
  const [passwordError, setPasswordError] = useState("");

  const [sessions, setSessions] = useState<
    import("@/lib/auth-api").SessionResponse[]
  >([]);
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
    if (user?.contactPrivacySetting) {
       
      setContactPrivacyInput(user.contactPrivacySetting);
    }
  }, [user?.displayName, user?.contactPrivacySetting]);

  const loadSessions = useCallback(async () => {
    if (!accessToken || !isAuthenticated) return;
    setSessionsLoading(true);
    setSessionsError("");
    try {
      const data = await listSessions(accessToken);
      setSessions(data);
    } catch (err) {
      setSessionsError(
        localizeApiError(err, "profile.loadingSessionsFailed", t),
      );
    } finally {
      setSessionsLoading(false);
    }
  }, [accessToken, isAuthenticated, t]);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSessions();
  }, [loadSessions]);

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
      const message = localizeApiError(err, "profile.revokeOthersFailed", t);
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
      const isNotFound =
        raw.toLowerCase().includes("not found") || raw.includes("404");
      const message = isNotFound
        ? t("profile.sessionNotFoundRefreshed")
        : raw || t("profile.revokeSessionFailed");
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
        const message = localizeApiError(err, "profile.languageSaveFailed", t);
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
      const message = localizeApiError(err, "profile.errorUpdateDisplayNameFailed", t);
      setDisplayNameState({ kind: "error", message });
    }
  }

  async function handleUpdateContactPrivacy(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setContactPrivacyState({ kind: "loading" });
    try {
      const updated = await updateContactPrivacy(accessToken, contactPrivacyInput);
      setUser(updated);
      setContactPrivacyState({ kind: "success" });
    } catch (err) {
      const message = localizeApiError(err, "profile.contactPrivacySaveFailed", t);
      setContactPrivacyState({ kind: "error", message });
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setAvatarState({
        kind: "error",
        message: t("profile.errorAvatarInvalidType"),
      });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setAvatarState({
        kind: "error",
        message: t("profile.errorAvatarTooLarge"),
      });
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
        const message = localizeApiError(err, "profile.errorUploadAvatarFailed", t);
        setAvatarState({ kind: "error", message });
      }
    })();
  }

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("auth.loadingSession")}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>{t("auth.authRequired")}</CardTitle>
            <CardDescription>{t("auth.pleaseSignIn")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/login">{t("auth.signIn")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const TAB_ITEMS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "account", label: t("profile.account"), icon: <User size={16} /> },
    {
      key: "security",
      label: t("profile.security"),
      icon: <Shield size={16} />,
    },
    {
      key: "sessions",
      label: t("profile.sessions"),
      icon: <Smartphone size={16} />,
    },
    {
      key: "language",
      label: t("profile.languageSection"),
      icon: <Globe size={16} />,
    },
    {
      key: "notifications",
      label: t("profile.notifications"),
      icon: <Bell size={16} />,
    },
    {
      key: "app",
      label: t("profile.appInstall"),
      icon: <Smartphone size={16} />,
    },
    {
      key: "safety",
      label: t("safety.title"),
      icon: <ShieldAlert size={16} />,
    },
  ];

  const activeCount = sessions.filter((s) => s.isActive && !s.revokedAt).length;
  const visibleSessions = showInactiveSessions
    ? sessions
    : sessions.filter((s) => s.isActive && !s.revokedAt);

  const currentSession = sessions.find((s) => s.isCurrent);
  const otherSessions = visibleSessions.filter((s) => !s.isCurrent);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 sm:p-10">
      <Link
        href="/dashboard"
        className="inline-flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <ChevronLeft size={16} />
        {t("profile.back")}
      </Link>

      <PageHeader
        title={t("profile.title")}
        subtitle={t("profile.account")}
      />

      <Card className="p-1">
        <nav
          className="flex flex-nowrap gap-1 overflow-x-auto"
          aria-label={t("profile.profileSettings")}
        >
          {TAB_ITEMS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Button
                key={tab.key}
                type="button"
                variant={active ? "primary" : "ghost"}
                size="sm"
                onClick={() => setActiveTab(tab.key)}
                data-testid={`profile-tab-${tab.key}`}
                aria-current={active ? "page" : undefined}
                className="shrink-0"
              >
                {tab.icon}
                {tab.label}
              </Button>
            );
          })}
        </nav>
      </Card>

      {activeTab === "account" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("profile.accountInfo")}</CardTitle>
              <CardDescription>{t("profile.accountSettings")}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail size={14} />
                  {t("profile.email")}
                </dt>
                <dd className="min-w-0 break-words text-sm font-medium">
                  {user?.email}
                </dd>
                <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User size={14} />
                  {t("profile.username")}
                </dt>
                <dd className="min-w-0 break-words text-sm font-medium">
                  {user?.username}
                </dd>
                <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield size={14} />
                  {t("profile.displayName")}
                </dt>
                <dd className="min-w-0 break-words text-sm font-medium">
                  {user?.displayName ?? "—"}
                </dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("profile.avatar")}</CardTitle>
              <CardDescription>{t("profile.avatarAlt")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <Avatar
                  src={avatarPreview ?? user?.avatarUrl}
                  alt={t("profile.avatarAlt")}
                  name={user?.displayName || user?.username}
                  size="lg"
                  className="ring-2 ring-border"
                />
                <div className="flex flex-col gap-2 min-w-0 flex-1">
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
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarState.kind === "loading"}
                    className="w-fit"
                  >
                    {avatarState.kind === "loading"
                      ? t("profile.uploading")
                      : t("profile.uploadAvatar")}
                  </Button>
                  {avatarState.kind === "success" && (
                    <Alert variant="success">{t("profile.avatarUpdated")}</Alert>
                  )}
                  {avatarState.kind === "error" && (
                    <Alert variant="error">{avatarState.message}</Alert>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("profile.editDisplayName")}</CardTitle>
              <CardDescription>{t("profile.displayNamePlaceholder")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleUpdateDisplayName}
                className="flex flex-col items-start gap-3 sm:flex-row"
              >
                <Input
                  id="profile-display-name"
                  name="profile-display-name"
                  aria-label={t("profile.displayName")}
                  type="text"
                  placeholder={t("profile.displayNamePlaceholder")}
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  disabled={displayNameState.kind === "loading"}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={displayNameState.kind === "loading"}
                  data-testid="display-name-save"
                >
                  {displayNameState.kind === "loading"
                    ? t("profile.saving")
                    : t("profile.save")}
                </Button>
              </form>
              {displayNameState.kind === "success" && (
                <div className="mt-3">
                  <Alert variant="success">
                    {t("profile.displayNameUpdated")}
                  </Alert>
                </div>
              )}
              {displayNameState.kind === "error" && (
                <div className="mt-3">
                  <Alert variant="error">{displayNameState.message}</Alert>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("profile.contactPrivacy")}</CardTitle>
              <CardDescription>{t("profile.contactPrivacyDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateContactPrivacy} className="space-y-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="contact-privacy"
                      value="EVERYONE"
                      checked={contactPrivacyInput === "EVERYONE"}
                      onChange={(e) =>
                        setContactPrivacyInput(e.target.value as "EVERYONE" | "REQUESTS_ONLY" | "NOBODY")
                      }
                      disabled={contactPrivacyState.kind === "loading"}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                    />
                    {t("profile.contactPrivacyEveryone")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="contact-privacy"
                      value="REQUESTS_ONLY"
                      checked={contactPrivacyInput === "REQUESTS_ONLY"}
                      onChange={(e) =>
                        setContactPrivacyInput(e.target.value as "EVERYONE" | "REQUESTS_ONLY" | "NOBODY")
                      }
                      disabled={contactPrivacyState.kind === "loading"}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                    />
                    {t("profile.contactPrivacyRequestsOnly")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="contact-privacy"
                      value="NOBODY"
                      checked={contactPrivacyInput === "NOBODY"}
                      onChange={(e) =>
                        setContactPrivacyInput(e.target.value as "EVERYONE" | "REQUESTS_ONLY" | "NOBODY")
                      }
                      disabled={contactPrivacyState.kind === "loading"}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                    />
                    {t("profile.contactPrivacyNobody")}
                  </label>
                </div>
                <Button
                  type="submit"
                  disabled={contactPrivacyState.kind === "loading"}
                  data-testid="contact-privacy-save"
                >
                  {contactPrivacyState.kind === "loading" ? t("profile.saving") : t("profile.save")}
                </Button>
              </form>
              {contactPrivacyState.kind === "success" && (
                <div className="mt-3">
                  <Alert variant="success">{t("profile.contactPrivacySaved")}</Alert>
                </div>
              )}
              {contactPrivacyState.kind === "error" && (
                <div className="mt-3">
                  <Alert variant="error">{contactPrivacyState.message}</Alert>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "security" && (
        <div className="space-y-6">
          <Card data-testid="change-email-section">
            <CardHeader>
              <CardTitle>{t("auth.changeEmailTitle")}</CardTitle>
              <CardDescription>{t("auth.changeEmailSubtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr]">
                <dt className="text-sm text-muted-foreground">
                  {t("auth.currentEmail")}
                </dt>
                <dd className="min-w-0 break-words text-sm font-medium">
                  {user?.email}
                </dd>
              </dl>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!accessToken || !newEmailInput.trim()) return;
                  setEmailChangeState({ kind: "loading" });
                  try {
                    await requestEmailChange(accessToken, {
                      newEmail: newEmailInput.trim(),
                    });
                    setEmailChangeState({ kind: "success" });
                    setNewEmailInput("");
                  } catch (err) {
                    const message = localizeApiError(err, "auth.emailChangeFailed", t);
                    setEmailChangeState({ kind: "error", message });
                  }
                }}
                className="flex flex-col items-start gap-3 sm:flex-row"
              >
                <Input
                  id="profile-new-email"
                  name="profile-new-email"
                  aria-label={t("auth.changeEmailTitle")}
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                  disabled={emailChangeState.kind === "loading"}
                  className="flex-1"
                  data-testid="change-email-input"
                />
                <Button
                  type="submit"
                  disabled={emailChangeState.kind === "loading"}
                  data-testid="change-email-submit"
                >
                  {emailChangeState.kind === "loading"
                    ? t("profile.saving")
                    : t("auth.requestChange")}
                </Button>
              </form>
              {emailChangeState.kind === "success" && (
                <Alert variant="success">
                  <div className="font-medium">
                    {t("auth.emailChangeRequested")}
                  </div>
                  <p className="mt-1 text-xs opacity-90">
                    {t("auth.emailChangeLatestOnly")}
                  </p>
                </Alert>
              )}
              {emailChangeState.kind === "error" && (
                <Alert variant="error">{emailChangeState.message}</Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("profile.changePassword")}</CardTitle>
              <CardDescription>{t("profile.passwordFieldsRequired")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setPasswordError("");
                  if (!accessToken) return;
                  if (
                    !currentPasswordInput ||
                    !newPasswordInput ||
                    !confirmPasswordInput
                  ) {
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
                    const message = localizeApiError(err, "profile.passwordChangeFailed", t);
                    setPasswordChangeState({ kind: "error", message });
                  }
                }}
                className="space-y-3"
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
                <Button
                  type="submit"
                  disabled={passwordChangeState.kind === "loading"}
                  data-testid="change-password-submit"
                >
                  {passwordChangeState.kind === "loading"
                    ? t("profile.saving")
                    : t("profile.changePassword")}
                </Button>
              </form>
              {passwordError && <Alert variant="error">{passwordError}</Alert>}
              {passwordChangeState.kind === "success" && (
                <Alert variant="success">
                  {t("profile.passwordChanged")}
                </Alert>
              )}
              {passwordChangeState.kind === "error" && (
                <Alert variant="error">{passwordChangeState.message}</Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "sessions" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("profile.sessions")}</CardTitle>
              <CardDescription>{t("profile.sessionsExplanation")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                {!sessionsError && (
                  <Badge variant="default" className="px-2.5 py-0.5">
                    {t("profile.activeSessionsCount", String(activeCount))}
                  </Badge>
                )}
                <Button
                  type="button"
                  variant={showSessionsList ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setShowSessionsList((s) => !s)}
                  aria-expanded={showSessionsList}
                  data-testid="toggle-sessions-list"
                >
                  {showSessionsList
                    ? t("profile.hideSessions")
                    : t("profile.showSessions")}
                </Button>
              </div>

              {sessionsError && !showSessionsList && (
                <Alert variant="error">{sessionsError}</Alert>
              )}

              {showSessionsList && (
                <div className="space-y-4">
                  {sessionsLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("profile.loadingSessions")}
                    </div>
                  )}
                  {sessionsError && <Alert variant="error">{sessionsError}</Alert>}
                  {!sessionsLoading && !sessionsError && sessions.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("profile.noSessions")}
                    </p>
                  )}
                  {!sessionsLoading && !sessionsError && sessions.length > 0 && (
                    <>
                      {currentSession && (
                        <div
                          data-testid={`session-item-${currentSession.id}`}
                          className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/[0.02] p-4 shadow-sm"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                                <Monitor size={18} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold">
                                  {t("profile.currentSession")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(currentSession.createdAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="success">
                                {t("profile.sessionActive")}
                              </Badge>
                              <span
                                className="inline-flex items-center justify-center rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border"
                                title={t("profile.revokeCurrentSessionDisabled")}
                                data-testid={`revoke-session-disabled-${currentSession.id}`}
                              >
                                {t("profile.revokeSession")}
                              </span>
                            </div>
                          </div>
                          {currentSession.userAgent && (
                            <p className="mt-2 truncate text-xs text-muted-foreground">
                              {currentSession.userAgent}
                            </p>
                          )}
                          {currentSession.ipAddress && (
                            <p className="text-xs text-muted-foreground">
                              {t("profile.ipLabel")} {currentSession.ipAddress}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          id="show-inactive-sessions"
                          type="checkbox"
                          checked={showInactiveSessions}
                          onChange={(e) =>
                            setShowInactiveSessions(e.target.checked)
                          }
                          className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                        />
                        <label
                          htmlFor="show-inactive-sessions"
                          className="text-xs text-muted-foreground"
                        >
                          {t("profile.showInactiveSessions")}
                        </label>
                      </div>

                      {sessionRevokeState.kind === "success" && (
                        <Alert variant="success">
                          {t("profile.revokeSessionSuccess")}
                        </Alert>
                      )}

                      {visibleSessions.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          {t("profile.noInactiveSessions")}
                        </p>
                      )}

                      <div className="space-y-3">
                        {otherSessions.map((session) => {
                          let statusLabel = t("profile.sessionActive");
                          let statusVariant: import("@/components/ui/Badge").BadgeVariant = "success";
                          if (session.revokedAt) {
                            statusLabel = t("profile.sessionRevoked");
                            statusVariant = "muted";
                          } else if (!session.isActive) {
                            statusLabel = t("profile.sessionExpired");
                            statusVariant = "warning";
                          }
                          const canRevoke =
                            !session.revokedAt &&
                            session.isActive &&
                            !session.isCurrent;
                          const isRevoking =
                            sessionRevokeState.kind === "loading" &&
                            sessionRevokeState.sessionId === session.id;
                          return (
                            <div
                              key={session.id}
                              data-testid={`session-item-${session.id}`}
                              className="flex flex-col gap-3 rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/30 p-4 text-sm shadow-sm dark:to-muted/10"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex items-start gap-3 min-w-0">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                                    <Smartphone size={16} />
                                  </div>
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="font-semibold">
                                      {new Date(
                                        session.createdAt,
                                      ).toLocaleString()}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {t("profile.expiresAt")}:{" "}
                                      {new Date(
                                        session.expiresAt,
                                      ).toLocaleString()}
                                    </span>
                                    {session.userAgent && (
                                      <span
                                        className="truncate text-xs text-muted-foreground"
                                        title={session.userAgent}
                                      >
                                        {session.userAgent}
                                      </span>
                                    )}
                                    {session.ipAddress && (
                                      <span className="text-xs text-muted-foreground">
                                        {t("profile.ipLabel")} {session.ipAddress}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                  <Badge variant={statusVariant}>
                                    {statusLabel}
                                  </Badge>
                                  {session.isCurrent ? (
                                    <Badge variant="info">
                                      {t("profile.currentSession")}
                                    </Badge>
                                  ) : null}
                                  {session.isCurrent ? (
                                    <span
                                      className="inline-flex items-center justify-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border cursor-not-allowed"
                                      title={t(
                                        "profile.revokeCurrentSessionDisabled",
                                      )}
                                      data-testid={`revoke-session-disabled-${session.id}`}
                                    >
                                      {t("profile.revokeSession")}
                                    </span>
                                  ) : canRevoke ? (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      onClick={() =>
                                        handleRevokeSession(
                                          session.id,
                                          session.isCurrent,
                                        )
                                      }
                                      disabled={isRevoking}
                                      data-testid={`revoke-session-${session.id}`}
                                    >
                                      {isRevoking
                                        ? t("profile.revokingSession")
                                        : t("profile.revokeSession")}
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                              {sessionRevokeState.kind === "error" &&
                                sessionRevokeState.sessionId === session.id && (
                                  <Alert variant="error">
                                    {sessionRevokeState.message}
                                  </Alert>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              <Button
                type="button"
                variant="danger"
                onClick={handleRevokeOtherSessions}
                disabled={
                  revokeState.kind === "loading" ||
                  sessionsLoading ||
                  activeCount <= 1
                }
                data-testid="revoke-other-sessions-button"
              >
                {revokeState.kind === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("profile.saving")}
                  </>
                ) : (
                  t("profile.revokeOtherSessions")
                )}
              </Button>

              {revokeState.kind === "success" && (
                <Alert variant="success">
                  {t("profile.revokeOthersSuccess")}
                </Alert>
              )}
              {revokeState.kind === "error" && (
                <Alert variant="error">{revokeState.message}</Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="space-y-6">
          <PushNotificationsSection />
          <NotificationPreferencesSection />
        </div>
      )}

      {activeTab === "app" && <PwaInstallSection />}

      {activeTab === "safety" && (
        <Card data-testid="safety-section">
          <CardHeader>
            <CardTitle>{t("safety.title")}</CardTitle>
            <CardDescription>{t("safety.blockedUsersDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary">
              <Link href="/blocked">{t("safety.blockedUsers")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === "language" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("profile.interfaceLanguage")}</CardTitle>

          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {LOCALE_OPTIONS.map((loc) => {
                const active = locale === loc;
                return (
                  <Button
                    key={loc}
                    type="button"
                    variant={active ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => handleSetLocale(loc)}
                    disabled={localeFormState.kind === "loading"}
                  >
                    {localeLabel(loc)}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("profile.selected")} {localeLabel(locale)}
            </p>
            {localeFormState.kind === "success" && (
              <Alert variant="success">{t("profile.languageSaved")}</Alert>
            )}
            {localeFormState.kind === "error" && (
              <Alert variant="error">{localeFormState.message}</Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
