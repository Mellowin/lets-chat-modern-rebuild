import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { StorageService } from './../src/storage/storage.service';
import { PrismaService } from '@lets-chat/database';
import { TokenService } from './../src/auth/token.service';

interface InviteCreateResponse {
  id: string;
  groupId: string;
  token: string;
  expiresAt: string;
  maxUses: number | null;
}

interface InvitePreviewResponse {
  valid: boolean;
  groupName: string | null;
  expiresAt: string | null;
}

interface GroupResponse {
  id: string;
  name: string;
  myRole: string;
}

describe('Group Invite Links E2E Security', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokenService: TokenService;

  let owner: { id: string; email: string; username: string };
  let member: { id: string; email: string; username: string };
  let invitee: { id: string; email: string; username: string };
  let group: { id: string };
  let tokenOwner: string;
  let tokenMember: string;
  let tokenInvitee: string;

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

    [owner, member, invitee] = await Promise.all(
      ['owner', 'member', 'invitee'].map((suffix) =>
        prisma.user.create({
          data: {
            email: `e2e-invite-${suffix}@example.com`,
            username: `e2einvite${suffix}`,
            passwordHash: 'hashedpassword',
          },
        }),
      ),
    );

    tokenOwner = await tokenService.signAccessToken({
      sub: owner.id,
      email: owner.email,
      jti: 'jti-owner',
    });
    tokenMember = await tokenService.signAccessToken({
      sub: member.id,
      email: member.email,
      jti: 'jti-member',
    });
    tokenInvitee = await tokenService.signAccessToken({
      sub: invitee.id,
      email: invitee.email,
      jti: 'jti-invitee',
    });

    const createGroupRes = await request(app.getHttpServer())
      .post('/groups')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ name: 'E2E Invite Group', memberIds: [member.id] })
      .expect(201);

    group = { id: (createGroupRes.body as GroupResponse).id };
  });

  afterAll(async () => {
    await prisma.groupInviteLink.deleteMany({
      where: { groupId: group.id },
    });
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
      where: { id: { in: [owner.id, member.id, invitee.id] } },
    });
    await app.close();
  });

  describe('owner-only invite management', () => {
    it('owner can create an invite link', async () => {
      return request(app.getHttpServer())
        .post(`/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(201)
        .then((res) => {
          const body = res.body as InviteCreateResponse;
          expect(body.groupId).toBe(group.id);
          expect(body.token).toHaveLength(64);
        });
    });

    it('member cannot create an invite link', async () => {
      return request(app.getHttpServer())
        .post(`/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(403);
    });

    it('unauthenticated user cannot create an invite link', async () => {
      return request(app.getHttpServer())
        .post(`/groups/${group.id}/invites`)
        .expect(401);
    });

    it('owner can list invite links', async () => {
      return request(app.getHttpServer())
        .get(`/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200)
        .then((res) => {
          const body = res.body as InviteCreateResponse[];
          expect(body.length).toBeGreaterThanOrEqual(1);
        });
    });

    it('member cannot list invite links', async () => {
      return request(app.getHttpServer())
        .get(`/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(403);
    });
  });

  describe('invite acceptance', () => {
    let invite: InviteCreateResponse;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ expiresInHours: 1 })
        .expect(201);

      invite = res.body as InviteCreateResponse;
    });

    it('public preview returns valid metadata', async () => {
      return request(app.getHttpServer())
        .get(`/group-invites/${invite.token}`)
        .expect(200)
        .then((res) => {
          const body = res.body as InvitePreviewResponse;
          expect(body.valid).toBe(true);
          expect(body.groupName).toBe('E2E Invite Group');
        });
    });

    it('invitee can accept and join the group', async () => {
      await request(app.getHttpServer())
        .post(`/group-invites/${invite.token}/accept`)
        .set('Authorization', `Bearer ${tokenInvitee}`)
        .expect(201);

      return request(app.getHttpServer())
        .get(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${tokenInvitee}`)
        .expect(200)
        .then((res) => {
          const body = res.body as GroupResponse;
          expect(body.myRole).toBe('MEMBER');
        });
    });

    it('accepting again is idempotent for an existing member', async () => {
      return request(app.getHttpServer())
        .post(`/group-invites/${invite.token}/accept`)
        .set('Authorization', `Bearer ${tokenInvitee}`)
        .expect(201);
    });

    it('unauthenticated user cannot accept an invite', async () => {
      return request(app.getHttpServer())
        .post(`/group-invites/${invite.token}/accept`)
        .expect(401);
    });
  });

  describe('revoking invite links', () => {
    it('member cannot revoke an invite link', async () => {
      const res = await request(app.getHttpServer())
        .post(`/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(201);

      const newInvite = res.body as InviteCreateResponse;

      return request(app.getHttpServer())
        .delete(`/groups/${group.id}/invites/${newInvite.id}`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(403);
    });

    it('owner can revoke an invite link and it becomes invalid', async () => {
      const res = await request(app.getHttpServer())
        .post(`/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(201);

      const newInvite = res.body as InviteCreateResponse;

      await request(app.getHttpServer())
        .delete(`/groups/${group.id}/invites/${newInvite.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const preview = await request(app.getHttpServer())
        .get(`/group-invites/${newInvite.token}`)
        .expect(200);

      expect((preview.body as InvitePreviewResponse).valid).toBe(false);
    });
  });
});
