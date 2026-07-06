import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { StorageService } from './../src/storage/storage.service';
import { PrismaService } from '@lets-chat/database';
import { TokenService } from './../src/auth/token.service';

interface DirectConversationResponse {
  id: string;
}

interface DirectMessageResponse {
  id: string;
  content: string;
}

describe('DirectConversations E2E', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokenService: TokenService;

  let userA: { id: string; email: string; username: string };
  let userB: { id: string; email: string; username: string };
  let userC: { id: string; email: string; username: string };
  let tokenA: string;
  let tokenC: string;
  let conversation: DirectConversationResponse;

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
            email: `e2e-direct-${suffix}@example.com`,
            username: `e2edirect${suffix}`,
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
    tokenC = await tokenService.signAccessToken({
      sub: userC.id,
      email: userC.email,
      jti: 'jti-c',
    });

    conversation = await prisma.directConversation.create({
      data: {
        key: `${userA.id}:${userB.id}`,
        participants: {
          create: [{ userId: userA.id }, { userId: userB.id }],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.directMessage.deleteMany({
      where: { conversationId: conversation.id },
    });
    await prisma.directConversationParticipant.deleteMany({
      where: { conversationId: conversation.id },
    });
    await prisma.directConversation.delete({
      where: { id: conversation.id },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [userA.id, userB.id, userC.id] },
      },
    });
    await app.close();
  });

  describe('message context', () => {
    it('returns target with before and after for a participant', async () => {
      await prisma.directMessage.deleteMany({
        where: { conversationId: conversation.id },
      });
      const messages = await prisma.directMessage.createManyAndReturn({
        data: [
          {
            conversationId: conversation.id,
            authorId: userB.id,
            content: 'ctx-1-oldest',
            createdAt: new Date('2026-07-01T10:00:00.000Z'),
          },
          {
            conversationId: conversation.id,
            authorId: userB.id,
            content: 'ctx-2',
            createdAt: new Date('2026-07-01T10:01:00.000Z'),
          },
          {
            conversationId: conversation.id,
            authorId: userB.id,
            content: 'ctx-3-target',
            createdAt: new Date('2026-07-01T10:02:00.000Z'),
          },
          {
            conversationId: conversation.id,
            authorId: userB.id,
            content: 'ctx-4',
            createdAt: new Date('2026-07-01T10:03:00.000Z'),
          },
          {
            conversationId: conversation.id,
            authorId: userB.id,
            content: 'ctx-5-newest',
            createdAt: new Date('2026-07-01T10:04:00.000Z'),
          },
        ],
      });
      const target = messages.find((m) => m.content === 'ctx-3-target');
      expect(target).toBeDefined();

      const res = await request(app.getHttpServer())
        .get(
          `/direct-conversations/${conversation.id}/messages/${target!.id}/context?before=1&after=1`,
        )
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const body = res.body as {
        target: { id: string; content: string };
        before: Array<{ content: string }>;
        after: Array<{ content: string }>;
        hasMoreBefore: boolean;
        hasMoreAfter: boolean;
      };
      expect(body.target.content).toBe('ctx-3-target');
      expect(body.before.map((m) => m.content)).toEqual(['ctx-2']);
      expect(body.after.map((m) => m.content)).toEqual(['ctx-4']);
      expect(body.hasMoreBefore).toBe(true);
      expect(body.hasMoreAfter).toBe(true);
    });

    it('non-participant cannot access message context', async () => {
      const msg = await prisma.directMessage.create({
        data: {
          conversationId: conversation.id,
          authorId: userB.id,
          content: 'secret',
        },
      });
      await request(app.getHttpServer())
        .get(
          `/direct-conversations/${conversation.id}/messages/${msg.id}/context`,
        )
        .set('Authorization', `Bearer ${tokenC}`)
        .expect(403);
    });
  });

  describe('access control', () => {
    it('participant can send a direct message', () => {
      return request(app.getHttpServer())
        .post(`/direct-conversations/${conversation.id}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ content: 'hello' })
        .expect(201)
        .then((res) => {
          const body = res.body as DirectMessageResponse;
          expect(body.content).toBe('hello');
        });
    });

    it('non-participant cannot send a direct message', () => {
      return request(app.getHttpServer())
        .post(`/direct-conversations/${conversation.id}/messages`)
        .set('Authorization', `Bearer ${tokenC}`)
        .send({ content: 'intruder' })
        .expect(403);
    });
  });
});
