import { isApiTimeoutError } from "./fetch-timeout";
import type { TranslationKey } from "./locale";

export type TranslateFn = (key: TranslationKey, ...args: string[]) => string;

const MESSAGE_MAP: Record<string, TranslationKey> = {
  "validation failed": "errors.validationFailed",
  "unauthorized": "errors.unauthorized",
  "access token missing": "errors.unauthorized",
  "invalid or expired access token": "errors.unauthorized",
  "invalid or expired refresh token": "errors.unauthorized",
  "refresh token not found or revoked": "errors.unauthorized",
  "invalid credentials": "errors.invalidCredentials",
  "forbidden": "errors.forbidden",
  "email not verified": "errors.emailNotVerified",
  "not found": "errors.notFound",
  "user not found": "errors.userNotFound",
  "workspace not found": "errors.workspaceNotFound",
  "channel not found": "errors.channelNotFound",
  "conversation not found": "errors.conversationNotFound",
  "direct conversation not found": "errors.conversationNotFound",
  "internal server error": "errors.internalServerError",
  "current password is incorrect": "errors.currentPasswordIncorrect",
  "new password must be different from current password": "errors.newPasswordMustDiffer",
  "new email must be different from current email": "errors.generic",
  "invalid or expired verification token": "errors.inviteExpiredOrInvalid",
  "invalid or expired reset token": "errors.inviteExpiredOrInvalid",
  "invalid or expired email change token": "errors.inviteExpiredOrInvalid",
  "email already in use": "errors.emailAlreadyExists",
  "email already registered": "errors.emailAlreadyExists",
  "email already exists": "errors.emailAlreadyExists",
  "username already taken": "errors.usernameAlreadyTaken",
  "too many requests": "errors.tooManyRequests",
  "mail provider quota exceeded": "errors.registrationUnavailable",
  "email delivery is temporarily unavailable. please try again later": "errors.registrationUnavailable",
  "invite not found": "errors.inviteExpiredOrInvalid",
  "invite expired": "errors.inviteExpiredOrInvalid",
  "cannot start a conversation with this user": "safety.actionBlocked",
  "cannot send messages to this user": "safety.actionBlocked",
  "cannot add this user to contacts": "safety.actionBlocked",
  "cannot add this user to the group": "safety.actionBlocked",
};

function normalizeErrorMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[:.!]+$/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Converts a raw backend/API error into a localized, user-friendly message.
 * Falls back to the provided fallback key if the message is not recognized.
 */
export function localizeApiError(
  error: unknown,
  fallbackKey: TranslationKey,
  t: TranslateFn,
): string {
  if (isApiTimeoutError(error)) {
    return t("api.timeoutError");
  }

  if (error instanceof Error) {
    const normalized = normalizeErrorMessage(error.message);

    // Try exact normalized message first.
    const exactKey = MESSAGE_MAP[normalized];
    if (exactKey) {
      return t(exactKey);
    }

    // Try a few common substring/prefix matches for dynamic backend text.
    if (normalized.includes("validation failed")) return t("errors.validationFailed");
    if (normalized.includes("unauthorized")) return t("errors.unauthorized");
    if (normalized.includes("forbidden")) return t("errors.forbidden");
    if (normalized.includes("not found")) return t("errors.notFound");
    if (normalized.includes("internal server error")) return t("errors.internalServerError");
    if (normalized.includes("invalid credentials")) return t("errors.invalidCredentials");
    if (normalized.includes("email not verified")) return t("errors.emailNotVerified");
    if (normalized.includes("email already in use")) return t("errors.emailAlreadyExists");
    if (normalized.includes("email delivery is temporarily unavailable")) return t("errors.registrationUnavailable");
    if (normalized.includes("mail provider quota exceeded")) return t("errors.registrationUnavailable");
    if (normalized.includes("mail_provider_quota_exceeded")) return t("errors.registrationUnavailable");
    if (normalized.includes("mail provider unavailable")) return t("errors.registrationUnavailable");
    if (normalized.includes("mail_provider_unavailable")) return t("errors.registrationUnavailable");
    if (normalized.includes("current password")) return t("errors.currentPasswordIncorrect");
  }

  return t(fallbackKey);
}
