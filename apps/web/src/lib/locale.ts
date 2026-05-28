import { useState, useCallback } from "react";

export type Locale = "en" | "uk" | "ru";

const LOCALE_KEY = "lets-chat:locale";

const LABELS: Record<Locale, { label: string; native: string }> = {
  en: { label: "English", native: "English" },
  uk: { label: "Ukrainian", native: "Українська" },
  ru: { label: "Russian", native: "Русский" },
};

export function getLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const raw = localStorage.getItem(LOCALE_KEY);
  if (raw === "uk" || raw === "ru") return raw;
  return "en";
}

export function setLocaleStorage(locale: Locale) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCALE_KEY, locale);
}

export function localeLabel(locale: Locale): string {
  return LABELS[locale].native;
}

export function useLocale(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
} {
  const [locale, setLocaleState] = useState<Locale>(getLocale);

  const handleSetLocale = useCallback((next: Locale) => {
    setLocaleStorage(next);
    setLocaleState(next);
  }, []);

  return { locale, setLocale: handleSetLocale };
}
