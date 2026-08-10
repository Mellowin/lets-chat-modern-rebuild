#!/usr/bin/env node
/**
 * Production legal configuration verifier.
 *
 * Run before a public launch to confirm that placeholder values have been
 * replaced with production-specific legal configuration.
 *
 * This script is intentionally NOT run automatically during local builds or
 * normal CI. Invoke it explicitly when preparing a release, for example:
 *
 *   LEGAL_VERIFY_PRODUCTION=1 node scripts/verify-production-legal.mjs
 *
 * Or via the package script:
 *
 *   pnpm run verify:production-legal
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const requiredPublicRoutes = [
  "apps/web/src/app/privacy/page.tsx",
  "apps/web/src/app/terms/page.tsx",
  "apps/web/src/app/acceptable-use/page.tsx",
];

const operatorName = process.env.NEXT_PUBLIC_OPERATOR_NAME || "";
const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
const abuseEmail = process.env.NEXT_PUBLIC_ABUSE_EMAIL || "";
const effectiveDate = process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE || "";
const legalTextStatus = process.env.NEXT_PUBLIC_LEGAL_TEXT_STATUS || "draft";

const errors = [];

if (!operatorName || operatorName.includes("Beta Operator") || operatorName.includes("placeholder") || operatorName.includes("TODO")) {
  errors.push(`operatorName is missing or placeholder: "${operatorName}"`);
}

if (!supportEmail || supportEmail.endsWith(".invalid") || !supportEmail.includes("@")) {
  errors.push(`supportEmail is missing or placeholder .invalid address: "${supportEmail}"`);
}

if (!abuseEmail || abuseEmail.endsWith(".invalid") || !abuseEmail.includes("@")) {
  errors.push(`abuseEmail is missing or placeholder .invalid address: "${abuseEmail}"`);
}

if (!effectiveDate || effectiveDate === "draft" || effectiveDate === "YYYY-MM-DD") {
  errors.push(`effectiveDate is missing or placeholder: "${effectiveDate}"`);
}

if (legalTextStatus === "draft") {
  errors.push(`legal text is still marked as draft (NEXT_PUBLIC_LEGAL_TEXT_STATUS=${legalTextStatus})`);
}

for (const route of requiredPublicRoutes) {
  const fullPath = join(process.cwd(), route);
  if (!existsSync(fullPath)) {
    errors.push(`required legal route file is missing: ${route}`);
  }
}

if (errors.length > 0) {
  console.error("FAIL: production legal verification failed");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("PASS: production legal configuration is ready");
process.exit(0);
