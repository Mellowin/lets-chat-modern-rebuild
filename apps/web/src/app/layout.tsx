import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "lets-chat — Modern Rebuild",
  description: "Secure team collaboration platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {/* Top bar */}
        <header className="flex items-center h-14 px-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-zinc-900 dark:bg-zinc-100" />
            <span className="font-semibold text-sm tracking-tight">
              lets-chat
            </span>
          </div>
        </header>

        {/* Body: sidebar + main */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar placeholder */}
          <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hidden sm:flex flex-col p-3">
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider px-2 py-1">
              Workspace
            </div>
            <div className="mt-2 rounded-md bg-zinc-200/60 dark:bg-zinc-800/60 h-8" />
            <div className="mt-1 rounded-md bg-zinc-200/60 dark:bg-zinc-800/60 h-8" />
            <div className="mt-6 text-xs font-medium text-zinc-400 uppercase tracking-wider px-2 py-1">
              Channels
            </div>
            <div className="mt-2 rounded-md bg-zinc-200/60 dark:bg-zinc-800/60 h-8" />
            <div className="mt-1 rounded-md bg-zinc-200/60 dark:bg-zinc-800/60 h-8" />
            <div className="mt-1 rounded-md bg-zinc-200/60 dark:bg-zinc-800/60 h-8" />
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
