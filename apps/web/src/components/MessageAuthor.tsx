"use client";

import { useLocale } from "@/lib/locale";
import { Avatar } from "@/components/ui/Avatar";

export interface MessageAuthorProps {
  author: {
    id: string;
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
}

export function MessageAuthor({ author }: MessageAuthorProps) {
  const { t } = useLocale();
  const name = author.displayName || author.username || t("messageAuthor.unknownUser");
  const showUsername = author.displayName && author.username;

  return (
    <div className="flex items-center gap-2.5">
      <Avatar
        src={author.avatarUrl}
        name={author.displayName || author.username}
        size="md"
        alt={name}
      />
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-foreground truncate">{name}</span>
        {showUsername && (
          <span className="text-xs text-muted-foreground truncate">@{author.username}</span>
        )}
      </div>
    </div>
  );
}

export default MessageAuthor;
