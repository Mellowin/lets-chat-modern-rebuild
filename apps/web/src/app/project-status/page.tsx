import Link from "next/link";
import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Lets Chat Project Status",
  description:
    "Production-deployed full-stack chat app built with Next.js, NestJS, Prisma, PostgreSQL and Socket.io. Actively in development.",
  openGraph: {
    title: "Lets Chat Project Status",
    description:
      "Production-deployed full-stack chat app built with Next.js, NestJS, Prisma, PostgreSQL and Socket.io. Actively in development.",
  },
};

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

export default function ProjectStatusPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 sm:p-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} />
        Back to home
      </Link>

      <PageHeader
        title="Project Status"
        subtitle="lets-chat — a modern, secure team collaboration platform."
        actions={
          <Badge variant="warning">
            <Clock className="mr-1 h-3 w-3" />
            Active development
          </Badge>
        }
      />

      <p className="text-sm text-muted-foreground">
        This project is actively in development. Not all planned features are
        implemented yet.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Best viewed as
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-card-foreground">
            Portfolio piece / active development project demonstrating
            full-stack engineering, real-time systems, auth security, and
            production deployment practices.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Current production status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <StatusItem>Web deployed on Vercel</StatusItem>
            <StatusItem>API deployed on Render</StatusItem>
            <StatusItem>Emails delivered via Resend</StatusItem>
            <StatusItem>Database running on PostgreSQL</StatusItem>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            What already works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <StatusItem>User registration with email verification</StatusItem>
            <StatusItem>
              Login, logout, and access/refresh token rotation
            </StatusItem>
            <StatusItem>Password reset and authenticated password change</StatusItem>
            <StatusItem>
              Profile management: display name, avatar, interface language, email
              change
            </StatusItem>
            <StatusItem>
              Session management: list active sessions and revoke all sessions
            </StatusItem>
            <StatusItem>Workspaces and channels with auto-generated slugs</StatusItem>
            <StatusItem>Real-time messaging via Socket.io</StatusItem>
            <StatusItem>
              Message editing, deletion, replies, forwarding, and reactions
            </StatusItem>
            <StatusItem>Direct messages between users</StatusItem>
            <StatusItem>Resend email delivery for auth flows</StatusItem>
            <StatusItem>Post-deploy production smoke checks</StatusItem>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            In progress / planned
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <StatusItem>File attachments in messages</StatusItem>
            <StatusItem>Message search</StatusItem>
            <StatusItem>Slug-based public URLs</StatusItem>
            <StatusItem>Expanded E2E test coverage</StatusItem>
            <StatusItem>UI polish and accessibility improvements</StatusItem>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Tech stack
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TechItem label="Frontend">
              Next.js 16, React 19, Tailwind CSS, TypeScript
            </TechItem>
            <TechItem label="Backend">
              NestJS, Prisma, PostgreSQL, Socket.io
            </TechItem>
            <TechItem label="Email">Resend</TechItem>
            <TechItem label="Storage">S3-compatible (MinIO)</TechItem>
            <TechItem label="Auth">
              JWT access + refresh tokens, sessionStorage
            </TechItem>
            <TechItem label="Deployment">Vercel (web), Render (API)</TechItem>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5 text-primary" />
            Production links
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li>
              <span className="text-muted-foreground">App:</span>{" "}
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
              <span className="text-muted-foreground">API health:</span>{" "}
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
                API docs (Swagger):
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
              <span className="text-muted-foreground">Source:</span>{" "}
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
