import {
  encodeMessageCursor,
  decodeMessageCursor,
  buildMessageCursorWhereClause,
} from './cursor-pagination';

describe('cursor-pagination', () => {
  describe('encodeMessageCursor', () => {
    it('encodes createdAt and id separated by a colon', () => {
      const cursor = encodeMessageCursor({
        createdAt: new Date('2026-06-30T12:00:00.000Z'),
        id: 'msg-id',
      });
      expect(cursor).toBe('2026-06-30T12:00:00.000Z:msg-id');
    });
  });

  describe('decodeMessageCursor', () => {
    it('decodes a valid cursor', () => {
      const cursor = decodeMessageCursor('2026-06-30T12:00:00.000Z:msg-id');
      expect(cursor).toEqual({
        createdAt: new Date('2026-06-30T12:00:00.000Z'),
        id: 'msg-id',
      });
    });

    it('returns undefined for an empty cursor', () => {
      expect(decodeMessageCursor(undefined)).toBeUndefined();
      expect(decodeMessageCursor('')).toBeUndefined();
    });

    it('returns undefined when the cursor has no colon', () => {
      expect(decodeMessageCursor('invalid')).toBeUndefined();
    });

    it('returns undefined when the date portion is invalid', () => {
      expect(decodeMessageCursor('not-a-date:msg-id')).toBeUndefined();
    });

    it('returns undefined when the id portion is empty', () => {
      expect(decodeMessageCursor('2026-06-30T12:00:00.000Z:')).toBeUndefined();
    });
  });

  describe('buildMessageCursorWhereClause', () => {
    it('builds a stable OR clause for createdAt and id', () => {
      const cursor = {
        createdAt: new Date('2026-06-30T12:00:00.000Z'),
        id: 'msg-id',
      };
      expect(buildMessageCursorWhereClause(cursor)).toEqual([
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ]);
    });
  });
});
