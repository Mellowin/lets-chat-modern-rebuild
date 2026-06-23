import type { TranslationKey } from "./locale";

export type TranslateFn = (key: TranslationKey, ...args: string[]) => string;

export function getRoleLabel(role: string, t: TranslateFn): string {
  switch (role) {
    case "OWNER":
      return t("workspace.owner");
    case "ADMIN":
      return t("workspace.admin");
    case "MEMBER":
      return t("workspace.member");
    default:
      return role;
  }
}

export function getChannelRoleLabel(role: string, t: TranslateFn): string {
  switch (role) {
    case "OWNER":
      return t("channel.owner");
    case "ADMIN":
      return t("channel.admin");
    case "MEMBER":
      return t("channel.member");
    default:
      return role;
  }
}

export function getInviteStatusLabel(status: string, t: TranslateFn): string {
  switch (status) {
    case "PENDING":
      return t("workspace.inviteStatusPending");
    case "REVOKED":
      return t("workspace.inviteStatusRevoked");
    case "EXPIRED":
      return t("workspace.inviteStatusExpired");
    case "ACCEPTED":
      return t("workspace.inviteStatusAccepted");
    default:
      return status;
  }
}
