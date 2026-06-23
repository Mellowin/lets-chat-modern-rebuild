"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import {
  isPushSupported,
  getPushPermissionState,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingPushSubscription,
  type PushPermissionState,
} from "@/lib/push-subscription";

type SectionStatus = "idle" | "loading-enable" | "loading-disable" | "success" | "error";

function Alert({
  variant,
  children,
}: {
  variant: "success" | "error";
  children: React.ReactNode;
}) {
  const variants = {
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400",
    error:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400",
  };
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${variants[variant]}`}
      role="alert"
    >
      {children}
    </div>
  );
}

export function PushNotificationsSection() {
  const { accessToken } = useAuth();
  const { t } = useLocale();
  const [permission, setPermission] = useState<PushPermissionState>(() =>
    getPushPermissionState(),
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isPushSupported()) return;
    getExistingPushSubscription()
      .then((subscription) => setIsSubscribed(!!subscription))
      .catch(() => {
        // Ignore best-effort check failures.
      });
  }, []);

  const handleEnable = async () => {
    if (!accessToken) return;
    setStatus("loading-enable");
    setErrorMessage("");
    try {
      await subscribeToPush(accessToken);
      setIsSubscribed(true);
      setPermission("granted");
      setStatus("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
      setPermission(getPushPermissionState());
      setStatus("error");
    }
  };

  const handleDisable = async () => {
    if (!accessToken) return;
    setStatus("loading-disable");
    setErrorMessage("");
    try {
      await unsubscribeFromPush(accessToken);
      setIsSubscribed(false);
      setStatus("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
      setStatus("error");
    }
  };

  const supported = isPushSupported();
  const blocked = permission === "denied";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell size={18} />
          {t("profile.pushNotifications")}
        </CardTitle>
        <CardDescription>{t("profile.pushNotificationsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!supported && (
          <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/50 p-4">
            <BellOff className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("profile.pushNotificationsUnsupported")}
            </p>
          </div>
        )}

        {supported && blocked && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
            <BellOff className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">{t("profile.pushNotificationsBlocked")}</p>
          </div>
        )}

        {supported && !blocked && !isSubscribed && (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">
              {t("profile.pushNotificationsDisabled")}
            </p>
            <Button
              type="button"
              onClick={handleEnable}
              disabled={status === "loading-enable"}
              data-testid="enable-push-notifications"
            >
              {status === "loading-enable" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("profile.enablingNotifications")}
                </>
              ) : (
                t("profile.enableNotifications")
              )}
            </Button>
          </div>
        )}

        {supported && !blocked && isSubscribed && (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">
              {t("profile.pushNotificationsEnabled")}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={handleDisable}
              disabled={status === "loading-disable"}
              data-testid="disable-push-notifications"
            >
              {status === "loading-disable" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("profile.disablingNotifications")}
                </>
              ) : (
                t("profile.disableNotifications")
              )}
            </Button>
          </div>
        )}

        {status === "success" && (
          <Alert variant="success">
            {isSubscribed
              ? t("profile.notificationsEnabled")
              : t("profile.notificationsDisabled")}
          </Alert>
        )}

        {status === "error" && <Alert variant="error">{errorMessage}</Alert>}
      </CardContent>
    </Card>
  );
}
