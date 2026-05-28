import { useState, useCallback, useEffect } from "react";

export type Locale = "en" | "uk" | "ru";

const LOCALE_KEY = "lets-chat:locale";
const LOCALE_CHANGED_EVENT = "lets-chat:locale-changed";

declare global {
  interface WindowEventMap {
    "lets-chat:locale-changed": CustomEvent<Locale>;
  }
}

const LABELS: Record<Locale, { label: string; native: string }> = {
  en: { label: "English", native: "English" },
  uk: { label: "Ukrainian", native: "Українська" },
  ru: { label: "Russian", native: "Русский" },
};

export type TranslationKey =
  | "header.profile"
  | "header.logout"
  | "header.signIn"
  | "header.createAccount"
  | "profile.title"
  | "profile.back"
  | "profile.accountInfo"
  | "profile.email"
  | "profile.username"
  | "profile.displayName"
  | "profile.displayNamePlaceholder"
  | "profile.save"
  | "profile.saving"
  | "profile.displayNameUpdated"
  | "profile.avatar"
  | "profile.uploadAvatar"
  | "profile.uploading"
  | "profile.avatarUpdated"
  | "profile.editDisplayName"
  | "profile.interfaceLanguage"
  | "profile.selected"
  | "profile.languageSaved"
  | "profile.languageSaveFailed"
  | "dashboard.welcome"
  | "dashboard.signedInAs"
  | "dashboard.profileSettings"
  | "dashboard.createWorkspace"
  | "dashboard.workspaceName"
  | "dashboard.workspaceSlug"
  | "dashboard.create"
  | "dashboard.creating"
  | "dashboard.yourWorkspaces"
  | "dashboard.noWorkspaces"
  | "dashboard.pendingInvitations"
  | "dashboard.pendingChannelInvitations"
  | "dashboard.archivedWorkspaces"
  | "dashboard.loading"
  | "dashboard.loadingInvites"
  | "dashboard.loadingChannelInvites"
  | "dashboard.loadingArchived"
  | "dashboard.noPendingInvitations"
  | "dashboard.noPendingChannelInvitations"
  | "dashboard.noArchivedWorkspaces"
  | "dashboard.invitedBy"
  | "dashboard.joinAs"
  | "dashboard.accept"
  | "dashboard.decline"
  | "dashboard.archive"
  | "dashboard.restore"
  | "auth.loadingSession"
  | "auth.authRequired"
  | "auth.pleaseSignIn"
  | "auth.pleaseSignInDashboard"
  | "auth.signIn";

