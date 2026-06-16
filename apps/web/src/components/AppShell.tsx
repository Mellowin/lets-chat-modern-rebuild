"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/confirm-email-change",
  "/invites",
  "/project-status",
];

function isPublicRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname() ?? "";
  const showSidebar = !isPublicRoute(pathname);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Close the mobile drawer when the route changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobileMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <Header onMenuToggle={showSidebar ? () => setIsMobileMenuOpen(true) : undefined} />
      <div className="flex flex-1 overflow-hidden">
        {showSidebar && (
          <>
            <Sidebar mobileOpen={isMobileMenuOpen} />
            {isMobileMenuOpen && (
              <div
                className="fixed inset-0 z-30 bg-black/25 sm:hidden"
                onClick={() => setIsMobileMenuOpen(false)}
                data-testid="mobile-menu-backdrop"
                aria-hidden="true"
              />
            )}
          </>
        )}
        <main className="flex-1 overflow-auto bg-background">{children}</main>
      </div>
    </>
  );
}
