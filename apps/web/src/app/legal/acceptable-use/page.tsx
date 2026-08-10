"use client";

import { useLocale } from "@/lib/locale";
import { LegalPage } from "../LegalPage";

export default function AcceptableUsePage() {
  const { t } = useLocale();
  return (
    <LegalPage title={t("legal.acceptableUseTitle")}>
      <p>{t("legal.acceptableIntro")}</p>
      <p>{t("legal.acceptableIllegal")}</p>
      <p>{t("legal.acceptableHarassment")}</p>
      <p>{t("legal.acceptableSpam")}</p>
      <p>{t("legal.acceptableMalware")}</p>
      <p>{t("legal.acceptableCredentials")}</p>
      <p>{t("legal.acceptablePrivacy")}</p>
      <p>{t("legal.acceptableReports")}</p>
      <p>{t("legal.acceptableFlooding")}</p>
      <p>{t("legal.acceptableConsequences")}</p>
    </LegalPage>
  );
}
