"use client";

import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
  type NotificationPreferencesInput,
} from "@/lib/auth-api";

export function NotificationPreferencesSection() {
  const { accessToken } = useAuth();
  const { t } = useLocale();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState<keyof NotificationPreferences | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    const token = accessToken;
    let cancelled = false;
    async function load() {
      setError("");
      try {
        const prefs = await getNotificationPreferences(token);
        if (!cancelled) setPreferences(prefs);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const handleToggle = async (key: keyof NotificationPreferences) => {
    if (!accessToken || !preferences) return;
    const next = !preferences[key];
    setSaving(key);
    setError("");
    try {
      const input: NotificationPreferencesInput = { [key]: next };
      const updated = await updateNotificationPreferences(accessToken, input);
      setPreferences(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  const items: { key: keyof NotificationPreferences; label: string; description: string }[] = [
    {
      key: "pushNotificationsEnabled",
      label: t("profile.pushNotificationsToggle"),
      description: t("profile.pushNotificationsToggleDescription"),
    },
    {
      key: "mentionNotificationsEnabled",
      label: t("profile.mentionNotificationsToggle"),
      description: t("profile.mentionNotificationsToggleDescription"),
    },
    {
      key: "directMessageNotificationsEnabled",
      label: t("profile.directMessageNotificationsToggle"),
      description: t("profile.directMessageNotificationsToggleDescription"),
    },
    {
      key: "groupMessageNotificationsEnabled",
      label: t("profile.groupMessageNotificationsToggle"),
      description: t("profile.groupMessageNotificationsToggleDescription"),
    },
    {
      key: "channelMessageNotificationsEnabled",
      label: t("profile.channelMessageNotificationsToggle"),
      description: t("profile.channelMessageNotificationsToggleDescription"),
    },
  ];

  const loading = preferences === null && !error;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 size={18} />
          {t("profile.notificationPreferences")}
        </CardTitle>
        <CardDescription>{t("profile.notificationPreferencesDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("profile.loadingNotificationPreferences")}
          </div>
        )}

        {!loading &&
          items.map((item) => (
            <div
              key={item.key}
              className="flex items-start justify-between gap-4 rounded-lg border p-4"
              data-testid={`notification-preference-${item.key}`}
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              <Switch
                checked={preferences?.[item.key] ?? true}
                onCheckedChange={() => handleToggle(item.key)}
                disabled={saving === item.key || loading || !preferences}
                aria-label={item.label}
                data-testid={`notification-preference-switch-${item.key}`}
              />
            </div>
          ))}

        {error && (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"
            role="alert"
          >
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
