"use client";

import { useLocale } from "@/lib/locale";
import { LegalPage } from "../LegalPage";

export default function TermsPage() {
  const { t } = useLocale();
  return (
    <LegalPage title={t("legal.termsTitle")}>
      <p>{t("legal.termsIntro")}</p>
      <p>{t("legal.termsBeta")}</p>
      <p>{t("legal.termsServiceChanges")}</p>
      <p>{t("legal.termsNoUptime")}</p>
      <p>{t("legal.termsAccountSecurity")}</p>
      <p>{t("legal.termsContentOwnership")}</p>
      <p>{t("legal.termsProhibitedConduct")}</p>
      <p>{t("legal.termsSuspension")}</p>
      <p>{t("legal.termsLimitation")}</p>
      <p>{t("legal.termsChanges")}</p>
    </LegalPage>
  );
}
