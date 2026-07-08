const LS_API_KEY = "letsChatApiUrl";
const LS_WS_KEY = "letsChatWsUrl";
const QUERY_API_KEY = "apiUrl";
const QUERY_WS_KEY = "wsUrl";

function getGlobalObject<T>(name: string): T | undefined {
  try {
    return (globalThis as unknown as Record<string, T | undefined>)[name];
  } catch {
    return undefined;
  }
}

function tryGetLocalStorage(): Storage | undefined {
  return getGlobalObject<Storage>("localStorage");
}

function tryGetLocationSearch(): string | undefined {
  return getGlobalObject<Location>("location")?.search;
}

function parseOverride(
  value: unknown,
  allowedProtocols: readonly string[],
): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (!allowedProtocols.includes(url.protocol)) {
      return null;
    }
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function readQueryParam(name: string): string | null {
  const search = tryGetLocationSearch();
  if (!search) {
    return null;
  }
  try {
    return new URLSearchParams(search).get(name);
  } catch {
    return null;
  }
}

function readStorageOverride(key: string): string | null {
  const storage = tryGetLocalStorage();
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function persistQueryOverrides(): void {
  const storage = tryGetLocalStorage();
  if (!storage) {
    return;
  }
  const apiOverride = parseOverride(readQueryParam(QUERY_API_KEY), [
    "http:",
    "https:",
  ]);
  const wsOverride = parseOverride(readQueryParam(QUERY_WS_KEY), [
    "ws:",
    "wss:",
    "http:",
    "https:",
  ]);
  try {
    if (apiOverride) {
      storage.setItem(LS_API_KEY, apiOverride);
    }
    if (wsOverride) {
      storage.setItem(LS_WS_KEY, wsOverride);
    }
  } catch {
    // Ignore storage errors (e.g., private mode).
  }
}

function resolveOverride(
  kind: "api" | "ws",
): string | null {
  const allowedProtocols =
    kind === "api"
      ? (["http:", "https:"] as const)
      : (["ws:", "wss:", "http:", "https:"] as const);
  const queryKey = kind === "api" ? QUERY_API_KEY : QUERY_WS_KEY;
  const storageKey = kind === "api" ? LS_API_KEY : LS_WS_KEY;

  const queryOverride = parseOverride(readQueryParam(queryKey), allowedProtocols);
  if (queryOverride) {
    persistQueryOverrides();
    return queryOverride;
  }

  return parseOverride(readStorageOverride(storageKey), allowedProtocols);
}

export function getApiBase(): string {
  const override = resolveOverride("api");
  if (override) {
    return override;
  }

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
 * 1. `?wsUrl=...` query parameter (persisted to localStorage).
 * 2. `localStorage.letsChatWsUrl` override.
 * 3. `NEXT_PUBLIC_WS_URL` if it is set and does not point to the deprecated
 *    `lets-chat-api-wa43` host.
 * 4. Origin derived from `NEXT_PUBLIC_API_URL` (strips `/api/v1`).
 * 5. Development fallback `http://localhost:3001`.
 */
export function getWsUrl(): string {
  const override = resolveOverride("ws");
  if (override) {
    return override;
  }

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
