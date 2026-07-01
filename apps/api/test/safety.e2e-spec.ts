import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { StorageService } from './../src/storage/storage.service';
import { PrismaService } from '@lets-chat/database';
import { TokenService } from './../src/auth/token.service';

interface BlockedUserResponse {
  id: string;
  blockedUserId: string;
  username: string;
  displayName: string | null;
  reason: string | null;
}

interface DirectConversationResponse {
  id: string;
  otherParticipant: {
    id: string;
    username: string;
  } | null;
}

interface GroupSummaryResponse {
  id: string;
  name: string;
  memberCount: number;
  members: Array<{ id: string; role: 'OWNER' | 'MEMBER' }>;
}

describe('Safety E2E', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokenService: TokenService;

  let userA: { id: string; email: string; username: string };
  let userB: { id: string; email: string; username: string };
  let userC: { id: string; email: string; username: string };
  let userAdmin: { id: string; email: string; username: string };
  let tokenA: string;
  let tokenB: string;
  let tokenAdmin: string;

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
            email: `e2e-safety-${suffix}@example.com`,
            username: `e2esafety${suffix}`,
            passwordHash: 'hashedpassword',
          },
        }),
      ),
    );

    userAdmin = await prisma.user.create({
      data: {
        email: 'e2e-safety-admin@example.com',
        username: 'e2esafetyadmin',
        passwordHash: 'hashedpassword',
        role: 'ADMIN',
      },
    });

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
    tokenAdmin = await tokenService.signAccessToken({
      sub: userAdmin.id,
      email: userAdmin.email,
      jti: 'jti-admin',
    });
  });

  afterAll(async () => {
    await prisma.userReport.deleteMany({
      where: {
        OR: [
          { reporterId: { in: [userA.id, userB.id, userC.id] } },
          { reportedUserId: { in: [userA.id, userB.id, userC.id] } },
        ],
      },
    });
    await prisma.userBlock.deleteMany({
      where: {
        OR: [
          { blockerId: { in: [userA.id, userB.id, userC.id] } },
          { blockedId: { in: [userA.id, userB.id, userC.id] } },
        ],
      },
    });
    await prisma.groupConversation.deleteMany({
      where: { createdById: { in: [userA.id, userB.id, userC.id] } },
    });
    await prisma.directConversation.deleteMany({
      where: {
        participants: {
          some: {
            userId: { in: [userA.id, userB.id, userC.id] },
          },
        },
      },
    });
    await prisma.userContact.deleteMany({
      where: {
        OR: [
          { ownerUserId: { in: [userA.id, userB.id, userC.id] } },
          { contactUserId: { in: [userA.id, userB.id, userC.id] } },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id, userC.id, userAdmin.id] } },
    });
    await app.close();
  });

  describe('blocks', () => {
    it('blocks a user and lists the block', async () => {
      await request(app.getHttpServer())
        .post('/blocks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id, reason: 'Spam' })
        .expect(201)
        .then((res) => {
          const body = res.body as BlockedUserResponse;
          expect(body.blockedUserId).toBe(userB.id);
          expect(body.username).toBe(userB.username);
          expect(body.reason).toBe('Spam');
        });

      return request(app.getHttpServer())
        .get('/blocks')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .then((res) => {
          const body = res.body as BlockedUserResponse[];
          expect(body.length).toBe(1);
          expect(body[0].blockedUserId).toBe(userB.id);
        });
    });

    it('blocking the same user again is idempotent', async () => {
      return request(app.getHttpServer())
        .post('/blocks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id })
        .expect(201)
        .then((res) => {
          const body = res.body as BlockedUserResponse;
          expect(body.blockedUserId).toBe(userB.id);
        });
    });

    it('rejects self-block', async () => {
      return request(app.getHttpServer())
        .post('/blocks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userA.id })
        .expect(400);
    });

    it('unblocks a user', async () => {
      await request(app.getHttpServer())
        .delete(`/blocks/${userB.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      return request(app.getHttpServer())
        .get('/blocks')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .then((res) => {
          const body = res.body as BlockedUserResponse[];
          expect(body.length).toBe(0);
        });
    });

    it('returns 404 when unblocking a non-existent block', async () => {
      return request(app.getHttpServer())
        .delete(`/blocks/${userC.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });

  describe('block enforcement', () => {
    beforeEach(async () => {
      await prisma.userBlock.deleteMany({
        where: {
          OR: [
            { blockerId: { in: [userA.id, userB.id, userC.id] } },
            { blockedId: { in: [userA.id, userB.id, userC.id] } },
          ],
        },
      });
      await prisma.userContact.deleteMany({
        where: {
          OR: [
            { ownerUserId: { in: [userA.id, userB.id, userC.id] } },
            { contactUserId: { in: [userA.id, userB.id, userC.id] } },
          ],
        },
      });
      await prisma.directConversation.deleteMany({
        where: {
          participants: {
            some: {
              userId: { in: [userA.id, userB.id, userC.id] },
            },
          },
        },
      });
      await prisma.groupConversation.deleteMany({
        where: { createdById: { in: [userA.id, userB.id, userC.id] } },
      });
    });

    it('blocks new direct conversations in either direction', async () => {
      await request(app.getHttpServer())
        .post('/blocks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id })
        .expect(201);

      await request(app.getHttpServer())
        .post('/direct-conversations')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ userId: userA.id })
        .expect(403);

      return request(app.getHttpServer())
        .post('/direct-conversations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id })
        .expect(403);
    });

    it('blocks sending messages in an existing direct conversation', async () => {
      const conversation = await request(app.getHttpServer())
        .post('/direct-conversations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id })
        .expect(201)
        .then((res) => (res.body as DirectConversationResponse).id);

      await request(app.getHttpServer())
        .post('/blocks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id })
        .expect(201);

      return request(app.getHttpServer())
        .post(`/direct-conversations/${conversation}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ content: 'hello' })
        .expect(403);
    });

    it('blocks adding a contact in either direction', async () => {
      await request(app.getHttpServer())
        .post('/blocks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id })
        .expect(201);

      await request(app.getHttpServer())
        .post('/contacts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id })
        .expect(403);

      return request(app.getHttpServer())
        .post('/contacts')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ userId: userA.id })
        .expect(403);
    });

    it('blocks targeted group member add in either direction', async () => {
      const group = await request(app.getHttpServer())
        .post('/groups')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Safety Group', memberIds: [userC.id] })
        .expect(201)
        .then((res) => res.body as GroupSummaryResponse);

      await request(app.getHttpServer())
        .post('/blocks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/groups/${group.id}/members`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id })
        .expect(403);

      await prisma.userBlock.deleteMany({
        where: { blockerId: userA.id, blockedId: userB.id },
      });

      await request(app.getHttpServer())
        .post('/blocks')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ userId: userA.id })
        .expect(201);

      return request(app.getHttpServer())
        .post(`/groups/${group.id}/members`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id })
        .expect(403);
    });
  });

  describe('reports', () => {
    beforeEach(async () => {
      await prisma.userReport.deleteMany({
        where: {
          OR: [
            {
              reporterId: { in: [userA.id, userB.id, userC.id, userAdmin.id] },
            },
            {
              reportedUserId: {
                in: [userA.id, userB.id, userC.id, userAdmin.id],
              },
            },
          ],
        },
      });
    });

    it('creates a report', async () => {
      return request(app.getHttpServer())
        .post('/reports')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          reportedUserId: userB.id,
          reason: 'harassment',
          details: 'Offensive messages',
        })
        .expect(201);
    });

    it('rejects self-report', async () => {
      return request(app.getHttpServer())
        .post('/reports')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reportedUserId: userA.id, reason: 'spam' })
        .expect(400);
    });

    it('rejects a report without a reason', async () => {
      return request(app.getHttpServer())
        .post('/reports')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reportedUserId: userB.id })
        .expect(400);
    });
  });

  describe('admin reports', () => {
    beforeEach(async () => {
      await prisma.userReport.deleteMany({
        where: {
          OR: [
            {
              reporterId: { in: [userA.id, userB.id, userC.id, userAdmin.id] },
            },
            {
              reportedUserId: {
                in: [userA.id, userB.id, userC.id, userAdmin.id],
              },
            },
          ],
        },
      });
    });

    it('regular user cannot access admin report endpoints', async () => {
      await request(app.getHttpServer())
        .get('/admin/reports')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);

      return request(app.getHttpServer())
        .patch(`/admin/reports/${userA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'REVIEWED' })
        .expect(403);
    });

    it('admin can list, filter, view and update reports', async () => {
      await request(app.getHttpServer())
        .post('/reports')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reportedUserId: userB.id, reason: 'spam' })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get('/admin/reports')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200)
        .then(
          (res) =>
            res.body as {
              items: Array<{
                id: string;
                status: string;
                reporter: { id: string };
                reportedUser: { id: string };
              }>;
              nextCursor: string | null;
            },
        );

      expect(list.items.length).toBeGreaterThanOrEqual(1);
      const report = list.items[0];
      expect(report.status).toBe('OPEN');
      expect(report.reporter.id).toBe(userA.id);
      expect(report.reportedUser.id).toBe(userB.id);

      const filtered = await request(app.getHttpServer())
        .get('/admin/reports?status=DISMISSED')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200)
        .then((res) => res.body as typeof list);
      expect(filtered.items).toHaveLength(0);

      const detail = await request(app.getHttpServer())
        .get(`/admin/reports/${report.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200)
        .then((res) => res.body as typeof report);
      expect(detail.id).toBe(report.id);

      const updated = await request(app.getHttpServer())
        .patch(`/admin/reports/${report.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ status: 'REVIEWED', adminNote: 'Reviewed by admin' })
        .expect(200)
        .then(
          (res) =>
            res.body as {
              status: string;
              adminNote: string | null;
              reviewedAt: string;
              reviewedBy: string;
            },
        );
      expect(updated.status).toBe('REVIEWED');
      expect(updated.adminNote).toBe('Reviewed by admin');
      expect(updated.reviewedAt).toBeDefined();
      expect(updated.reviewedBy).toBe(userAdmin.id);

      const listAfter = await request(app.getHttpServer())
        .get('/admin/reports?status=REVIEWED')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200)
        .then((res) => res.body as typeof list);
      expect(listAfter.items.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects invalid status updates', async () => {
      const report = await prisma.userReport.create({
        data: {
          reporterId: userA.id,
          reportedUserId: userB.id,
          reason: 'test',
        },
      });

      return request(app.getHttpServer())
        .patch(`/admin/reports/${report.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ status: 'INVALID_STATUS' })
        .expect(400);
    });

    it('does not expose passwordHash or tokens in report detail', async () => {
      const report = await prisma.userReport.create({
        data: {
          reporterId: userA.id,
          reportedUserId: userB.id,
          reason: 'test',
        },
      });

      const detail = await request(app.getHttpServer())
        .get(`/admin/reports/${report.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200)
        .then((res) => res.body as Record<string, unknown>);

      const text = JSON.stringify(detail);
      expect(text).not.toContain('passwordHash');
      expect(text).not.toContain('refreshToken');
      expect(text).not.toContain('emailVerificationTokenHash');
    });
  });
});
