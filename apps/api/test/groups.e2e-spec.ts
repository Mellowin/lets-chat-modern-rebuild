import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { StorageService } from './../src/storage/storage.service';
import { PrismaService } from '@lets-chat/database';
import { TokenService } from './../src/auth/token.service';

interface GroupResponse {
  id: string;
  name: string;
  myRole: string;
}

interface GroupMessageResponse {
  id: string;
  content: string;
}

describe('Groups E2E Security', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokenService: TokenService;

  let userA: { id: string; email: string; username: string };
  let userB: { id: string; email: string; username: string };
  let userC: { id: string; email: string; username: string };
  let group: { id: string };
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;

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
            email: `e2e-group-${suffix}@example.com`,
            username: `e2egroup${suffix}`,
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

    group = await prisma.groupConversation.create({
      data: {
        name: 'E2E Group',
        createdById: userA.id,
        members: {
          create: [
            { userId: userA.id, role: 'OWNER' },
            { userId: userB.id, role: 'MEMBER' },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.groupMessage.deleteMany({
      where: { groupId: group.id },
    });
    await prisma.groupMember.deleteMany({
      where: { groupId: group.id },
    });
    await prisma.groupConversation.delete({
      where: { id: group.id },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [userA.id, userB.id, userC.id] },
      },
    });
    await app.close();
  });

  describe('group access control', () => {
    it('member can get group details', () => {
      return request(app.getHttpServer())
        .get(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .then((res) => {
          const body = res.body as GroupResponse;
          expect(body.name).toBe('E2E Group');
          expect(body.myRole).toBe('OWNER');
        });
    });

    it('non-member gets 404 for group details', () => {
      return request(app.getHttpServer())
        .get(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${tokenC}`)
        .expect(404);
    });

    it('member can list group messages', () => {
      return request(app.getHttpServer())
        .get(`/groups/${group.id}/messages`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
    });

    it('non-member cannot list group messages', () => {
      return request(app.getHttpServer())
        .get(`/groups/${group.id}/messages`)
        .set('Authorization', `Bearer ${tokenC}`)
        .expect(404);
    });

    it('member can send a group message', () => {
      return request(app.getHttpServer())
        .post(`/groups/${group.id}/messages`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ content: 'hello group' })
        .expect(201)
        .then((res) => {
          const body = res.body as GroupMessageResponse;
          expect(body.content).toBe('hello group');
        });
    });

    it('non-member cannot send a group message', () => {
      return request(app.getHttpServer())
        .post(`/groups/${group.id}/messages`)
        .set('Authorization', `Bearer ${tokenC}`)
        .send({ content: 'intruder' })
        .expect(404);
    });
  });

  describe('owner-only actions', () => {
    it('owner can rename group', () => {
      return request(app.getHttpServer())
        .patch(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Renamed E2E Group' })
        .expect(200)
        .then((res) => {
          const body = res.body as GroupResponse;
          expect(body.name).toBe('Renamed E2E Group');
        });
    });

    it('non-owner cannot rename group', () => {
      return request(app.getHttpServer())
        .patch(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Hacked' })
        .expect(403);
    });

    it('owner can add member', () => {
      return request(app.getHttpServer())
        .post(`/groups/${group.id}/members`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userC.id })
        .expect(201);
    });

    it('added member can now access group', () => {
      return request(app.getHttpServer())
        .get(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${tokenC}`)
        .expect(200);
    });

    it('owner can remove member', () => {
      return request(app.getHttpServer())
        .delete(`/groups/${group.id}/members/${userC.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });

    it('removed member loses access', () => {
      return request(app.getHttpServer())
        .get(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${tokenC}`)
        .expect(404);
    });

    it('non-owner cannot add member', () => {
      return request(app.getHttpServer())
        .post(`/groups/${group.id}/members`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ userId: userC.id })
        .expect(403);
    });
  });

  describe('leaving a group', () => {
    it('member can leave group', async () => {
      const leaver = await prisma.user.create({
        data: {
          email: 'e2e-group-leaver@example.com',
          username: 'e2egroupleaver',
          passwordHash: 'hashedpassword',
        },
      });
      await prisma.groupMember.create({
        data: {
          groupId: group.id,
          userId: leaver.id,
          role: 'MEMBER',
        },
      });
      const token = await tokenService.signAccessToken({
        sub: leaver.id,
        email: leaver.email,
        jti: 'jti-leave',
      });

      await request(app.getHttpServer())
        .post(`/groups/${group.id}/leave`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      await request(app.getHttpServer())
        .get(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      await prisma.groupMember.deleteMany({
        where: { groupId: group.id, userId: leaver.id },
      });
      await prisma.user.delete({ where: { id: leaver.id } });
    });

    it('sole owner cannot leave group', () => {
      return request(app.getHttpServer())
        .post(`/groups/${group.id}/leave`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
    });
  });
});
