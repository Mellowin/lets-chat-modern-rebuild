"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, Smartphone, CheckCircle2, Info } from "lucide-react";

import { useLocale } from "@/lib/locale";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallState =
  | "unsupported"
  | "installed"
  | "available"
  | "prompting"
  | "accepted"
  | "dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if ("standalone" in window.navigator && window.navigator.standalone === true) {
    return true;
  }
  return window.matchMedia("(display-mode: standalone)").matches;
}

function isPwaSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.navigator.serviceWorker !== "undefined";
}

export function PwaInstallSection() {
  const { t } = useLocale();
  const [installState, setInstallState] = useState<InstallState>(() => {
    if (!isPwaSupported()) return "unsupported";
    if (isStandalone()) return "installed";
    return "available";
  });
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (!isPwaSupported()) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setInstallState("available");
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setInstallState("installed");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    setInstallState("prompting");
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setInstallState(choice.outcome === "accepted" ? "accepted" : "dismissed");
    } catch {
      setInstallState("available");
    } finally {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone size={18} />
          {t("profile.appInstall")}
        </CardTitle>
        <CardDescription>{t("profile.appInstallDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {installState === "unsupported" && (
          <div
            className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/50 p-4"
            data-testid="pwa-unsupported"
          >
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("profile.pwaUnsupported")}
            </p>
          </div>
        )}

        {installState === "installed" && (
          <div
            className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400"
            data-testid="pwa-installed"
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">{t("profile.appInstalled")}</p>
          </div>
        )}

        {installState !== "unsupported" && installState !== "installed" && (
          <div className="flex flex-col items-start gap-3">
            {deferredPrompt ? (
              <Button
                type="button"
                onClick={handleInstall}
                disabled={installState === "prompting"}
                data-testid="pwa-install-button"
              >
                {installState === "prompting" ? (
                  <>{t("profile.installingApp")}</>
                ) : (
                  <>
                    <Download size={16} className="mr-2" />
                    {t("profile.installAppButton")}
                  </>
                )}
              </Button>
            ) : (
              <div
                className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400"
                data-testid="pwa-manual-instructions"
              >
                <Info className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm">{t("profile.pwaManualInstructions")}</p>
              </div>
            )}

            {installState === "accepted" && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
                {t("profile.installAppAccepted")}
              </div>
            )}
            {installState === "dismissed" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                {t("profile.installAppDismissed")}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
