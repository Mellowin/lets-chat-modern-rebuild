"use client";

import { useLocale } from "@/lib/locale";
import { LegalPage } from "../LegalPage";

export default function PrivacyPage() {
  const { t } = useLocale();
  return (
    <LegalPage title={t("legal.privacyTitle")}>
      <p>{t("legal.privacyIntro")}</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("legal.privacyAccountSectionTitle")}</h2>
        <p>{t("legal.privacyAccountData")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("legal.privacyMessagesSectionTitle")}</h2>
        <p>{t("legal.privacyMessagesAttachments")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("legal.privacySessionsSectionTitle")}</h2>
        <p>{t("legal.privacySessionsDevice")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("legal.privacyPushSectionTitle")}</h2>
        <p>{t("legal.privacyPushSubscriptions")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("legal.privacyReportsSectionTitle")}</h2>
        <p>{t("legal.privacyReportsAudit")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("legal.privacyCookiesSectionTitle")}</h2>
        <p>{t("legal.privacyCookiesStorage")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("legal.privacyPurposesSectionTitle")}</h2>
        <p>{t("legal.privacyPurposes")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("legal.privacyRetentionSectionTitle")}</h2>
        <p>{t("legal.privacyRetention")}</p>
        <p>{t("legal.privacyBackup")}</p>
        <p>{t("legal.privacyAbuseRetention")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("legal.privacyDeletionSectionTitle")}</h2>
        <p>{t("legal.privacyDeletionGrace")}</p>
        <p>{t("legal.privacyAnonymization")}</p>
        <p>{t("legal.privacyAttachmentRemoval")}</p>
        <p>{t("legal.privacyDataExport")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("legal.privacyEncryptionSectionTitle")}</h2>
        <p>{t("legal.privacyNoE2EE")}</p>
        <p>{t("legal.privacyOperatorAccess")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("legal.privacyChangesSectionTitle")}</h2>
        <p>{t("legal.privacyChanges")}</p>
      </section>
    </LegalPage>
  );
}
