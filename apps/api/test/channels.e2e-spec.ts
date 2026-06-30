import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { StorageService } from './../src/storage/storage.service';
import { PrismaService } from '@lets-chat/database';
import { TokenService } from './../src/auth/token.service';

interface PaginatedMessageList {
  items: Array<{ id: string; content: string }>;
  nextCursor: string | null;
  hasMore: boolean;
}

describe('Channels E2E Security', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokenService: TokenService;

  let userA: { id: string; email: string; username: string };
  let userB: { id: string; email: string; username: string };
  let workspace: { id: string };
  let privateChannel: { id: string };
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);

    userA = await prisma.user.create({
      data: {
        email: 'e2e-user-a@example.com',
        username: 'e2eusera',
        passwordHash: 'hashedpassword',
      },
    });

    userB = await prisma.user.create({
      data: {
        email: 'e2e-user-b@example.com',
        username: 'e2euserb',
        passwordHash: 'hashedpassword',
      },
    });

    workspace = await prisma.workspace.create({
      data: {
        name: 'E2E Workspace',
        slug: `e2e-workspace-${randomUUID()}`,
        ownerId: userA.id,
        members: {
          create: [
            { userId: userA.id, role: 'OWNER' as const },
            { userId: userB.id, role: 'MEMBER' as const },
          ],
        },
      },
    });

    privateChannel = await prisma.channel.create({
      data: {
        workspaceId: workspace.id,
        name: 'Private Channel',
        slug: `private-channel-${randomUUID()}`,
        type: 'PRIVATE' as const,
        createdById: userA.id,
        members: {
          create: [{ userId: userA.id, role: 'MEMBER' as const }],
        },
      },
    });

    tokenA = await tokenService.signAccessToken({
      sub: userA.id,
      email: userA.email,
      jti: randomUUID(),
    });

    tokenB = await tokenService.signAccessToken({
      sub: userB.id,
      email: userB.email,
      jti: randomUUID(),
    });
  });

  afterAll(async () => {
    // Clean up the whole workspace and its dependent records so the test DB
    // stays tidy and the workspace can be deleted without FK violations.
    const channelIds = (
      await prisma.channel.findMany({
        where: { workspaceId: workspace.id },
        select: { id: true },
      })
    ).map((c) => c.id);

    await prisma.auditLog.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prisma.notification.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prisma.invitation.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prisma.channelInvitation.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prisma.readReceipt.deleteMany({
      where: { channelId: { in: channelIds } },
    });
    await prisma.attachment.deleteMany({
      where: { message: { channelId: { in: channelIds } } },
    });
    await prisma.messageEdit.deleteMany({
      where: { message: { channelId: { in: channelIds } } },
    });
    await prisma.reaction.deleteMany({
      where: { message: { channelId: { in: channelIds } } },
    });
    await prisma.message.deleteMany({
      where: { channelId: { in: channelIds } },
    });
    await prisma.channelReadState.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prisma.channelMember.deleteMany({
      where: { channelId: { in: channelIds } },
    });
    await prisma.channel.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prisma.workspaceMember.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prisma.workspace.deleteMany({
      where: { id: workspace.id },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });

    await app.close();
  });

  describe('private channel access control', () => {
    it('member can access channel detail', () => {
      return request(app.getHttpServer())
        .get(`/workspaces/${workspace.id}/channels/${privateChannel.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });

    it('non-member cannot access channel detail', () => {
      return request(app.getHttpServer())
        .get(`/workspaces/${workspace.id}/channels/${privateChannel.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('non-member cannot list messages from private channel', () => {
      return request(app.getHttpServer())
        .get(
          `/workspaces/${workspace.id}/channels/${privateChannel.id}/messages`,
        )
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('non-member cannot create message in private channel', () => {
      return request(app.getHttpServer())
        .post(
          `/workspaces/${workspace.id}/channels/${privateChannel.id}/messages`,
        )
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ content: 'hello' })
        .expect(404);
    });

    it('member can list messages from private channel', () => {
      return request(app.getHttpServer())
        .get(
          `/workspaces/${workspace.id}/channels/${privateChannel.id}/messages`,
        )
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });

    it('member can create message in private channel', () => {
      return request(app.getHttpServer())
        .post(
          `/workspaces/${workspace.id}/channels/${privateChannel.id}/messages`,
        )
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ content: 'hello from member' })
        .expect(201);
    });

    it('lists messages in paginated shape', async () => {
      await prisma.message.create({
        data: {
          channelId: privateChannel.id,
          authorId: userA.id,
          content: 'paginated message',
        },
      });

      await request(app.getHttpServer())
        .get(
          `/workspaces/${workspace.id}/channels/${privateChannel.id}/messages`,
        )
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as {
            items: Array<{ id: string; content: string }>;
            nextCursor: string | null;
            hasMore: boolean;
          };
          expect(Array.isArray(body.items)).toBe(true);
          expect(typeof body.hasMore).toBe('boolean');
          expect(
            body.nextCursor === null || typeof body.nextCursor === 'string',
          ).toBe(true);
        });
    });
  });

  describe('message list cursor pagination', () => {
    let paginationChannel: { id: string };

    beforeAll(async () => {
      paginationChannel = await prisma.channel.create({
        data: {
          workspaceId: workspace.id,
          name: 'Pagination Channel',
          slug: `pagination-channel-${randomUUID()}`,
          type: 'PUBLIC' as const,
          createdById: userA.id,
          members: {
            create: [{ userId: userA.id, role: 'MEMBER' as const }],
          },
        },
      });
    });

    it('returns the most recent page and cursors to older messages', async () => {
      await prisma.message.createMany({
        data: [
          {
            channelId: paginationChannel.id,
            authorId: userA.id,
            content: 'msg-1-oldest',
            createdAt: new Date('2026-06-30T10:00:00.000Z'),
          },
          {
            channelId: paginationChannel.id,
            authorId: userA.id,
            content: 'msg-2',
            createdAt: new Date('2026-06-30T10:01:00.000Z'),
          },
          {
            channelId: paginationChannel.id,
            authorId: userA.id,
            content: 'msg-3',
            createdAt: new Date('2026-06-30T10:02:00.000Z'),
          },
          {
            channelId: paginationChannel.id,
            authorId: userA.id,
            content: 'msg-4',
            createdAt: new Date('2026-06-30T10:03:00.000Z'),
          },
          {
            channelId: paginationChannel.id,
            authorId: userA.id,
            content: 'msg-5-newest',
            createdAt: new Date('2026-06-30T10:04:00.000Z'),
          },
        ],
      });

      const first = await request(app.getHttpServer())
        .get(
          `/workspaces/${workspace.id}/channels/${paginationChannel.id}/messages?limit=2`,
        )
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const firstBody = first.body as PaginatedMessageList;

      expect(firstBody.items).toHaveLength(2);
      expect(
        firstBody.items.map((m: { content: string }) => m.content),
      ).toEqual(['msg-4', 'msg-5-newest']);
      expect(firstBody.hasMore).toBe(true);
      expect(typeof firstBody.nextCursor).toBe('string');

      const second = await request(app.getHttpServer())
        .get(
          `/workspaces/${workspace.id}/channels/${paginationChannel.id}/messages?limit=2&cursor=${encodeURIComponent(firstBody.nextCursor as string)}`,
        )
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const secondBody = second.body as PaginatedMessageList;

      expect(secondBody.items).toHaveLength(2);
      expect(
        secondBody.items.map((m: { content: string }) => m.content),
      ).toEqual(['msg-2', 'msg-3']);
      expect(secondBody.hasMore).toBe(true);
      expect(typeof secondBody.nextCursor).toBe('string');

      const third = await request(app.getHttpServer())
        .get(
          `/workspaces/${workspace.id}/channels/${paginationChannel.id}/messages?limit=2&cursor=${encodeURIComponent(secondBody.nextCursor as string)}`,
        )
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const thirdBody = third.body as PaginatedMessageList;

      expect(thirdBody.items).toHaveLength(1);
      expect(thirdBody.items[0].content).toBe('msg-1-oldest');
      expect(thirdBody.hasMore).toBe(false);
      expect(thirdBody.nextCursor).toBeNull();
    });
  });

  describe('channel list with unread (regression P0)', () => {
    interface ChannelListItem {
      id: string;
      unreadCount: number;
      hasUnread: boolean;
    }

    it('lists workspace channels when user has no ChannelReadState rows', () => {
      return request(app.getHttpServer())
        .get(`/workspaces/${workspace.id}/channels`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          const list = res.body as ChannelListItem[];
          expect(list.length).toBeGreaterThan(0);
          const ch = list.find(
            (c: ChannelListItem) => c.id === privateChannel.id,
          );
          expect(ch).toBeDefined();
          expect(ch!.unreadCount).toBe(0);
          expect(ch!.hasUnread).toBe(false);
        });
    });

    it('creates a channel successfully', async () => {
      const res = await request(app.getHttpServer())
        .post(`/workspaces/${workspace.id}/channels`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: `New Channel ${randomUUID()}`, type: 'PUBLIC' })
        .expect(201);

      const body = res.body as { id: string; workspaceId: string };
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('workspaceId', workspace.id);

      // Cleanup is handled by afterAll so we don't hit FK violations from
      // ChannelReadState rows created by channel-list endpoints.
    });

    it('lists channels with unread counts after messages exist', async () => {
      await prisma.message.create({
        data: {
          channelId: privateChannel.id,
          authorId: userA.id,
          content: 'test message',
        },
      });

      await request(app.getHttpServer())
        .get(`/workspaces/${workspace.id}/channels`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });
});
