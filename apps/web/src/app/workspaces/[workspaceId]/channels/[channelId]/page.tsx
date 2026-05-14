"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getChannel, type Channel } from "@/lib/channels-api";
import { getMessages, createMessage, type Message, type CreateMessageInput } from "@/lib/messages-api";

type ChannelState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Channel }
  | { kind: "error"; message: string };

type MessagesState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: Message[] }
  | { kind: "error"; message: string };

export default function ChannelDetailPage() {
  const params = useParams();
  const workspaceId =
    typeof params.workspaceId === "string" ? params.workspaceId : "";
  const channelId =
    typeof params.channelId === "string" ? params.channelId : "";
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [channel, setChannel] = useState<ChannelState>({ kind: "idle" });
  const [messages, setMessages] = useState<MessagesState>({ kind: "idle" });
  const [content, setContent] = useState("");
  const [sendState, setSendState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    if (!isAuthenticated || !workspaceId || !channelId) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;
    async function load(t: string, ws: string, ch: string) {
      setChannel({ kind: "loading" });
      setMessages({ kind: "loading" });
      try {
        const [chData, msgData] = await Promise.all([
          getChannel(t, ws, ch),
          getMessages(t, ws, ch),
        ]);
        if (!cancelled) {
          setChannel({ kind: "success", data: chData });
          setMessages({ kind: "success", data: msgData });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load channel";
        if (!cancelled) {
          setChannel({ kind: "error", message });
          setMessages({ kind: "error", message });
        }
      }
    }
    load(token, workspaceId, channelId);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, workspaceId, channelId]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setSendState({ kind: "error", message: "Message cannot be empty" });
      return;
    }
    if (trimmed.length > 4000) {
      setSendState({ kind: "error", message: "Message is too long (max 4000 characters)" });
      return;
    }
    const token = localStorage.getItem("accessToken");
    if (!token || !workspaceId || !channelId) return;

    setSendState({ kind: "loading" });
    try {
      const input: CreateMessageInput = { content: trimmed };
      await createMessage(token, workspaceId, channelId, input);
      setContent("");
      setSendState({ kind: "idle" });
      // refresh messages
      const refreshed = await getMessages(token, workspaceId, channelId);
      setMessages({ kind: "success", data: refreshed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      setSendState({ kind: "error", message });
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          Loading session…
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Authentication required</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Please sign in to view this channel.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-6 sm:p-10 max-w-3xl">
      <Link
        href={`/workspaces/${workspaceId}`}
        className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        ← Back to workspace
      </Link>

      {channel.kind === "loading" && (
        <div className="mt-6 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          Loading channel…
        </div>
      )}

      {channel.kind === "error" && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/30">
          <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {channel.message}
          </div>
        </div>
      )}

      {channel.kind === "success" && (
        <>
          <div className="mt-6 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {channel.data.name}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                channel.data.type === "PUBLIC"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
              }`}
            >
              {channel.data.type}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {channel.data.slug}
          </p>
          {channel.data.description && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {channel.data.description}
            </p>
          )}
        </>
      )}

      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold">Messages</h2>

        {/* Composer */}
        {channel.kind === "success" && (
          <form onSubmit={handleSendMessage} className="mt-4 flex flex-col gap-2">
            <textarea
              rows={2}
              placeholder="Type a message…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={sendState.kind === "loading"}
              className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100 disabled:opacity-60"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {content.length}/4000
              </span>
              <button
                type="submit"
                disabled={sendState.kind === "loading"}
                className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                {sendState.kind === "loading" ? "Sending…" : "Send"}
              </button>
            </div>
            {sendState.kind === "error" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm dark:border-red-900 dark:bg-red-950/30">
                <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {sendState.message}
                </div>
              </div>
            )}
          </form>
        )}

        {messages.kind === "loading" && (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
            Loading messages…
          </div>
        )}

        {messages.kind === "error" && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {messages.message}
            </div>
          </div>
        )}

        {messages.kind === "success" && messages.data.length === 0 && (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            No messages yet.
          </p>
        )}

        {messages.kind === "success" && messages.data.length > 0 && (
          <ul className="mt-4 space-y-4">
            {messages.data.map((msg) => (
              <li key={msg.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {msg.author.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {msg.author.displayName || msg.author.username}
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {new Date(msg.createdAt).toLocaleString()}
                    </span>
                    {msg.editedAt && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                        edited
                      </span>
                    )}
                    {msg.parentId && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                        reply
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                    {msg.content}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
