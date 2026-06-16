import { fetchWithTimeout, ApiTimeoutError, isApiTimeoutError } from "./fetch-timeout";
import { getApiBase } from "./env";
import type { AuthResult } from "./auth-api";

const API_BASE = getApiBase();

export { ApiTimeoutError, isApiTimeoutError };

export const AUTH_EVENTS = {
  TOKENS_REFRESHED: "auth:tokens-refreshed",
  SESSION_EXPIRED: "auth:session-expired",
} as const;

let refreshPromise: Promise<AuthResult | null> | null = null;

export interface AuthFetchOptions {
  skipRefresh?: boolean;
  timeoutMs?: number;
}

function getStoredTokens() {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null };
  }
  return {
    accessToken: sessionStorage.getItem("accessToken"),
    refreshToken: sessionStorage.getItem("refreshToken"),
  };
}

function setStoredTokens(accessToken: string | null, refreshToken: string | null) {
  if (typeof window === "undefined") return;
  if (accessToken) {
    sessionStorage.setItem("accessToken", accessToken);
  } else {
    sessionStorage.removeItem("accessToken");
  }
  if (refreshToken) {
    sessionStorage.setItem("refreshToken", refreshToken);
  } else {
    sessionStorage.removeItem("refreshToken");
  }
}

function dispatchAuthEvent(eventName: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(eventName));
  }
}

function isRefreshRequest(url: string): boolean {
  return url.includes("/auth/refresh");
}

async function performRefresh(): Promise<AuthResult | null> {
  const { refreshToken } = getStoredTokens();
  if (!refreshToken) {
    return null;
  }

  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/auth/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      },
      15_000,
    );

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as AuthResult;
    setStoredTokens(data.accessToken, data.refreshToken);
    dispatchAuthEvent(AUTH_EVENTS.TOKENS_REFRESHED);
    return data;
  } catch {
    return null;
  }
}

async function refreshTokens(): Promise<AuthResult | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = performRefresh().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function buildHeaders(
  initHeaders?: HeadersInit,
  accessToken?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (initHeaders) {
    if (initHeaders instanceof Headers) {
      initHeaders.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(initHeaders)) {
      for (const [key, value] of initHeaders) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, initHeaders);
    }
  }

  if (accessToken && !Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

function setAuthHeader(headers: Record<string, string>, accessToken: string) {
  const authKey = Object.keys(headers).find((key) => key.toLowerCase() === "authorization") ?? "Authorization";
  headers[authKey] = `Bearer ${accessToken}`;
}

export async function authFetch(
  input: string,
  init?: RequestInit,
  options?: AuthFetchOptions,
): Promise<Response> {
  const url = input;
  const { accessToken } = getStoredTokens();
  const headers = buildHeaders(init?.headers, accessToken);

  const timeoutMs = options?.timeoutMs ?? 15_000;
  const res = await fetchWithTimeout(input, { ...init, headers }, timeoutMs);

  if (res.status !== 401 || options?.skipRefresh || isRefreshRequest(url)) {
    return res;
  }

  const refreshed = await refreshTokens();
  if (!refreshed) {
    setStoredTokens(null, null);
    dispatchAuthEvent(AUTH_EVENTS.SESSION_EXPIRED);
    return res;
  }

  setAuthHeader(headers, refreshed.accessToken);
  return fetchWithTimeout(input, { ...init, headers }, timeoutMs);
}
