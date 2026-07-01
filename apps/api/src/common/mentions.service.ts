import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { extractMentions, buildMentions, Mention } from './mentions';

@Injectable()
export class MentionsService {
  constructor(private readonly users: UsersRepository) {}

  /**
   * Extract `@username` mentions from content, keep only those whose userId
   * is present in the allowed set, and return stable mention metadata.
   *
   * Invalid or inaccessible usernames are silently ignored so they never
   * leak user existence.
   */
  async resolveMentions(
    content: string,
    allowedUserIds: Set<string>,
  ): Promise<Mention[]> {
    const usernames = extractMentions(content);
    if (usernames.length === 0) return [];

    const users = await this.users.findByUsernames(usernames);
    const map = new Map<string, string>();
    for (const user of users) {
      if (allowedUserIds.has(user.id)) {
        map.set(user.username, user.id);
      }
    }

    return buildMentions(map, usernames);
  }
}
