"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MessageSquare } from "lucide-react";
import { getHealth, type HealthResponse } from "@/lib/api";
import { getApiOrigin } from "@/lib/env";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";

type HealthState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: HealthResponse }
  | { kind: "error"; message: string };

export default function Home() {
  const { t } = useLocale();
  const [health, setHealth] = useState<HealthState>({ kind: "idle" });

  async function handleCheck() {
    setHealth({ kind: "loading" });
    try {
      const data = await getHealth();
      setHealth({ kind: "success", data });
    } catch (err) {
      const message = localizeApiError(err, "home.unknownError", t);
      setHealth({ kind: "error", message });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 sm:p-10">
      <div className="flex flex-col gap-2">
        <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          <MessageSquare className="h-5 w-5" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          {t("home.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("home.description")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link href="/login">{t("header.signIn")}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/register">{t("header.createAccount")}</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/project-status">{t("home.projectStatus")}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{t("home.backendStatus")}</CardTitle>
              <CardDescription>{t("home.verifyApi")}</CardDescription>
            </div>
            <Button
              onClick={handleCheck}
              disabled={health.kind === "loading"}
            >
              {health.kind === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("home.checking")}
                </>
              ) : (
                t("home.checkApiHealth")
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {health.kind === "idle" && (
            <p className="text-sm text-muted-foreground">
              {t("home.clickToCheck")}
            </p>
          )}

          {health.kind === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("home.contactingBackend")}
            </div>
          )}

          {health.kind === "success" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {health.data.status === "ok" ? t("home.healthy") : t("home.degraded")}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                <dt className="text-zinc-500 dark:text-zinc-500">{t("home.environment")}</dt>
                <dd className="font-mono">{health.data.environment}</dd>
                <dt className="text-zinc-500 dark:text-zinc-500">{t("home.database")}</dt>
                <dd className="font-mono">{health.data.database}</dd>
                <dt className="text-zinc-500 dark:text-zinc-500">{t("home.uptime")}</dt>
                <dd className="font-mono">
                  {Math.floor(health.data.uptime)}s
                </dd>
                <dt className="text-zinc-500 dark:text-zinc-500">{t("home.timestamp")}</dt>
                <dd className="font-mono">
                  {new Date(health.data.timestamp).toLocaleTimeString()}
                </dd>
              </dl>
            </div>
          )}

          {health.kind === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
              <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {t("home.unreachable")}
              </div>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                {health.message}
              </p>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                {t("home.makeSureBackend", getApiOrigin())}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