const DICTIONARY: Record<Locale, Record<TranslationKey, string>> = {
  en: {
    "header.profile": "Profile",
    "header.logout": "Logout",
    "header.signIn": "Sign in",
    "header.createAccount": "Create account",
    "profile.title": "Profile",
    "profile.back": "← Back to dashboard",
    "profile.accountInfo": "Account information",
    "profile.email": "Email",
    "profile.username": "Username",
    "profile.displayName": "Display name",
    "profile.displayNamePlaceholder": "Your display name",
    "profile.editDisplayName": "Edit display name",
    "profile.save": "Save",
    "profile.saving": "Saving…",
    "profile.displayNameUpdated": "Display name updated.",
    "profile.avatar": "Avatar",
    "profile.uploadAvatar": "Upload avatar",
    "profile.uploading": "Uploading…",
    "profile.avatarUpdated": "Avatar updated.",
    "profile.interfaceLanguage": "Interface language",
    "profile.selected": "Selected:",
    "profile.languageSaved": "Language saved.",
    "profile.languageSaveFailed": "Failed to save language preference.",
    "dashboard.welcome": "Welcome",
    "dashboard.signedInAs": "You are signed in as",
    "dashboard.profileSettings": "Profile settings",
    "dashboard.createWorkspace": "Create workspace",
    "dashboard.workspaceName": "Workspace name",
    "dashboard.workspaceSlug": "slug (optional, auto-generated)",
    "dashboard.create": "Create",
    "dashboard.creating": "Creating…",
    "dashboard.yourWorkspaces": "Your Workspaces",
    "dashboard.noWorkspaces": "No workspaces yet. Create one to get started.",
    "dashboard.pendingInvitations": "Pending Invitations",
    "dashboard.pendingChannelInvitations": "Pending Channel Invitations",
    "dashboard.archivedWorkspaces": "Archived Workspaces",
    "dashboard.loading": "Loading session…",
    "dashboard.loadingInvites": "Loading invites…",
    "dashboard.loadingChannelInvites": "Loading channel invites…",
    "dashboard.loadingArchived": "Loading archived workspaces…",
    "dashboard.noPendingInvitations": "No pending invitations.",
    "dashboard.noPendingChannelInvitations": "No pending channel invitations.",
    "dashboard.noArchivedWorkspaces": "No archived workspaces.",
    "dashboard.invitedBy": "Invited by",
    "dashboard.joinAs": "You will join as",
    "dashboard.accept": "Accept",
    "dashboard.decline": "Decline",
    "dashboard.archive": "Archive",
    "dashboard.restore": "Restore",
    "auth.loadingSession": "Loading session…",
    "auth.authRequired": "Authentication required",
    "auth.pleaseSignIn": "Please sign in to view your profile.",
    "auth.pleaseSignInDashboard": "Please sign in to view your dashboard.",
    "auth.signIn": "Sign in",
  },
  uk: {
    "header.profile": "Профіль",
    "header.logout": "Вийти",
    "header.signIn": "Увійти",
    "header.createAccount": "Створити акаунт",
    "profile.title": "Профіль",
    "profile.back": "← Назад до панелі",
    "profile.accountInfo": "Інформація акаунта",
    "profile.email": "Email",
    "profile.username": "Імʼя користувача",
    "profile.displayName": "Відображуване імʼя",
    "profile.displayNamePlaceholder": "Ваше відображуване імʼя",
    "profile.editDisplayName": "Редагувати відображуване імʼя",
    "profile.save": "Зберегти імʼя",
    "profile.saving": "Зберігаємо…",
    "profile.displayNameUpdated": "Імʼя оновлено.",
    "profile.avatar": "Аватар",
    "profile.uploadAvatar": "Завантажити аватар",
    "profile.uploading": "Завантажуємо…",
    "profile.avatarUpdated": "Аватар оновлено.",
    "profile.interfaceLanguage": "Мова інтерфейсу",
    "profile.selected": "Обрано:",
    "profile.languageSaved": "Мову збережено.",
    "profile.languageSaveFailed": "Не вдалося зберегти мову.",
    "dashboard.welcome": "Вітаємо",
    "dashboard.signedInAs": "Ви увійшли як",
    "dashboard.profileSettings": "Налаштування профілю",
    "dashboard.createWorkspace": "Створити робочий простір",
    "dashboard.workspaceName": "Назва робочого простору",
    "dashboard.workspaceSlug": "slug (необовʼязково, генерується автоматично)",
    "dashboard.create": "Створити",
    "dashboard.creating": "Створюємо…",
    "dashboard.yourWorkspaces": "Ваші робочі простори",
    "dashboard.noWorkspaces": "Робочих просторів ще немає. Створіть один, щоб почати.",
    "dashboard.pendingInvitations": "Запрошення",
    "dashboard.pendingChannelInvitations": "Запрошення до каналів",
    "dashboard.archivedWorkspaces": "Архівовані робочі простори",
    "dashboard.loading": "Завантажуємо сесію…",
    "dashboard.loadingInvites": "Завантажуємо запрошення…",
    "dashboard.loadingChannelInvites": "Завантажуємо запрошення до каналів…",
    "dashboard.loadingArchived": "Завантажуємо архівовані простори…",
    "dashboard.noPendingInvitations": "Немає запрошень.",
    "dashboard.noPendingChannelInvitations": "Немає запрошень до каналів.",
    "dashboard.noArchivedWorkspaces": "Немає архівованих робочих просторів.",
    "dashboard.invitedBy": "Запросив",
    "dashboard.joinAs": "Ви приєднаєтесь як",
    "dashboard.accept": "Прийняти",
    "dashboard.decline": "Відхилити",
    "dashboard.archive": "Архівувати",
    "dashboard.restore": "Відновити",
    "auth.loadingSession": "Завантажуємо сесію…",
    "auth.authRequired": "Потрібна автентифікація",
    "auth.pleaseSignIn": "Увійдіть, щоб переглянути профіль.",
    "auth.pleaseSignInDashboard": "Увійдіть, щоб переглянути панель.",
    "auth.signIn": "Увійти",
  },
  ru: {
    "header.profile": "Профиль",
    "header.logout": "Выйти",
    "header.signIn": "Войти",
    "header.createAccount": "Создать аккаунт",
    "profile.title": "Профиль",
    "profile.back": "← Назад к панели",
    "profile.accountInfo": "Информация аккаунта",
    "profile.email": "Email",
    "profile.username": "Имя пользователя",
    "profile.displayName": "Отображаемое имя",
    "profile.displayNamePlaceholder": "Ваше отображаемое имя",
    "profile.editDisplayName": "Редактировать отображаемое имя",
    "profile.save": "Сохранить имя",
    "profile.saving": "Сохраняем…",
    "profile.displayNameUpdated": "Имя обновлено.",
    "profile.avatar": "Аватар",
    "profile.uploadAvatar": "Загрузить аватар",
    "profile.uploading": "Загружаем…",
    "profile.avatarUpdated": "Аватар обновлён.",
    "profile.interfaceLanguage": "Язык интерфейса",
    "profile.selected": "Выбрано:",
    "profile.languageSaved": "Язык сохранён.",
    "profile.languageSaveFailed": "Не удалось сохранить язык.",
    "dashboard.welcome": "Добро пожаловать",
    "dashboard.signedInAs": "Вы вошли как",
    "dashboard.profileSettings": "Настройки профиля",
    "dashboard.createWorkspace": "Создать рабочее пространство",
    "dashboard.workspaceName": "Название рабочего пространства",
    "dashboard.workspaceSlug": "slug (необязательно, генерируется автоматически)",
    "dashboard.create": "Создать",
    "dashboard.creating": "Создаём…",
    "dashboard.yourWorkspaces": "Ваши рабочие пространства",
    "dashboard.noWorkspaces": "Рабочих пространств пока нет. Создайте одно, чтобы начать.",
    "dashboard.pendingInvitations": "Приглашения",
    "dashboard.pendingChannelInvitations": "Приглашения в каналы",
    "dashboard.archivedWorkspaces": "Архивированные рабочие пространства",
    "dashboard.loading": "Загружаем сессию…",
    "dashboard.loadingInvites": "Загружаем приглашения…",
    "dashboard.loadingChannelInvites": "Загружаем приглашения в каналы…",
    "dashboard.loadingArchived": "Загружаем архивированные пространства…",
    "dashboard.noPendingInvitations": "Нет приглашений.",
    "dashboard.noPendingChannelInvitations": "Нет приглашений в каналы.",
    "dashboard.noArchivedWorkspaces": "Нет архивированных рабочих пространств.",
    "dashboard.invitedBy": "Пригласил",
    "dashboard.joinAs": "Вы присоединитесь как",
    "dashboard.accept": "Принять",
    "dashboard.decline": "Отклонить",
    "dashboard.archive": "Архивировать",
    "dashboard.restore": "Восстановить",
    "auth.loadingSession": "Загружаем сессию…",
    "auth.authRequired": "Требуется аутентификация",
    "auth.pleaseSignIn": "Войдите, чтобы просмотреть профиль.",
    "auth.pleaseSignInDashboard": "Войдите, чтобы просмотреть панель.",
    "auth.signIn": "Войти",
  },
};

export function getLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const raw = localStorage.getItem(LOCALE_KEY);
  if (raw === "uk" || raw === "ru") return raw;
  return "en";
}

export function setLocaleStorage(locale: Locale) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCALE_KEY, locale);
}

export function syncLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  setLocaleStorage(locale);
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGED_EVENT, { detail: locale }));
}

export function localeLabel(locale: Locale): string {
  return LABELS[locale].native;
}

export function translate(locale: Locale, key: TranslationKey): string {
  return DICTIONARY[locale][key];
}

export function useLocale(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
} {
  const [locale, setLocaleState] = useState<Locale>(getLocale);

  useEffect(() => {
    function handleEvent(e: CustomEvent<Locale>) {
      setLocaleState(e.detail);
    }
    window.addEventListener(LOCALE_CHANGED_EVENT, handleEvent);
    return () => window.removeEventListener(LOCALE_CHANGED_EVENT, handleEvent);
  }, []);

  const handleSetLocale = useCallback((next: Locale) => {
    syncLocale(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translate(locale, key),
    [locale],
  );

  return { locale, setLocale: handleSetLocale, t };
}
