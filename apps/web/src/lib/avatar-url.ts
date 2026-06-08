import { getApiOrigin } from "./env";

export function getAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  const apiOrigin = getApiOrigin();
  return `${apiOrigin}${avatarUrl}`;
}
