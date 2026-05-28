import Image from "next/image";

export interface MessageAuthorProps {
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export function MessageAuthor({ author }: MessageAuthorProps) {
  const name = author.displayName || author.username || "Unknown user";
  const initials = (author.displayName || author.username || "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-8 w-8 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
        {author.avatarUrl ? (
          <Image fill className="object-cover" sizes="32px" src={author.avatarUrl} alt="" unoptimized />
        ) : (
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{initials}</span>
        )}
      </div>
      <span className="text-sm font-semibold">{name}</span>
    </div>
  );
}
