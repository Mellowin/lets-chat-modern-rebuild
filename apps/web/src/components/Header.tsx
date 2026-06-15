"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { User, LogOut, MessageSquare } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { GLOBAL_UNREAD_CHANGED_EVENT, type GlobalUnreadPayload } from "@/lib/global-unread";
import GlobalMessageSearch from "./GlobalMessageSearch";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";

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
    <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50 shrink-0">
      <Link href={isAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-2 group">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <MessageSquare size={16} strokeWidth={2.5} />
        </div>
        <span className="font-semibold text-sm tracking-tight">lets-chat</span>
        {globalUnread > 0 && (
          <span
            data-testid="header-global-unread"
            className="inline-flex h-4 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground"
          >
            {globalUnread > 99 ? "99+" : globalUnread}
          </span>
        )}
      </Link>

      <div className="flex items-center gap-2">
        {isAuthenticated && <GlobalMessageSearch />}
        {isLoading ? (
          <span className="text-xs text-muted-foreground">{t("header.loading")}</span>
        ) : isAuthenticated && user ? (
          <>
            <div className="flex items-center gap-2 pr-2">
              <Avatar
                src={user.avatarUrl}
                name={user.displayName || user.username}
                size="sm"
              />
              <span className="hidden sm:inline text-sm text-muted-foreground">
                {user.displayName || user.username}
              </span>
            </div>
            <Link
              href="/profile"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 h-8 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <User size={14} />
              {t("header.profile")}
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => logout()}
              className="gap-1.5"
            >
              <LogOut size={14} />
              {t("header.logout")}
            </Button>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg px-3 h-8 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t("header.signIn")}
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg px-3 h-8 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t("header.createAccount")}
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
