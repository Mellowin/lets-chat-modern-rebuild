export interface MessageCursor {
  createdAt: Date;
  id: string;
}

export function encodeMessageCursor(message: {
  createdAt: Date;
  id: string;
}): string {
  return `${message.createdAt.toISOString()}:${message.id}`;
}

export function decodeMessageCursor(
  cursor: string | undefined,
): MessageCursor | undefined {
  if (!cursor) return undefined;
  const separatorIndex = cursor.lastIndexOf(':');
  if (separatorIndex === -1) return undefined;

  const createdAtString = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 1);
  const createdAt = new Date(createdAtString);

  if (Number.isNaN(createdAt.getTime())) return undefined;
  if (!id) return undefined;

  return { createdAt, id };
}

export function buildMessageCursorWhereClause(
  cursor: MessageCursor,
): Array<Record<string, unknown>> {
  return [
    { createdAt: { lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
  ];
}
