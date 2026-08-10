/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { UsersRepository } from './users.repository';

describe('UsersRepository discovery filtering', () => {
  const activeUsers = [
    {
      id: 'a1',
      username: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      avatarUrl: null,
      contactPrivacySetting: 'EVERYONE',
      status: 'ACTIVE',
    },
    {
      id: 'b1',
      username: 'bob',
      email: 'bob@example.com',
      displayName: 'Bob',
      avatarUrl: null,
      contactPrivacySetting: 'EVERYONE',
      status: 'ACTIVE',
    },
  ];

  function createMockPrisma(users: any[]) {
    return {
      user: {
        findMany: jest.fn().mockResolvedValue(users),
      },
    } as any;
  }

  describe('search', () => {
    it('filters out PENDING_DELETION users', async () => {
      const pending = {
        ...activeUsers[0],
        id: 'p1',
        status: 'PENDING_DELETION',
      };
      const prisma = createMockPrisma([activeUsers[1], pending]);
      const repo = new UsersRepository(prisma);

      await repo.search('ali', 'exclude');

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('ACTIVE');
    });

    it('filters out ANONYMIZED users', async () => {
      const anonymized = { ...activeUsers[0], id: 'n1', status: 'ANONYMIZED' };
      const prisma = createMockPrisma([activeUsers[1], anonymized]);
      const repo = new UsersRepository(prisma);

      await repo.search('ali', 'exclude');

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('ACTIVE');
    });
  });

  describe('findByUsernames', () => {
    it('only resolves ACTIVE users for mentions/autocomplete', async () => {
      const prisma = createMockPrisma([activeUsers[0]]);
      const repo = new UsersRepository(prisma);

      await repo.findByUsernames(['alice']);

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('ACTIVE');
    });
  });
});
