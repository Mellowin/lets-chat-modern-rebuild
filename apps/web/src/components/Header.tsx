"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { User, LogOut, MessageSquare, Menu } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { GLOBAL_UNREAD_CHANGED_EVENT, type GlobalUnreadPayload } from "@/lib/global-unread";
import GlobalMessageSearch from "./GlobalMessageSearch";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";

interface HeaderProps {
  onMenuToggle?: () => void;
}

export default function Header({ onMenuToggle }: HeaderProps) {
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
    <header className="flex items-center justify-between h-14 px-3 sm:px-4 border-b border-indigo-500/20 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-header-foreground shrink-0 shadow-md">
      <div className="flex items-center gap-2">
        {onMenuToggle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMenuToggle}
            aria-label={t("header.openMenu")}
            data-testid="mobile-menu-button"
            className="sm:hidden"
          >
            <Menu size={18} />
          </Button>
        )}
        <Link href={isAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-2 group">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <MessageSquare size={16} strokeWidth={2.5} />
        </div>
        <span className="font-semibold text-sm tracking-tight text-header-foreground">lets-chat</span>
        {globalUnread > 0 && (
          <span
            data-testid="header-global-unread"
            className="inline-flex h-4 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground"
          >
            {globalUnread > 99 ? "99+" : globalUnread}
          </span>
        )}
      </Link>
      </div>

      <div className="flex items-center gap-2">
        {isAuthenticated && <GlobalMessageSearch />}
        {isLoading ? (
          <span className="text-xs text-header-muted">{t("header.loading")}</span>
        ) : isAuthenticated && user ? (
          <>
            <div className="flex items-center gap-2 pr-2">
              <Avatar
                src={user.avatarUrl}
                name={user.displayName || user.username}
                size="sm"
              />
              <span className="hidden sm:inline text-sm text-header-muted">
                {user.displayName || user.username}
              </span>
            </div>
            <Link
              href="/profile"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 h-8 text-xs font-medium text-header-foreground hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header"
            >
              <User size={14} />
              {t("header.profile")}
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => logout()}
              className="gap-1.5 bg-header-foreground/10 text-header-foreground hover:bg-header-foreground/20 border-transparent"
            >
              <LogOut size={14} />
              {t("header.logout")}
            </Button>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg px-3 h-8 text-xs font-medium text-header-foreground hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header"
            >
              {t("header.signIn")}
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg px-3 h-8 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header"
            >
              {t("header.createAccount")}
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
