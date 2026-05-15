import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { StorageService } from './../src/storage/storage.service';
import { PrismaService } from '@lets-chat/database';
import { TokenService } from './../src/auth/token.service';

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
    await prisma.message.deleteMany({
      where: { channelId: privateChannel.id },
    });
    await prisma.channelMember.deleteMany({
      where: { channelId: privateChannel.id },
    });
    await prisma.channel.deleteMany({
      where: { id: privateChannel.id },
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
        .get(`/workspaces/${workspace.id}/channels/${privateChannel.id}/messages`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('non-member cannot create message in private channel', () => {
      return request(app.getHttpServer())
        .post(`/workspaces/${workspace.id}/channels/${privateChannel.id}/messages`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ content: 'hello' })
        .expect(404);
    });

    it('member can list messages from private channel', () => {
      return request(app.getHttpServer())
        .get(`/workspaces/${workspace.id}/channels/${privateChannel.id}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });

    it('member can create message in private channel', () => {
      return request(app.getHttpServer())
        .post(`/workspaces/${workspace.id}/channels/${privateChannel.id}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ content: 'hello from member' })
        .expect(201);
    });
  });
});
