"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  Layers,
  Server,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLocale } from "@/lib/locale";

function StatusItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-card-foreground">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span>{children}</span>
    </li>
  );
}

function TechItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="text-card-foreground">{children}</span>
    </div>
  );
}

export default function ProjectStatusContent() {
  const { t } = useLocale();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 sm:p-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} />
        {t("projectStatus.backToHome")}
      </Link>

      <PageHeader
        title={t("projectStatus.title")}
        subtitle={t("projectStatus.subtitle")}
        actions={
          <Badge variant="warning">
            <Clock className="mr-1 h-3 w-3" />
            {t("projectStatus.activeDevelopment")}
          </Badge>
        }
      />

      <p className="text-sm text-muted-foreground">
        {t("projectStatus.inProgressNote")}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            {t("projectStatus.bestViewedAs")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-card-foreground">
            {t("projectStatus.portfolioDescription")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            {t("projectStatus.currentProductionStatus")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <StatusItem>{t("projectStatus.webDeployed")}</StatusItem>
            <StatusItem>{t("projectStatus.apiDeployed")}</StatusItem>
            <StatusItem>{t("projectStatus.emailsDelivered")}</StatusItem>
            <StatusItem>{t("projectStatus.databaseRunning")}</StatusItem>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            {t("projectStatus.whatWorks")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <StatusItem>{t("projectStatus.userRegistration")}</StatusItem>
            <StatusItem>{t("projectStatus.loginLogout")}</StatusItem>
            <StatusItem>{t("projectStatus.passwordReset")}</StatusItem>
            <StatusItem>{t("projectStatus.profileManagement")}</StatusItem>
            <StatusItem>{t("projectStatus.sessionManagement")}</StatusItem>
            <StatusItem>{t("projectStatus.workspacesChannels")}</StatusItem>
            <StatusItem>{t("projectStatus.realTimeMessaging")}</StatusItem>
            <StatusItem>{t("projectStatus.messageFeatures")}</StatusItem>
            <StatusItem>{t("projectStatus.directMessages")}</StatusItem>
            <StatusItem>{t("projectStatus.resendDelivery")}</StatusItem>
            <StatusItem>{t("projectStatus.productionSmoke")}</StatusItem>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            {t("projectStatus.inProgressPlanned")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <StatusItem>{t("projectStatus.fileAttachments")}</StatusItem>
            <StatusItem>{t("projectStatus.messageSearch")}</StatusItem>
            <StatusItem>{t("projectStatus.slugUrls")}</StatusItem>
            <StatusItem>{t("projectStatus.e2eTests")}</StatusItem>
            <StatusItem>{t("projectStatus.uiPolish")}</StatusItem>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            {t("projectStatus.techStack")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TechItem label={t("projectStatus.frontend")}>
              {t("projectStatus.frontendValue")}
            </TechItem>
            <TechItem label={t("projectStatus.backend")}>
              {t("projectStatus.backendValue")}
            </TechItem>
            <TechItem label={t("projectStatus.email")}>
              {t("projectStatus.emailValue")}
            </TechItem>
            <TechItem label={t("projectStatus.storage")}>
              {t("projectStatus.storageValue")}
            </TechItem>
            <TechItem label={t("projectStatus.auth")}>
              {t("projectStatus.authValue")}
            </TechItem>
            <TechItem label={t("projectStatus.deployment")}>
              {t("projectStatus.deploymentValue")}
            </TechItem>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5 text-primary" />
            {t("projectStatus.productionLinks")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li>
              <span className="text-muted-foreground">{t("projectStatus.appLinkLabel")}</span>{" "}
              <a
                href="https://lets-chat-web.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-card-foreground hover:text-primary hover:underline"
              >
                https://lets-chat-web.vercel.app
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              <span className="text-muted-foreground">{t("projectStatus.apiHealthLabel")}</span>{" "}
              <a
                href="https://lets-chat-api-v2.onrender.com/api/v1/health"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-card-foreground hover:text-primary hover:underline"
              >
                /health
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              <span className="text-muted-foreground">
                {t("projectStatus.apiDocsLabel")}
              </span>{" "}
              <a
                href="https://lets-chat-api-v2.onrender.com/api/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-card-foreground hover:text-primary hover:underline"
              >
                /docs
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              <span className="text-muted-foreground">{t("projectStatus.sourceLabel")}</span>{" "}
              <a
                href="https://github.com/Mellowin/lets-chat-modern-rebuild"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-card-foreground hover:text-primary hover:underline"
              >
                GitHub
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
