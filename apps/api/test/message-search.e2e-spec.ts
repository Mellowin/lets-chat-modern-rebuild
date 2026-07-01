import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { StorageService } from './../src/storage/storage.service';
import { PrismaService } from '@lets-chat/database';
import { TokenService } from './../src/auth/token.service';

interface SearchResponseBody {
  items: Array<{
    source: {
      type: string;
      channelId?: string;
      conversationId?: string;
      groupId?: string;
    };
  }>;
}

describe('MessageSearch E2E', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokenService: TokenService;

  let userA: { id: string; email: string; username: string };
  let userB: { id: string; email: string; username: string };
  let userC: { id: string; email: string; username: string };
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;

  let workspace: { id: string };
  let publicChannel: { id: string };
  let privateChannel: { id: string };
  let directConversation: { id: string };
  let group: { id: string };

  const sharedQuery = 'B219-search-token';

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

    [userA, userB, userC] = await Promise.all(
      ['a', 'b', 'c'].map((suffix) =>
        prisma.user.create({
          data: {
            email: `e2e-search-${suffix}@example.com`,
            username: `e2esearch${suffix}`,
            passwordHash: 'hashedpassword',
          },
        }),
      ),
    );

    tokenA = await tokenService.signAccessToken({
      sub: userA.id,
      email: userA.email,
      jti: 'jti-a',
    });
    tokenB = await tokenService.signAccessToken({
      sub: userB.id,
      email: userB.email,
      jti: 'jti-b',
    });
    tokenC = await tokenService.signAccessToken({
      sub: userC.id,
      email: userC.email,
      jti: 'jti-c',
    });

    workspace = await prisma.workspace.create({
      data: {
        name: 'E2E Search Workspace',
        slug: 'e2e-search-workspace',
        ownerId: userA.id,
        members: {
          create: [
            { userId: userA.id, role: 'OWNER' },
            { userId: userB.id, role: 'MEMBER' },
          ],
        },
      },
    });

    publicChannel = await prisma.channel.create({
      data: {
        workspaceId: workspace.id,
        name: 'public',
        slug: 'public',
        type: 'PUBLIC',
        createdById: userA.id,
        members: {
          create: [
            { userId: userA.id, role: 'OWNER' },
            { userId: userB.id, role: 'MEMBER' },
          ],
        },
      },
    });

    privateChannel = await prisma.channel.create({
      data: {
        workspaceId: workspace.id,
        name: 'private',
        slug: 'private',
        type: 'PRIVATE',
        createdById: userA.id,
        members: {
          create: [{ userId: userA.id, role: 'OWNER' }],
        },
      },
    });

    directConversation = await prisma.directConversation.create({
      data: {
        key: `e2e-search-dm-${userA.id}-${userB.id}`,
        participants: {
          create: [{ userId: userA.id }, { userId: userB.id }],
        },
      },
    });

    group = await prisma.groupConversation.create({
      data: {
        name: 'E2E Search Group',
        createdById: userA.id,
        members: {
          create: [
            { userId: userA.id, role: 'OWNER' },
            { userId: userB.id, role: 'MEMBER' },
          ],
        },
      },
    });

    await prisma.message.createMany({
      data: [
        {
          channelId: publicChannel.id,
          authorId: userA.id,
          content: sharedQuery,
        },
        {
          channelId: privateChannel.id,
          authorId: userA.id,
          content: sharedQuery,
        },
      ],
    });

    await prisma.directMessage.createMany({
      data: [
        {
          conversationId: directConversation.id,
          authorId: userA.id,
          content: sharedQuery,
        },
      ],
    });

    await prisma.groupMessage.createMany({
      data: [
        {
          groupId: group.id,
          authorId: userA.id,
          content: sharedQuery,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({
      where: { channelId: { in: [publicChannel.id, privateChannel.id] } },
    });
    await prisma.directMessage.deleteMany({
      where: { conversationId: directConversation.id },
    });
    await prisma.groupMessage.deleteMany({ where: { groupId: group.id } });
    await prisma.channelMember.deleteMany({
      where: {
        channelId: { in: [publicChannel.id, privateChannel.id] },
      },
    });
    await prisma.channel.deleteMany({
      where: { id: { in: [publicChannel.id, privateChannel.id] } },
    });
    await prisma.workspaceMember.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.directConversationParticipant.deleteMany({
      where: { conversationId: directConversation.id },
    });
    await prisma.directConversation.delete({
      where: { id: directConversation.id },
    });
    await prisma.groupMember.deleteMany({ where: { groupId: group.id } });
    await prisma.groupConversation.delete({ where: { id: group.id } });
    await prisma.userBlock.deleteMany({
      where: {
        OR: [
          { blockerId: userB.id, blockedId: userA.id },
          { blockerId: userA.id, blockedId: userB.id },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id, userC.id] } },
    });
    await app.close();
  });

  it('returns channel, direct and group results for global search', async () => {
    const res = await request(app.getHttpServer())
      .get(`/search/messages?q=${encodeURIComponent(sharedQuery)}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const sources = (res.body as SearchResponseBody).items.map(
      (item) => item.source.type,
    );
    expect(sources).toContain('CHANNEL');
    expect(sources).toContain('DIRECT');
    expect(sources).toContain('GROUP');
  });

  it('also works on legacy /me/search/messages route', async () => {
    const res = await request(app.getHttpServer())
      .get(`/me/search/messages?q=${encodeURIComponent(sharedQuery)}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const sources = (res.body as SearchResponseBody).items.map(
      (item) => item.source.type,
    );
    expect(sources).toContain('GROUP');
  });

  it('filters by scope=group', async () => {
    const res = await request(app.getHttpServer())
      .get(`/search/messages?q=${encodeURIComponent(sharedQuery)}&scope=group`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const sources = (res.body as SearchResponseBody).items.map(
      (item) => item.source.type,
    );
    expect(sources).toEqual(['GROUP']);
  });

  it('filters by scope=channel and workspaceId', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/search/messages?q=${encodeURIComponent(sharedQuery)}&scope=channel&workspaceId=${workspace.id}`,
      )
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const sources = (res.body as SearchResponseBody).items.map(
      (item) => item.source.type,
    );
    expect(sources).toEqual(['CHANNEL', 'CHANNEL']);
  });

  it('filters by channelId', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/search/messages?q=${encodeURIComponent(sharedQuery)}&channelId=${publicChannel.id}`,
      )
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const items = (res.body as SearchResponseBody).items;
    expect(items).toHaveLength(1);
    expect(items[0].source.type).toBe('CHANNEL');
    expect(items[0].source.channelId).toBe(publicChannel.id);
  });

  it('filters by conversationId', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/search/messages?q=${encodeURIComponent(sharedQuery)}&conversationId=${directConversation.id}`,
      )
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const sources = (res.body as SearchResponseBody).items.map(
      (item) => item.source.type,
    );
    expect(sources).toEqual(['DIRECT']);
  });

  it('filters by groupId', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/search/messages?q=${encodeURIComponent(sharedQuery)}&groupId=${group.id}`,
      )
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const sources = (res.body as SearchResponseBody).items.map(
      (item) => item.source.type,
    );
    expect(sources).toEqual(['GROUP']);
  });

  it('excludes private channel results for non-members', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/search/messages?q=${encodeURIComponent(sharedQuery)}&scope=channel`,
      )
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const items = (res.body as SearchResponseBody).items;
    expect(items).toHaveLength(1);
    expect(items[0].source.type).toBe('CHANNEL');
    expect(items[0].source.channelId).toBe(publicChannel.id);
  });

  it('excludes group results for non-members', async () => {
    const res = await request(app.getHttpServer())
      .get(`/search/messages?q=${encodeURIComponent(sharedQuery)}&scope=group`)
      .set('Authorization', `Bearer ${tokenC}`)
      .expect(200);

    expect((res.body as SearchResponseBody).items).toEqual([]);
  });

  it('excludes direct messages from blocked users', async () => {
    await prisma.userBlock.create({
      data: { blockerId: userB.id, blockedId: userA.id },
    });

    const res = await request(app.getHttpServer())
      .get(`/search/messages?q=${encodeURIComponent(sharedQuery)}&scope=direct`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect((res.body as SearchResponseBody).items).toEqual([]);

    await prisma.userBlock.deleteMany({
      where: { blockerId: userB.id, blockedId: userA.id },
    });
  });

  it('excludes group messages from blocked users', async () => {
    await prisma.userBlock.create({
      data: { blockerId: userB.id, blockedId: userA.id },
    });

    const res = await request(app.getHttpServer())
      .get(`/search/messages?q=${encodeURIComponent(sharedQuery)}&scope=group`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect((res.body as SearchResponseBody).items).toEqual([]);

    await prisma.userBlock.deleteMany({
      where: { blockerId: userB.id, blockedId: userA.id },
    });
  });
});
