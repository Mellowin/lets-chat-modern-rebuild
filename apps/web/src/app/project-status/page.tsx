import Link from "next/link";
import type { Metadata } from "next";

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

export default function ProjectStatusPage() {
  return (
    <div className="flex flex-col p-6 sm:p-10 max-w-3xl">
      <Link
        href="/"
        className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        ← Back to home
      </Link>

      <h1 className="mt-6 text-2xl sm:text-3xl font-semibold tracking-tight">
        Project Status
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        lets-chat — a modern, secure team collaboration platform.
      </p>
      <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-400">
        This project is actively in development. Not all planned features are
        implemented yet.
      </p>

      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Best viewed as</h2>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          Portfolio piece / active development project demonstrating full-stack
          engineering, real-time systems, auth security, and production
          deployment practices.
        </p>
      </div>

      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Current production status</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300 list-disc list-inside">
          <li>Web deployed on Vercel</li>
          <li>API deployed on Render</li>
          <li>Emails delivered via Resend</li>
          <li>Database running on PostgreSQL</li>
        </ul>
      </div>

      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">What already works</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300 list-disc list-inside">
          <li>User registration with email verification</li>
          <li>Login, logout, and access/refresh token rotation</li>
          <li>Password reset and authenticated password change</li>
          <li>
            Profile management: display name, avatar, interface language, email
            change
          </li>
          <li>
            Session management: list active sessions and revoke all sessions
          </li>
          <li>Workspaces and channels with auto-generated slugs</li>
          <li>Real-time messaging via Socket.io</li>
          <li>
            Message editing, deletion, replies, forwarding, and reactions
          </li>
          <li>Direct messages between users</li>
          <li>Resend email delivery for auth flows</li>
          <li>Post-deploy production smoke checks</li>
        </ul>
      </div>

      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">In progress / planned</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300 list-disc list-inside">
          <li>File attachments in messages</li>
          <li>Message search</li>
          <li>Slug-based public URLs</li>
          <li>Expanded E2E test coverage</li>
          <li>UI polish and accessibility improvements</li>
        </ul>
      </div>

      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Tech stack</h2>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Frontend:</span>{" "}
            <span className="text-zinc-700 dark:text-zinc-300">
              Next.js 16, React 19, Tailwind CSS, TypeScript
            </span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Backend:</span>{" "}
            <span className="text-zinc-700 dark:text-zinc-300">
              NestJS, Prisma, PostgreSQL, Socket.io
            </span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Email:</span>{" "}
            <span className="text-zinc-700 dark:text-zinc-300">Resend</span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Storage:</span>{" "}
            <span className="text-zinc-700 dark:text-zinc-300">
              S3-compatible (MinIO)
            </span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Auth:</span>{" "}
            <span className="text-zinc-700 dark:text-zinc-300">
              JWT access + refresh tokens, sessionStorage
            </span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">
              Deployment:
            </span>{" "}
            <span className="text-zinc-700 dark:text-zinc-300">
              Vercel (web), Render (API)
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Production links</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <span className="text-zinc-500 dark:text-zinc-400">App:</span>{" "}
            <a
              href="https://lets-chat-web.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-700 dark:text-zinc-300 hover:underline"
            >
              https://lets-chat-web.vercel.app
            </a>
          </li>
          <li>
            <span className="text-zinc-500 dark:text-zinc-400">API health:</span>{" "}
            <a
              href="https://lets-chat-api-v2.onrender.com/api/v1/health"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-700 dark:text-zinc-300 hover:underline"
            >
              /health
            </a>
          </li>
          <li>
            <span className="text-zinc-500 dark:text-zinc-400">
              API docs (Swagger):
            </span>{" "}
            <a
              href="https://lets-chat-api-v2.onrender.com/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-700 dark:text-zinc-300 hover:underline"
            >
              /docs
            </a>
          </li>
          <li>
            <span className="text-zinc-500 dark:text-zinc-400">Source:</span>{" "}
            <a
              href="https://github.com/Mellowin/lets-chat-modern-rebuild"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-700 dark:text-zinc-300 hover:underline"
            >
              GitHub
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
