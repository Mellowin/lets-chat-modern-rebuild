"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { useLocale } from "@/lib/locale";
import { LEGAL_CONFIG } from "@/lib/legal-config";
import { Button } from "@/components/ui/Button";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 sm:p-10">
      <Button asChild variant="ghost" className="w-fit">
        <Link href="/" className="inline-flex items-center gap-1">
          <ChevronLeft size={16} />
          {t("legal.backToHome")}
        </Link>
      </Button>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-10">
        {LEGAL_CONFIG.isBeta && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
            {t("legal.betaNotice")}
          </div>
        )}

        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>

        <div className="space-y-6 text-sm leading-relaxed text-foreground">
          {children}
        </div>

        <div className="mt-8 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>
            {t("legal.operatorName")}: {LEGAL_CONFIG.operatorName}
          </p>
          <p>
            {t("legal.supportEmail")}:{" "}
            <a
              href={`mailto:${LEGAL_CONFIG.supportEmail}`}
              className="text-primary hover:underline"
            >
              {LEGAL_CONFIG.supportEmail}
            </a>
          </p>
          <p>
            {t("legal.abuseEmail")}:{" "}
            <a
              href={`mailto:${LEGAL_CONFIG.abuseEmail}`}
              className="text-primary hover:underline"
            >
              {LEGAL_CONFIG.abuseEmail}
            </a>
          </p>
          <p>
            {t("legal.effectiveDate")}: {LEGAL_CONFIG.effectiveDate}
          </p>
          <p>
            {t("legal.lastUpdated")}: {LEGAL_CONFIG.lastUpdated}
          </p>
        </div>
      </div>
    </div>
  );
}
