export function getAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1")
    .replace(/\/api\/v1\/?$/, "");
  return `${apiOrigin}${avatarUrl}`;
}
