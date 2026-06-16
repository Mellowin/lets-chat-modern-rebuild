"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { getMe, logout as apiLogout, refresh as apiRefresh, isTokenExpired, type AuthUser, type AuthResult } from "@/lib/auth-api";
import { syncLocale } from "@/lib/locale";
import { AUTH_EVENTS } from "@/lib/auth-fetch";

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginSuccess: (result: AuthResult) => void;
  setUser: (user: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user && !!accessToken;

  const clearAuth = useCallback(() => {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  }, []);

  const applyTokens = useCallback((tokens: { accessToken: string; refreshToken: string }) => {
    sessionStorage.setItem("accessToken", tokens.accessToken);
    sessionStorage.setItem("refreshToken", tokens.refreshToken);
    setAccessToken(tokens.accessToken);
    setRefreshToken(tokens.refreshToken);
  }, []);

  const loadUser = useCallback(async (token: string): Promise<AuthUser | null> => {
    try {
      const me = await getMe(token);
      return me;
    } catch {
      return null;
    }
  }, []);

  const tryRefresh = useCallback(async (): Promise<{ accessToken: string; refreshToken: string } | null> => {
    const storedRefresh = sessionStorage.getItem("refreshToken");
    if (!storedRefresh) return null;
    try {
      const result = await apiRefresh(storedRefresh);
      applyTokens(result);
      return { accessToken: result.accessToken, refreshToken: result.refreshToken };
    } catch {
      return null;
    }
  }, [applyTokens]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const storedAccess = sessionStorage.getItem("accessToken");

      let me: AuthUser | null = null;

      if (storedAccess && !isTokenExpired(storedAccess)) {
        me = await loadUser(storedAccess);
      }

      // Access token missing, expired, or rejected by server — try silent refresh.
      if (!me) {
        const refreshed = await tryRefresh();
        if (refreshed) {
          me = await loadUser(refreshed.accessToken);
        }
      }

      if (cancelled) return;

      if (me) {
        setUser(me);
        setAccessToken(sessionStorage.getItem("accessToken"));
        setRefreshToken(sessionStorage.getItem("refreshToken"));
        syncLocale(me.interfaceLanguage);
      } else {
        clearAuth();
      }

      setIsLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [loadUser, tryRefresh, clearAuth]);

  // Keep React state in sync when authFetch refreshes tokens in the background.
  useEffect(() => {
    function onTokensRefreshed() {
      setAccessToken(sessionStorage.getItem("accessToken"));
      setRefreshToken(sessionStorage.getItem("refreshToken"));
    }
    function onSessionExpired() {
      clearAuth();
    }
    window.addEventListener(AUTH_EVENTS.TOKENS_REFRESHED, onTokensRefreshed);
    window.addEventListener(AUTH_EVENTS.SESSION_EXPIRED, onSessionExpired);
    return () => {
      window.removeEventListener(AUTH_EVENTS.TOKENS_REFRESHED, onTokensRefreshed);
      window.removeEventListener(AUTH_EVENTS.SESSION_EXPIRED, onSessionExpired);
    };
  }, [clearAuth]);

  const loginSuccess = useCallback((result: AuthResult) => {
    sessionStorage.setItem("accessToken", result.accessToken);
    sessionStorage.setItem("refreshToken", result.refreshToken);
    setUser(result.user);
    setAccessToken(result.accessToken);
    setRefreshToken(result.refreshToken);
    syncLocale(result.user.interfaceLanguage);
  }, []);

  const setUserValue = useCallback((u: AuthUser) => {
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    const rt = sessionStorage.getItem("refreshToken");
    if (rt) {
      try { await apiLogout(rt); } catch { /* best-effort */ }
    }
    clearAuth();
  }, [clearAuth]);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, refreshToken, isLoading, isAuthenticated, loginSuccess, setUser: setUserValue, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
