"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { getMe, logout as apiLogout, type AuthUser, type AuthResult } from "@/lib/auth-api";

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginSuccess: (result: AuthResult) => void;
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

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const storedAccess = sessionStorage.getItem("accessToken");
      const storedRefresh = sessionStorage.getItem("refreshToken");
      if (storedAccess) {
        try {
          const me = await getMe(storedAccess);
          if (!cancelled) {
            setUser(me);
            setAccessToken(storedAccess);
            setRefreshToken(storedRefresh);
          }
        } catch {
          sessionStorage.removeItem("accessToken");
          sessionStorage.removeItem("refreshToken");
        }
      }
      if (!cancelled) setIsLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const loginSuccess = useCallback((result: AuthResult) => {
    sessionStorage.setItem("accessToken", result.accessToken);
    sessionStorage.setItem("refreshToken", result.refreshToken);
    setUser(result.user);
    setAccessToken(result.accessToken);
    setRefreshToken(result.refreshToken);
  }, []);

  const logout = useCallback(async () => {
    const rt = sessionStorage.getItem("refreshToken");
    if (rt) {
      try { await apiLogout(rt); } catch { /* best-effort */ }
    }
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, refreshToken, isLoading, isAuthenticated, loginSuccess, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
