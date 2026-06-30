#!/usr/bin/env node
/* eslint-disable no-console */
import { chromium } from "playwright";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const finalDir = join(__dirname, "..", "docs", "career", "final");

const resumes = [
  "Valerii_Khoidas_CV_UA.html",
  "Valerii_Khoidas_CV_EN.html",
];

async function printPdf(htmlName) {
  const htmlPath = join(finalDir, htmlName);
  const pdfPath = htmlPath.replace(/\.html$/, ".pdf");
  const fileUrl = "file://" + htmlPath.replace(/\\/g, "/");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(fileUrl, { waitUntil: "networkidle" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", right: "16mm", bottom: "14mm", left: "16mm" },
  });
  await browser.close();
  console.log(`Generated: ${pdfPath}`);
}

async function main() {
  for (const name of resumes) {
    await printPdf(name);
  }
}

main().catch((err) => {
  console.error("PDF generation failed:", err.message);
  process.exit(1);
});
