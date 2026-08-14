import { isApiTimeoutError } from "./fetch-timeout";
import type { TranslationKey } from "./locale";

export type TranslateFn = (key: TranslationKey, ...args: string[]) => string;

export interface AccountDeletionBlockers {
  workspaces: Array<{ id: string; name: string; slug: string }>;
  groups: Array<{ id: string; name: string; memberId: string }>;
  channels: Array<{
    id: string;
    workspaceId: string;
    name: string;
    slug: string;
    memberId: string;
  }>;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  blockers?: AccountDeletionBlockers;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly blockers?: AccountDeletionBlockers,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

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

export async function parseApiErrorResponse(
  res: Response,
  fallbackMessage: string,
): Promise<ApiError> {
  let code = "";
  let message = fallbackMessage;
  let blockers: AccountDeletionBlockers | undefined;
  let details: unknown;

  try {
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.code === "string") code = body.code;
    if (typeof body.message === "string") {
      message = body.message;
    } else if (
      typeof body.message === "object" &&
      body.message !== null &&
      Array.isArray(body.message)
    ) {
      message = "Validation failed";
      details = body.message;
    }
    if (isBlockers(body.blockers)) blockers = body.blockers;
    if (body.details !== undefined) details = body.details;
  } catch {
    // JSON parse failed; keep the fallback message.
  }

  return new ApiError(res.status, code, message, blockers, details);
}

function isBlockers(value: unknown): value is AccountDeletionBlockers {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  return (
    Array.isArray(b.workspaces) &&
    Array.isArray(b.groups) &&
    Array.isArray(b.channels) &&
    b.workspaces.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).id === "string" &&
        typeof (item as Record<string, unknown>).name === "string" &&
        typeof (item as Record<string, unknown>).slug === "string",
    ) &&
    b.groups.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).id === "string" &&
        typeof (item as Record<string, unknown>).name === "string" &&
        typeof (item as Record<string, unknown>).memberId === "string",
    ) &&
    b.channels.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).id === "string" &&
        typeof (item as Record<string, unknown>).workspaceId === "string" &&
        typeof (item as Record<string, unknown>).name === "string" &&
        typeof (item as Record<string, unknown>).slug === "string" &&
        typeof (item as Record<string, unknown>).memberId === "string",
    )
  );
}
