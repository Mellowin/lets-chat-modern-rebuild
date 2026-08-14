/**
 * Public legal/beta configuration.
 *
 * These values are safe to expose to the browser and should be replaced with
 * production-specific values before a public launch. The production verifier
 * in scripts/ checks that placeholders have been replaced.
 */

export const LEGAL_CONFIG = {
  operatorName: process.env.NEXT_PUBLIC_OPERATOR_NAME || "LetsChat Beta Operator",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.invalid",
  abuseEmail: process.env.NEXT_PUBLIC_ABUSE_EMAIL || "abuse@example.invalid",
  effectiveDate: process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE || "2026-08-03",
  lastUpdated: process.env.NEXT_PUBLIC_LEGAL_LAST_UPDATED || "2026-08-03",
  isBeta: process.env.NEXT_PUBLIC_BETA_NOTICE !== "false",
};

export function isLegalConfigPlaceholder(): boolean {
  return (
    LEGAL_CONFIG.supportEmail.endsWith(".invalid") ||
    LEGAL_CONFIG.abuseEmail.endsWith(".invalid") ||
    LEGAL_CONFIG.operatorName.includes("Beta Operator") ||
    LEGAL_CONFIG.effectiveDate === "draft"
  );
}
