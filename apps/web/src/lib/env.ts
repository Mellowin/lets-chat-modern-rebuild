export function getApiBase(): string {
  const apiBase = process.env.NEXT_PUBLIC_API_URL;
  if (apiBase) {
    return apiBase.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_API_URL is required in production");
  }
  return "http://localhost:3001/api/v1";
}

export function getApiOrigin(): string {
  return getApiBase().replace(/\/api\/v1\/?$/, "");
}

/**
 * Returns the WebSocket base URL.
 *
 * Order of resolution:
 * 1. `NEXT_PUBLIC_WS_URL` if it is set and does not point to the deprecated
 *    `lets-chat-api-wa43` host.
 * 2. Origin derived from `NEXT_PUBLIC_API_URL` (strips `/api/v1`).
 * 3. Development fallback `http://localhost:3001`.
 */
export function getWsUrl(): string {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (wsUrl && !wsUrl.includes("lets-chat-api-wa43")) {
    return wsUrl.replace(/\/$/, "");
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    return apiUrl.replace(/\/$/, "").replace(/\/api\/v1\/?$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_API_URL is required in production");
  }

  return "http://localhost:3001";
}
