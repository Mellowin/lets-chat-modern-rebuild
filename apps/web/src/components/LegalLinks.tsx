"use client";

import Link from "next/link";
import { useLocale } from "@/lib/locale";

export function LegalLinks({ className = "" }: { className?: string }) {
  const { t } = useLocale();
  return (
    <nav
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground ${className}`}
      aria-label="Legal"
    >
      <Link href="/privacy" className="hover:text-foreground hover:underline">
        {t("legal.privacyTitle")}
      </Link>
      <Link href="/terms" className="hover:text-foreground hover:underline">
        {t("legal.termsTitle")}
      </Link>
      <Link href="/acceptable-use" className="hover:text-foreground hover:underline">
        {t("legal.acceptableUseTitle")}
      </Link>
    </nav>
  );
}
