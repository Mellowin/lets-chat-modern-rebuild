"use client";

import { useMemo } from "react";

export interface MessageContentMention {
  userId: string;
  username: string;
}

export interface MessageContentProps {
  content: string;
  mentions?: MessageContentMention[];
}

export function MessageContent({ content, mentions }: MessageContentProps) {
  const allowedUsernames = useMemo(
    () => new Set(mentions?.map((m) => m.username) ?? []),
    [mentions],
  );

  const parts = useMemo(() => {
    const result: React.ReactNode[] = [];
    const regex = /@([a-zA-Z0-9_]+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const [fullMatch, username] = match;
      const start = match.index;

      if (start > lastIndex) {
        result.push(
          <span key={`text-${lastIndex}`}>{content.slice(lastIndex, start)}</span>,
        );
      }

      if (allowedUsernames.has(username)) {
        result.push(
          <span
            key={`mention-${start}`}
            className="rounded bg-primary/10 px-0.5 font-medium text-primary"
            data-testid={`mention-${username}`}
          >
            @{username}
          </span>,
        );
      } else {
        result.push(
          <span key={`text-${start}`}>@{username}</span>,
        );
      }

      lastIndex = start + fullMatch.length;
    }

    if (lastIndex < content.length) {
      result.push(<span key={`text-${lastIndex}`}>{content.slice(lastIndex)}</span>);
    }

    return result;
  }, [content, allowedUsernames]);

  return <span className="break-words">{parts}</span>;
}
