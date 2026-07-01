export interface Mention {
  userId: string;
  username: string;
}

const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g;

/**
 * Extract all `@username` mentions from a message content string.
 * Usernames may contain letters, numbers, and underscores.
 */
export function extractMentions(content: string): string[] {
  const usernames = new Set<string>();
  let match: RegExpExecArray | null;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    usernames.add(match[1]);
  }
  return Array.from(usernames);
}

export function buildMentions(
  usernameToUserId: Map<string, string>,
  usernames: string[],
): Mention[] {
  const mentions: Mention[] = [];
  const seen = new Set<string>();
  for (const username of usernames) {
    const userId = usernameToUserId.get(username);
    if (userId && !seen.has(userId)) {
      seen.add(userId);
      mentions.push({ userId, username });
    }
  }
  return mentions;
}
