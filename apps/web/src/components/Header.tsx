"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { getAvatarUrl } from "@/lib/avatar-url";
import { GLOBAL_UNREAD_CHANGED_EVENT, type GlobalUnreadPayload } from "@/lib/global-unread";
import GlobalMessageSearch from "./GlobalMessageSearch";

export default function Header() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const { t } = useLocale();
  const [globalUnread, setGlobalUnread] = useState(0);

  useEffect(() => {
    function handleGlobalUnread(event: CustomEvent<GlobalUnreadPayload>) {
      setGlobalUnread(event.detail.total);
    }
    window.addEventListener(GLOBAL_UNREAD_CHANGED_EVENT, handleGlobalUnread as EventListener);
    return () => {
      window.removeEventListener(GLOBAL_UNREAD_CHANGED_EVENT, handleGlobalUnread as EventListener);
    };
  }, []);

  return (
    <header className="flex items-center justify-between h-14 px-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
      <Link href={isAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-zinc-900 dark:bg-zinc-100" />
        <span className="font-semibold text-sm tracking-tight">lets-chat</span>
        {globalUnread > 0 && (
          <span
            data-testid="header-global-unread"
            className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white"
          >
            {globalUnread > 99 ? "99+" : globalUnread}
          </span>
        )}
      </Link>

      <div className="flex items-center gap-3">
        {isAuthenticated && <GlobalMessageSearch />}
        {isLoading ? (
          <span className="text-xs text-zinc-400">{t("header.loading")}</span>
        ) : isAuthenticated && user ? (
          <>
            <div className="flex items-center gap-2">
              <div className="relative h-6 w-6 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                {user.avatarUrl ? (
                  <Image src={getAvatarUrl(user.avatarUrl) || ""} alt="" fill className="object-cover" unoptimized />
                ) : (
                  <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                    {(user.displayName || user.username || "?").slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="text-sm text-zinc-600 dark:text-zinc-300">
                {user.displayName || user.username}
              </span>
            </div>
            <Link
              href="/profile"
              className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {t("header.profile")}
            </Link>
            <button
              onClick={() => logout()}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              {t("header.logout")}
            </button>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {t("header.signIn")}
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              {t("header.createAccount")}
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
