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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-indigo-400/20 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 px-3 text-header-foreground shadow-md backdrop-blur-sm sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        {onMenuToggle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMenuToggle}
            aria-label={t("header.openMenu")}
            data-testid="mobile-menu-button"
            className="shrink-0 text-header-foreground hover:bg-white/10 hover:text-header-foreground sm:hidden"
          >
            <Menu size={18} />
          </Button>
        )}
        <Link
          href={isAuthenticated ? "/dashboard" : "/"}
          className="group flex min-w-0 items-center gap-2 rounded-lg pr-2 transition-transform active:scale-[0.98]"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-indigo-400 text-primary-foreground shadow-sm ring-1 ring-white/10 transition-shadow group-hover:shadow-md group-hover:ring-white/20">
            <MessageSquare size={16} strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold tracking-tight text-header-foreground">
            lets-chat
          </span>
          {globalUnread > 0 && (
            <span
              data-testid="header-global-unread"
              className="inline-flex h-4 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground shadow-sm ring-1 ring-white/10"
            >
              {globalUnread > 99 ? "99+" : globalUnread}
            </span>
          )}
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {isAuthenticated && <GlobalMessageSearch />}
        {isLoading ? (
          <span className="text-xs text-header-muted">{t("header.loading")}</span>
        ) : isAuthenticated && user ? (
          <>
            <div className="flex items-center gap-2 pr-1 sm:pr-2">
              <Avatar src={user.avatarUrl} name={user.displayName || user.username} size="sm" />
              <span className="hidden max-w-[8rem] truncate text-sm text-header-muted sm:inline">
                {user.displayName || user.username}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-header-foreground hover:bg-white/10 hover:text-header-foreground"
            >
              <Link href="/profile" aria-label={t("header.profile")}>
                <User size={14} />
                <span className="hidden sm:inline">{t("header.profile")}</span>
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => logout()}
              className="gap-1.5 border-transparent bg-header-foreground/10 text-header-foreground hover:bg-header-foreground/20"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">{t("header.logout")}</span>
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-header-foreground hover:bg-white/10 hover:text-header-foreground"
            >
              <Link href="/login">{t("header.signIn")}</Link>
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link href="/register">{t("header.createAccount")}</Link>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
