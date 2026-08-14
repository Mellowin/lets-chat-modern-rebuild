import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AppModule } from './../src/app.module';
import { StorageService } from './../src/storage/storage.service';
import { PrismaService } from '@lets-chat/database';
import { TokenService } from './../src/auth/token.service';
import { PasswordService } from './../src/auth/password.service';
import { AccountDeletionFinalizerService } from './../src/auth/account-deletion-finalizer.service';
import { MailService } from './../src/mail/mail.service';
import { AvatarUploadService } from './../src/auth/avatar-upload.service';

interface AccountDeletionResponse {
  scheduledFor: string;
}

describe('AccountDeletion E2E', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let passwordService: PasswordService;
  let finalizer: AccountDeletionFinalizerService;

  let lastDeletionToken: string | null = null;
  const mailService = {
    sendAccountDeletionCancellationEmail: jest.fn(
      (input: { to: string; token: string }) => {
        lastDeletionToken = input.token;
        return Promise.resolve();
      },
    ),
    sendAccountDeletionCancelledConfirmationEmail: jest.fn(() =>
      Promise.resolve(),
    ),
  };

  let user: {
    id: string;
    email: string;
    username: string;
    password: string;
    passwordHash: string;
  };
  let token: string;

  async function createUser(suffix: string) {
    const password = `E2E-Password-${suffix}-Xy!`;
    const passwordHash = await passwordService.hashPassword(password);
    const created = await prisma.user.create({
      data: {
        email: `e2e-deletion-${suffix}@example.com`,
        username: `e2edeletion${suffix}`,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    return {
      id: created.id,
      email: created.email,
      username: created.username,
      password,
      passwordHash,
    };
  }

  async function signToken(userId: string, email: string) {
    return tokenService.signAccessToken({
      sub: userId,
      email,
      jti: `jti-${userId}`,
    });
  }

  async function uploadAvatar(accessToken: string): Promise<void> {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const tempPath = join(
      tmpdir(),
      `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
    );
    await fs.writeFile(tempPath, png);
    try {
      await request(app.getHttpServer())
        .patch('/auth/me/avatar/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('avatar', tempPath)
        .expect(200);
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue({
        deleteObjectsByPrefix: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(MailService)
      .useValue(mailService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);
    passwordService = app.get(PasswordService);
    finalizer = app.get(AccountDeletionFinalizerService);
  });

  beforeEach(async () => {
    user = await createUser(Date.now().toString());
    token = await signToken(user.id, user.email);
    lastDeletionToken = null;
    mailService.sendAccountDeletionCancellationEmail.mockClear();
    mailService.sendAccountDeletionCancelledConfirmationEmail.mockClear();
  });

  afterEach(async () => {
    await prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });
    await prisma.user.deleteMany({
      where: { id: user.id },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/account-deletion/request', () => {
    it('schedules deletion with a valid idempotency key', async () => {
      const idempotencyKey = randomUUID();
      const res = await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      const body = res.body as AccountDeletionResponse;
      expect(new Date(body.scheduledFor)).toBeInstanceOf(Date);

      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.status).toBe('PENDING_DELETION');
    });

    it('returns 400 without idempotency key', async () => {
      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(400);
    });

    it('returns the same scheduledFor on retry with the same key', async () => {
      const idempotencyKey = randomUUID();
      const first = await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      const second = await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      expect((first.body as AccountDeletionResponse).scheduledFor).toBe(
        (second.body as AccountDeletionResponse).scheduledFor,
      );

      // Only one cancellation email should have been sent.
      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.status).toBe('PENDING_DELETION');
      expect(updated?.deletionCancellationTokenHash).not.toBeNull();
    });

    it('rejects the same key with a different body', async () => {
      const idempotencyKey = randomUUID();
      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: 'different-password',
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(409);
    });

    it('allows a PENDING_DELETION user to retry the same key', async () => {
      const idempotencyKey = randomUUID();
      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      // Other endpoints reject PENDING_DELETION.
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      const retry = await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      expect(
        new Date((retry.body as AccountDeletionResponse).scheduledFor),
      ).toBeInstanceOf(Date);
    });

    it('cancels pending deletion and restores login', async () => {
      const idempotencyKey = randomUUID();
      const res = await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      expect(lastDeletionToken).not.toBeNull();
      expect((res.body as AccountDeletionResponse).scheduledFor).toBeDefined();

      await request(app.getHttpServer())
        .post('/auth/account-deletion/cancel')
        .send({ token: lastDeletionToken })
        .expect(200);

      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.status).toBe('ACTIVE');

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
    });

    it('anonymizes user after grace period and hides them in DMs', async () => {
      const other = await createUser(`other-${Date.now()}`);
      const otherToken = await signToken(other.id, other.email);

      const conversation = await prisma.directConversation.create({
        data: {
          key: `${user.id}:${other.id}`,
          participants: {
            create: [{ userId: user.id }, { userId: other.id }],
          },
        },
      });

      await prisma.directMessage.create({
        data: {
          conversationId: conversation.id,
          authorId: user.id,
          content: 'hello before deletion',
        },
      });

      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      await prisma.user.update({
        where: { id: user.id },
        data: { deletionScheduledFor: new Date(Date.now() - 1000) },
      });

      await finalizer.run();

      const finalized = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(finalized?.status).toBe('ANONYMIZED');

      const list = await request(app.getHttpServer())
        .get('/direct-conversations')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      const conv = (
        list.body as Array<{
          id: string;
          otherParticipant: {
            id: string;
            username: string;
            displayName: string;
            isDeleted: boolean;
          };
        }>
      ).find((c) => c.otherParticipant?.id === user.id);
      expect(conv).toBeDefined();
      expect(conv!.otherParticipant.username).toBe('');
      expect(conv!.otherParticipant.displayName).toBe('Deleted user');
      expect(conv!.otherParticipant.isDeleted).toBe(true);

      await prisma.directMessage.deleteMany({
        where: { conversationId: conversation.id },
      });
      await prisma.directConversationParticipant.deleteMany({
        where: { conversationId: conversation.id },
      });
      await prisma.directConversation.delete({
        where: { id: conversation.id },
      });
      await prisma.user.deleteMany({ where: { id: other.id } });
    });

    it('allows two different users to share the same idempotency key', async () => {
      const sharedKey = randomUUID();
      const userA = await createUser(`a-${Date.now()}`);
      const userB = await createUser(`b-${Date.now()}`);
      const tokenA = await signToken(userA.id, userA.email);
      const tokenB = await signToken(userB.id, userB.email);

      const first = await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          currentPassword: userA.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      const second = await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          currentPassword: userB.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      expect(
        new Date((first.body as AccountDeletionResponse).scheduledFor),
      ).toBeInstanceOf(Date);
      expect(
        new Date((second.body as AccountDeletionResponse).scheduledFor),
      ).toBeInstanceOf(Date);

      const dbA = await prisma.user.findUnique({ where: { id: userA.id } });
      const dbB = await prisma.user.findUnique({ where: { id: userB.id } });
      expect(dbA?.status).toBe('PENDING_DELETION');
      expect(dbB?.status).toBe('PENDING_DELETION');
      expect(
        mailService.sendAccountDeletionCancellationEmail,
      ).toHaveBeenCalledTimes(2);

      await prisma.user.deleteMany({
        where: { id: { in: [userA.id, userB.id] } },
      });
    });

    it('returns the same result after an API restart equivalent', async () => {
      const idempotencyKey = randomUUID();
      const first = await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      const firstScheduledFor = (first.body as AccountDeletionResponse)
        .scheduledFor;

      // Verify the durable row exists in the database.
      const row = await prisma.accountDeletionIdempotency.findUnique({
        where: {
          userId_idempotencyKey: { userId: user.id, idempotencyKey },
        },
      });
      expect(row).not.toBeNull();
      expect(row?.bodyHash).toBeTruthy();

      // Simulate a fresh API instance by compiling a new application against the same DB.
      const freshModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(StorageService)
        .useValue({
          deleteObjectsByPrefix: jest.fn().mockResolvedValue(undefined),
        })
        .overrideProvider(MailService)
        .useValue(mailService)
        .compile();
      const freshApp: INestApplication<App> =
        freshModule.createNestApplication();
      await freshApp.init();
      try {
        const retry = await request(freshApp.getHttpServer())
          .post('/auth/account-deletion/request')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({
            currentPassword: user.password,
            confirmationPhrase: 'DELETE MY ACCOUNT',
          })
          .expect(200);

        expect((retry.body as AccountDeletionResponse).scheduledFor).toBe(
          firstScheduledFor,
        );
        // Only one cancellation email should have been sent across both requests.
        expect(
          mailService.sendAccountDeletionCancellationEmail,
        ).toHaveBeenCalledTimes(1);
      } finally {
        await freshApp.close();
      }
    });

    it('rejects the same idempotency key with a different body after success', async () => {
      const idempotencyKey = randomUUID();
      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: 'different-password',
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(409);
    });

    it('resends a cancellation link for a pending user', async () => {
      const idempotencyKey = randomUUID();
      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      const firstToken = lastDeletionToken;
      expect(firstToken).not.toBeNull();

      await request(app.getHttpServer())
        .post('/auth/account-deletion/resend-cancellation')
        .send({ email: user.email, currentPassword: user.password })
        .expect(200);

      const secondToken = lastDeletionToken;
      expect(secondToken).not.toBeNull();
      expect(secondToken).not.toBe(firstToken);

      // Cancellation with the new token works.
      await request(app.getHttpServer())
        .post('/auth/account-deletion/cancel')
        .send({ token: secondToken })
        .expect(200);

      const restored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(restored?.status).toBe('ACTIVE');
    });

    it('finalization removes all historical avatar files', async () => {
      const resetCooldown = () =>
        prisma.user.update({
          where: { id: user.id },
          data: {
            avatarUpdatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
          },
        });

      await uploadAvatar(token);
      await resetCooldown();
      await uploadAvatar(token);
      await resetCooldown();
      await uploadAvatar(token);

      const idempotencyKey = randomUUID();
      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      await prisma.user.update({
        where: { id: user.id },
        data: { deletionScheduledFor: new Date(Date.now() - 1000) },
      });

      await finalizer.run();

      const finalized = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(finalized?.status).toBe('ANONYMIZED');

      await expect(
        fs.access(join(process.cwd(), 'uploads', 'avatars', user.id)),
      ).rejects.toThrow();
    });

    it('does not delete avatar files before the scheduled date', async () => {
      await uploadAvatar(token);

      const idempotencyKey = randomUUID();
      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      // Keep scheduled date in the future.
      await prisma.user.update({
        where: { id: user.id },
        data: {
          deletionScheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await finalizer.run();

      const pending = await prisma.user.findUnique({ where: { id: user.id } });
      expect(pending?.status).toBe('PENDING_DELETION');

      await expect(
        fs.access(join(process.cwd(), 'uploads', 'avatars', user.id)),
      ).resolves.toBeUndefined();
    });

    it('returns 409 when the same idempotency key is reused with a different body after cancellation', async () => {
      const idempotencyKey = randomUUID();
      const callsBefore =
        mailService.sendAccountDeletionCancellationEmail.mock.calls.length;

      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      const cancellationEmail =
        mailService.sendAccountDeletionCancellationEmail.mock.calls[
          callsBefore
        ][0];
      const rawToken = cancellationEmail.token;

      await request(app.getHttpServer())
        .post('/auth/account-deletion/cancel')
        .send({ token: rawToken })
        .expect(200);

      const loginAfterCancel = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: user.password });
      expect(loginAfterCancel.status).toBe(200);
      const newToken = (loginAfterCancel.body as { accessToken: string })
        .accessToken;

      const retry = await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${newToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: 'wrong-password',
          confirmationPhrase: 'DELETE MY ACCOUNT',
        });
      expect(retry.status).toBe(409);
      expect(
        mailService.sendAccountDeletionCancellationEmail.mock.calls.length -
          callsBefore,
      ).toBe(1);
    });

    it('serializes two concurrent instances on the same DB with the same key and body', async () => {
      const idempotencyKey = randomUUID();
      const callsBefore =
        mailService.sendAccountDeletionCancellationEmail.mock.calls.length;

      const freshModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(StorageService)
        .useValue({
          deleteObjectsByPrefix: jest.fn().mockResolvedValue(undefined),
        })
        .overrideProvider(MailService)
        .useValue(mailService)
        .compile();
      const freshApp: INestApplication<App> =
        freshModule.createNestApplication();
      await freshApp.init();

      try {
        const [first, second] = await Promise.all([
          request(app.getHttpServer())
            .post('/auth/account-deletion/request')
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', idempotencyKey)
            .send({
              currentPassword: user.password,
              confirmationPhrase: 'DELETE MY ACCOUNT',
            }),
          request(freshApp.getHttpServer())
            .post('/auth/account-deletion/request')
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', idempotencyKey)
            .send({
              currentPassword: user.password,
              confirmationPhrase: 'DELETE MY ACCOUNT',
            }),
        ]);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect((first.body as AccountDeletionResponse).scheduledFor).toBe(
          (second.body as AccountDeletionResponse).scheduledFor,
        );
        expect(
          mailService.sendAccountDeletionCancellationEmail.mock.calls.length -
            callsBefore,
        ).toBe(1);
      } finally {
        await freshApp.close();
      }
    });

    it('returns structured ownership blockers in 403 response', async () => {
      const owner = await createUser(`blocker-${Date.now()}`);
      const ownerToken = await signToken(owner.id, owner.email);
      const workspace = await prisma.workspace.create({
        data: {
          name: `Blocker ${Date.now()}`,
          slug: `blocker-${Date.now()}`,
          ownerId: owner.id,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          currentPassword: owner.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(403);

      const body = res.body as {
        code: string;
        blockers?: {
          workspaces: Array<{ id: string; name: string; slug: string }>;
          groups: Array<{ id: string; name: string; memberId: string }>;
          channels: Array<{
            id: string;
            workspaceId: string;
            name: string;
            slug: string;
            memberId: string;
          }>;
        };
      };
      expect(body.code).toBe('ACCOUNT_DELETION_OWNERSHIP_BLOCKED');
      expect(body.blockers).toBeDefined();
      expect(body.blockers?.workspaces).toHaveLength(1);
      expect(body.blockers?.workspaces[0].id).toBe(workspace.id);
      expect(body.blockers?.channels).toEqual([]);

      await prisma.workspaceMember.deleteMany({
        where: { workspaceId: workspace.id },
      });
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.user.deleteMany({ where: { id: owner.id } });
    });

    it('serializes workspace ownership transfer against account deletion scheduling', async () => {
      const userB = await createUser(`ws-owner-${Date.now()}`);
      const userA = await createUser(`ws-target-${Date.now()}`);
      const tokenB = await signToken(userB.id, userB.email);
      const tokenA = await signToken(userA.id, userA.email);

      const workspace = await prisma.workspace.create({
        data: {
          name: `Workspace ${Date.now()}`,
          slug: `ws-${Date.now()}`,
          ownerId: userB.id,
        },
      });
      const member = await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: userA.id,
          role: 'MEMBER',
        },
      });

      await Promise.allSettled([
        request(app.getHttpServer())
          .post('/auth/account-deletion/request')
          .set('Authorization', `Bearer ${tokenA}`)
          .set('Idempotency-Key', randomUUID())
          .send({
            currentPassword: userA.password,
            confirmationPhrase: 'DELETE MY ACCOUNT',
          }),
        request(app.getHttpServer())
          .post(`/workspaces/${workspace.id}/owner`)
          .set('Authorization', `Bearer ${tokenB}`)
          .send({ memberId: member.id }),
      ]);

      const finalA = await prisma.user.findUnique({ where: { id: userA.id } });
      const workspaceAfter = await prisma.workspace.findUnique({
        where: { id: workspace.id },
      });
      const membership = await prisma.workspaceMember.findUnique({
        where: { id: member.id },
      });

      const pendingAndOwner =
        finalA?.status === 'PENDING_DELETION' &&
        workspaceAfter?.ownerId === userA.id &&
        membership?.role === 'OWNER';
      expect(pendingAndOwner).toBe(false);

      await prisma.workspaceMember.deleteMany({
        where: { workspaceId: workspace.id },
      });
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [userA.id, userB.id] } },
      });
    });

    it('serializes group ownership transfer against account deletion scheduling', async () => {
      const userA = await createUser(`grp-owner-${Date.now()}`);
      const userB = await createUser(`grp-target-${Date.now()}`);
      const tokenA = await signToken(userA.id, userA.email);
      const tokenB = await signToken(userB.id, userB.email);

      const group = await prisma.groupConversation.create({
        data: {
          name: `Group ${Date.now()}`,
          createdById: userA.id,
          members: {
            create: [
              { userId: userA.id, role: 'OWNER' },
              { userId: userB.id, role: 'MEMBER' },
            ],
          },
        },
        include: {
          members: {
            where: { leftAt: null },
            select: { id: true, userId: true, role: true },
          },
        },
      });
      const memberB = group.members.find(
        (m) => m.userId === userB.id && m.role === 'MEMBER',
      );
      expect(memberB).toBeDefined();

      await Promise.allSettled([
        request(app.getHttpServer())
          .post('/auth/account-deletion/request')
          .set('Authorization', `Bearer ${tokenB}`)
          .set('Idempotency-Key', randomUUID())
          .send({
            currentPassword: userB.password,
            confirmationPhrase: 'DELETE MY ACCOUNT',
          }),
        request(app.getHttpServer())
          .post(`/groups/${group.id}/owner`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ memberId: memberB!.id }),
      ]);

      const finalB = await prisma.user.findUnique({ where: { id: userB.id } });
      const groupAfter = await prisma.groupConversation.findUnique({
        where: { id: group.id },
        include: {
          members: {
            where: { leftAt: null },
            select: { userId: true, role: true },
          },
        },
      });
      const bOwner =
        groupAfter?.members.some(
          (m) => m.userId === userB.id && m.role === 'OWNER',
        ) ?? false;
      expect(finalB?.status === 'PENDING_DELETION' && bOwner).toBe(false);

      await prisma.groupMessage.deleteMany({ where: { groupId: group.id } });
      await prisma.groupMember.deleteMany({ where: { groupId: group.id } });
      await prisma.groupConversation.delete({ where: { id: group.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [userA.id, userB.id] } },
      });
    });

    it('allows only one of two concurrent group transfers from the same owner', async () => {
      const owner = await createUser(`grp-concurrent-owner-${Date.now()}`);
      const targetA = await createUser(`grp-concurrent-a-${Date.now()}`);
      const targetB = await createUser(`grp-concurrent-b-${Date.now()}`);
      const ownerToken = await signToken(owner.id, owner.email);

      const group = await prisma.groupConversation.create({
        data: {
          name: `Group ${Date.now()}`,
          createdById: owner.id,
          members: {
            create: [
              { userId: owner.id, role: 'OWNER' },
              { userId: targetA.id, role: 'MEMBER' },
              { userId: targetB.id, role: 'MEMBER' },
            ],
          },
        },
        include: {
          members: {
            where: { leftAt: null },
            select: { id: true, userId: true, role: true },
          },
        },
      });
      const memberA = group.members.find(
        (m) => m.userId === targetA.id && m.role === 'MEMBER',
      );
      const memberB = group.members.find(
        (m) => m.userId === targetB.id && m.role === 'MEMBER',
      );
      expect(memberA).toBeDefined();
      expect(memberB).toBeDefined();

      const [resA, resB] = (await Promise.allSettled([
        request(app.getHttpServer())
          .post(`/groups/${group.id}/owner`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ memberId: memberA!.id }),
        request(app.getHttpServer())
          .post(`/groups/${group.id}/owner`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ memberId: memberB!.id }),
      ])) as [
        PromiseSettledResult<request.Response>,
        PromiseSettledResult<request.Response>,
      ];

      const getStatus = (result: PromiseSettledResult<request.Response>) => {
        if (result.status === 'fulfilled') {
          return result.value.status;
        }
        const reason = result.reason as { status?: number } | undefined;
        return reason?.status;
      };
      const statusA = getStatus(resA);
      const statusB = getStatus(resB);
      const successCount = [statusA, statusB].filter((s) => s === 200).length;
      expect(successCount).toBe(1);

      const groupAfter = await prisma.groupConversation.findUnique({
        where: { id: group.id },
        include: {
          members: {
            where: { leftAt: null },
            select: { userId: true, role: true },
          },
        },
      });
      const owners =
        groupAfter?.members.filter((m) => m.role === 'OWNER') ?? [];
      expect(owners).toHaveLength(1);
      expect(owners[0]?.userId).not.toBe(owner.id);

      await prisma.groupMessage.deleteMany({ where: { groupId: group.id } });
      await prisma.groupMember.deleteMany({ where: { groupId: group.id } });
      await prisma.groupConversation.delete({ where: { id: group.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [owner.id, targetA.id, targetB.id] } },
      });
    });

    it('returns 409 when group transfer target schedules deletion before the lock', async () => {
      const owner = await createUser(`grp-race-owner-${Date.now()}`);
      const target = await createUser(`grp-race-target-${Date.now()}`);
      const ownerToken = await signToken(owner.id, owner.email);
      const targetToken = await signToken(target.id, target.email);

      const group = await prisma.groupConversation.create({
        data: {
          name: `Group ${Date.now()}`,
          createdById: owner.id,
          members: {
            create: [
              { userId: owner.id, role: 'OWNER' },
              { userId: target.id, role: 'MEMBER' },
            ],
          },
        },
        include: {
          members: {
            where: { leftAt: null },
            select: { id: true, userId: true, role: true },
          },
        },
      });
      const targetMember = group.members.find(
        (m) => m.userId === target.id && m.role === 'MEMBER',
      );
      expect(targetMember).toBeDefined();

      await Promise.allSettled([
        request(app.getHttpServer())
          .post('/auth/account-deletion/request')
          .set('Authorization', `Bearer ${targetToken}`)
          .set('Idempotency-Key', randomUUID())
          .send({
            currentPassword: target.password,
            confirmationPhrase: 'DELETE MY ACCOUNT',
          }),
        request(app.getHttpServer())
          .post(`/groups/${group.id}/owner`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ memberId: targetMember!.id }),
      ]);

      const transferResult = await request(app.getHttpServer())
        .post(`/groups/${group.id}/owner`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ memberId: targetMember!.id });

      // If the deletion request won, the transfer must observe the target is no
      // longer ACTIVE and return 409. If the transfer won, the deletion request
      // would have been blocked by ownership.
      const finalTarget = await prisma.user.findUnique({
        where: { id: target.id },
      });
      if (finalTarget?.status === 'PENDING_DELETION') {
        expect(transferResult.status).toBe(409);
      }
      expect(
        finalTarget?.status === 'ACTIVE' ||
          finalTarget?.status === 'PENDING_DELETION',
      ).toBe(true);

      await prisma.groupMessage.deleteMany({ where: { groupId: group.id } });
      await prisma.groupMember.deleteMany({ where: { groupId: group.id } });
      await prisma.groupConversation.delete({ where: { id: group.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [owner.id, target.id] } },
      });
    });

    it('returns channel ownership blockers in 403 response', async () => {
      const owner = await createUser(`channel-blocker-${Date.now()}`);
      const ownerToken = await signToken(owner.id, owner.email);
      const workspace = await prisma.workspace.create({
        data: {
          name: `Channel Blocker ${Date.now()}`,
          slug: `channel-blocker-${Date.now()}`,
          ownerId: owner.id,
        },
      });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: owner.id,
          role: 'OWNER',
        },
      });
      const channel = await prisma.channel.create({
        data: {
          workspaceId: workspace.id,
          name: 'Owned Channel',
          slug: 'owned-channel',
          type: 'PUBLIC',
          createdById: owner.id,
          members: {
            create: {
              userId: owner.id,
              role: 'OWNER',
            },
          },
        },
      });

      const res = await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          currentPassword: owner.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(403);

      const body = res.body as {
        code: string;
        blockers?: {
          channels: Array<{
            id: string;
            workspaceId: string;
            name: string;
            slug: string;
            memberId: string;
          }>;
        };
      };
      expect(body.code).toBe('ACCOUNT_DELETION_OWNERSHIP_BLOCKED');
      expect(body.blockers?.channels).toHaveLength(1);
      expect(body.blockers?.channels[0].id).toBe(channel.id);
      expect(body.blockers?.channels[0].workspaceId).toBe(workspace.id);

      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel.delete({ where: { id: channel.id } });
      await prisma.workspaceMember.deleteMany({
        where: { workspaceId: workspace.id },
      });
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.user.deleteMany({ where: { id: owner.id } });
    });

    it('allows account deletion after channel ownership transfer', async () => {
      const owner = await createUser(`channel-owner-${Date.now()}`);
      const target = await createUser(`channel-target-${Date.now()}`);
      const ownerToken = await signToken(owner.id, owner.email);

      const workspace = await prisma.workspace.create({
        data: {
          name: `Channel Transfer ${Date.now()}`,
          slug: `channel-transfer-${Date.now()}`,
          ownerId: target.id,
        },
      });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: target.id,
          role: 'OWNER',
        },
      });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: owner.id,
          role: 'MEMBER',
        },
      });
      const channel = await prisma.channel.create({
        data: {
          workspaceId: workspace.id,
          name: 'Transfer Channel',
          slug: 'transfer-channel',
          type: 'PUBLIC',
          createdById: owner.id,
          members: {
            create: [
              { userId: owner.id, role: 'OWNER' },
              { userId: target.id, role: 'MEMBER' },
            ],
          },
        },
        include: {
          members: {
            where: { deletedAt: null },
            select: { id: true, userId: true, role: true },
          },
        },
      });
      const targetMember = channel.members.find(
        (m) => m.userId === target.id && m.role === 'MEMBER',
      );
      expect(targetMember).toBeDefined();

      await request(app.getHttpServer())
        .post(
          `/workspaces/${workspace.id}/channels/${channel.id}/transfer-ownership`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ memberId: targetMember!.id })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          currentPassword: owner.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      const finalOwner = await prisma.user.findUnique({
        where: { id: owner.id },
      });
      expect(finalOwner?.status).toBe('PENDING_DELETION');

      const channelAfter = await prisma.channel.findUnique({
        where: { id: channel.id },
        include: {
          members: {
            where: { deletedAt: null },
            select: { userId: true, role: true },
          },
        },
      });
      expect(
        channelAfter?.members.some(
          (m) => m.userId === target.id && m.role === 'OWNER',
        ),
      ).toBe(true);

      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel.delete({ where: { id: channel.id } });
      await prisma.workspaceMember.deleteMany({
        where: { workspaceId: workspace.id },
      });
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [owner.id, target.id] } },
      });
    });

    it('allows only one of two concurrent channel transfers from the same owner', async () => {
      const owner = await createUser(`channel-concurrent-owner-${Date.now()}`);
      const targetA = await createUser(`channel-concurrent-a-${Date.now()}`);
      const targetB = await createUser(`channel-concurrent-b-${Date.now()}`);
      const ownerToken = await signToken(owner.id, owner.email);

      const workspace = await prisma.workspace.create({
        data: {
          name: `Channel Concurrent ${Date.now()}`,
          slug: `channel-concurrent-${Date.now()}`,
          ownerId: owner.id,
        },
      });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: owner.id,
          role: 'OWNER',
        },
      });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: targetA.id,
          role: 'MEMBER',
        },
      });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: targetB.id,
          role: 'MEMBER',
        },
      });
      const channel = await prisma.channel.create({
        data: {
          workspaceId: workspace.id,
          name: 'Concurrent Channel',
          slug: 'concurrent-channel',
          type: 'PUBLIC',
          createdById: owner.id,
          members: {
            create: [
              { userId: owner.id, role: 'OWNER' },
              { userId: targetA.id, role: 'MEMBER' },
              { userId: targetB.id, role: 'MEMBER' },
            ],
          },
        },
        include: {
          members: {
            where: { deletedAt: null },
            select: { id: true, userId: true, role: true },
          },
        },
      });
      const memberA = channel.members.find(
        (m) => m.userId === targetA.id && m.role === 'MEMBER',
      );
      const memberB = channel.members.find(
        (m) => m.userId === targetB.id && m.role === 'MEMBER',
      );
      expect(memberA).toBeDefined();
      expect(memberB).toBeDefined();

      const [resA, resB] = (await Promise.allSettled([
        request(app.getHttpServer())
          .post(
            `/workspaces/${workspace.id}/channels/${channel.id}/transfer-ownership`,
          )
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ memberId: memberA!.id }),
        request(app.getHttpServer())
          .post(
            `/workspaces/${workspace.id}/channels/${channel.id}/transfer-ownership`,
          )
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ memberId: memberB!.id }),
      ])) as [
        PromiseSettledResult<request.Response>,
        PromiseSettledResult<request.Response>,
      ];

      const getStatus = (result: PromiseSettledResult<request.Response>) => {
        if (result.status === 'fulfilled') {
          return result.value.status;
        }
        const reason = result.reason as { status?: number } | undefined;
        return reason?.status;
      };
      const statusA = getStatus(resA);
      const statusB = getStatus(resB);
      const successCount = [statusA, statusB].filter((s) => s === 200).length;
      expect(successCount).toBe(1);

      const channelAfter = await prisma.channel.findUnique({
        where: { id: channel.id },
        include: {
          members: {
            where: { deletedAt: null },
            select: { userId: true, role: true },
          },
        },
      });
      const owners =
        channelAfter?.members.filter((m) => m.role === 'OWNER') ?? [];
      expect(owners).toHaveLength(1);
      expect(owners[0]?.userId).not.toBe(owner.id);

      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel.delete({ where: { id: channel.id } });
      await prisma.workspaceMember.deleteMany({
        where: { workspaceId: workspace.id },
      });
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [owner.id, targetA.id, targetB.id] } },
      });
    });

    it('serializes channel ownership transfer against account deletion scheduling', async () => {
      const owner = await createUser(`channel-race-owner-${Date.now()}`);
      const target = await createUser(`channel-race-target-${Date.now()}`);
      const ownerToken = await signToken(owner.id, owner.email);
      const targetToken = await signToken(target.id, target.email);

      const workspace = await prisma.workspace.create({
        data: {
          name: `Channel Race ${Date.now()}`,
          slug: `channel-race-${Date.now()}`,
          ownerId: owner.id,
        },
      });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: owner.id,
          role: 'OWNER',
        },
      });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: target.id,
          role: 'MEMBER',
        },
      });
      const channel = await prisma.channel.create({
        data: {
          workspaceId: workspace.id,
          name: 'Race Channel',
          slug: 'race-channel',
          type: 'PUBLIC',
          createdById: owner.id,
          members: {
            create: [
              { userId: owner.id, role: 'OWNER' },
              { userId: target.id, role: 'MEMBER' },
            ],
          },
        },
        include: {
          members: {
            where: { deletedAt: null },
            select: { id: true, userId: true, role: true },
          },
        },
      });
      const targetMember = channel.members.find(
        (m) => m.userId === target.id && m.role === 'MEMBER',
      );
      expect(targetMember).toBeDefined();

      await Promise.allSettled([
        request(app.getHttpServer())
          .post('/auth/account-deletion/request')
          .set('Authorization', `Bearer ${targetToken}`)
          .set('Idempotency-Key', randomUUID())
          .send({
            currentPassword: target.password,
            confirmationPhrase: 'DELETE MY ACCOUNT',
          }),
        request(app.getHttpServer())
          .post(
            `/workspaces/${workspace.id}/channels/${channel.id}/transfer-ownership`,
          )
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ memberId: targetMember!.id }),
      ]);

      const transferResult = await request(app.getHttpServer())
        .post(
          `/workspaces/${workspace.id}/channels/${channel.id}/transfer-ownership`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ memberId: targetMember!.id });

      const finalTarget = await prisma.user.findUnique({
        where: { id: target.id },
      });
      if (finalTarget?.status === 'PENDING_DELETION') {
        expect(transferResult.status).toBe(409);
      }
      expect(
        finalTarget?.status === 'ACTIVE' ||
          finalTarget?.status === 'PENDING_DELETION',
      ).toBe(true);

      await prisma.channelMember.deleteMany({
        where: { channelId: channel.id },
      });
      await prisma.channel.delete({ where: { id: channel.id } });
      await prisma.workspaceMember.deleteMany({
        where: { workspaceId: workspace.id },
      });
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [owner.id, target.id] } },
      });
    });

    it('retries avatar cleanup after a failed first finalizer run', async () => {
      const avatarUpload = app.get(AvatarUploadService);
      const deleteAll = jest
        .spyOn(avatarUpload, 'deleteAllAvatarsForUser')
        .mockRejectedValueOnce(new Error('disk read error'));

      await uploadAvatar(token);

      const idempotencyKey = randomUUID();
      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      await prisma.user.update({
        where: { id: user.id },
        data: { deletionScheduledFor: new Date(Date.now() - 1000) },
      });

      const first = await finalizer.run();
      expect(first.processedCount).toBe(1);
      // The in-run retry pass succeeds after the initial attempt fails.
      expect(first.cleanedAvatars).toBe(1);

      deleteAll.mockRestore();

      const second = await finalizer.run();
      expect(second.processedCount).toBe(0);
      expect(second.cleanedAvatars).toBe(0);

      const finalized = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(finalized?.status).toBe('ANONYMIZED');
      expect(finalized?.avatarCleanupCompletedAt).toBeInstanceOf(Date);
    });
  });

  describe('POST /auth/account-deletion/cancel', () => {
    it('does not cancel when audit transaction fails and keeps token usable', async () => {
      const idempotencyKey = randomUUID();
      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      const firstToken = lastDeletionToken;
      expect(firstToken).not.toBeNull();

      // Cancellation commits the state transition and audit inside a Prisma
      // transaction; mocking the transaction method simulates an audit/DB failure.
      const transactionSpy = jest
        .spyOn(prisma, '$transaction')
        .mockRejectedValueOnce(new Error('audit unavailable'));
      try {
        await request(app.getHttpServer())
          .post('/auth/account-deletion/cancel')
          .send({ token: firstToken })
          .expect(500);
      } finally {
        transactionSpy.mockRestore();
      }

      const pending = await prisma.user.findUnique({ where: { id: user.id } });
      expect(pending?.status).toBe('PENDING_DELETION');
      expect(pending?.deletionCancellationTokenHash).not.toBeNull();

      await request(app.getHttpServer())
        .post('/auth/account-deletion/cancel')
        .send({ token: firstToken })
        .expect(200);

      const restored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(restored?.status).toBe('ACTIVE');
    });

    it('rejects a revoked token after resend rotates the cancellation token', async () => {
      const idempotencyKey = randomUUID();
      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      const firstToken = lastDeletionToken;
      expect(firstToken).not.toBeNull();

      await request(app.getHttpServer())
        .post('/auth/account-deletion/resend-cancellation')
        .send({ email: user.email, currentPassword: user.password })
        .expect(200);

      const secondToken = lastDeletionToken;
      expect(secondToken).not.toBeNull();
      expect(secondToken).not.toBe(firstToken);

      await request(app.getHttpServer())
        .post('/auth/account-deletion/cancel')
        .send({ token: firstToken })
        .expect(404);

      await request(app.getHttpServer())
        .post('/auth/account-deletion/cancel')
        .send({ token: secondToken })
        .expect(200);

      const restored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(restored?.status).toBe('ACTIVE');

      const audits = await prisma.auditLog.findMany({
        where: {
          actorId: user.id,
          action: 'account_deletion.cancelled',
        },
      });
      expect(audits).toHaveLength(1);
    });

    it('serializes concurrent cancel and resend so the old token is rejected or a new token is usable', async () => {
      const idempotencyKey = randomUUID();
      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      const firstToken = lastDeletionToken;
      expect(firstToken).not.toBeNull();

      const [cancelRes, resendRes] = (await Promise.allSettled([
        request(app.getHttpServer())
          .post('/auth/account-deletion/cancel')
          .send({ token: firstToken }),
        request(app.getHttpServer())
          .post('/auth/account-deletion/resend-cancellation')
          .send({ email: user.email, currentPassword: user.password }),
      ])) as [
        PromiseSettledResult<request.Response>,
        PromiseSettledResult<request.Response>,
      ];

      const getStatus = (result: PromiseSettledResult<request.Response>) => {
        if (result.status === 'fulfilled') {
          return result.value.status;
        }
        const reason = result.reason as { status?: number } | undefined;
        return reason?.status;
      };
      const cancelStatus = getStatus(cancelRes);
      const resendStatus = getStatus(resendRes);

      const finalUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      const secondToken = lastDeletionToken;

      if (cancelStatus === 200) {
        // Cancel won the race: account is ACTIVE and any new token from a late
        // resend must not leave a usable cancellation token behind.
        expect(finalUser?.status).toBe('ACTIVE');
        expect(finalUser?.deletionCancellationTokenHash).toBeNull();
      } else {
        // Resend won: old token must be rejected, new token must work.
        expect(resendStatus).toBe(200);
        expect(secondToken).not.toBe(firstToken);
        await request(app.getHttpServer())
          .post('/auth/account-deletion/cancel')
          .send({ token: firstToken })
          .expect(404);
        await request(app.getHttpServer())
          .post('/auth/account-deletion/cancel')
          .send({ token: secondToken })
          .expect(200);
      }

      const audits = await prisma.auditLog.findMany({
        where: {
          actorId: user.id,
          action: 'account_deletion.cancelled',
        },
      });
      expect(audits.length).toBeLessThanOrEqual(1);
    });

    it('returns success even when confirmation email fails after cancellation', async () => {
      const idempotencyKey = randomUUID();
      await request(app.getHttpServer())
        .post('/auth/account-deletion/request')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          currentPassword: user.password,
          confirmationPhrase: 'DELETE MY ACCOUNT',
        })
        .expect(200);

      const firstToken = lastDeletionToken;
      expect(firstToken).not.toBeNull();

      const failingMailService = {
        ...mailService,
        sendAccountDeletionCancelledConfirmationEmail: jest
          .fn()
          .mockRejectedValueOnce(new Error('mail down')),
      };
      const emailModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(StorageService)
        .useValue({
          deleteObjectsByPrefix: jest.fn().mockResolvedValue(undefined),
        })
        .overrideProvider(MailService)
        .useValue(failingMailService)
        .compile();
      const emailApp: INestApplication<App> =
        emailModule.createNestApplication();
      await emailApp.init();
      try {
        await request(emailApp.getHttpServer())
          .post('/auth/account-deletion/cancel')
          .send({ token: firstToken })
          .expect(200);

        const restored = await prisma.user.findUnique({
          where: { id: user.id },
        });
        expect(restored?.status).toBe('ACTIVE');

        await request(emailApp.getHttpServer())
          .post('/auth/login')
          .send({ email: user.email, password: user.password })
          .expect(200);
      } finally {
        await emailApp.close();
      }
    });

    it('does not leak reporter or moderator audit data in data export', async () => {
      const reporter = await createUser(`export-reporter-${Date.now()}`);
      const moderator = await createUser(`export-moderator-${Date.now()}`);
      const secretReason = 'VERY_SECRET_REPORT_REASON';
      const secretAdminNote = 'VERY_SECRET_ADMIN_NOTE';

      const report = await prisma.userReport.create({
        data: {
          reporterId: reporter.id,
          reportedUserId: user.id,
          reason: secretReason,
          details: 'report details',
          status: 'OPEN',
        },
      });

      await prisma.auditLog.createMany({
        data: [
          {
            actorId: reporter.id,
            targetUserId: user.id,
            action: 'report.created',
            entityType: 'user_report',
            entityId: report.id,
            severity: 'warning',
            metadata: { reason: secretReason, messageId: null },
          },
          {
            actorId: moderator.id,
            targetUserId: user.id,
            action: 'report.updated',
            entityType: 'user_report',
            entityId: report.id,
            severity: 'warning',
            metadata: {
              oldStatus: 'OPEN',
              newStatus: 'RESOLVED',
              adminNote: secretAdminNote,
            },
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .post('/auth/data-export')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: user.password })
        .expect(200);

      const serialized = res.text;
      expect(serialized).not.toContain(secretReason);
      expect(serialized).not.toContain(secretAdminNote);
      expect(serialized).not.toContain(reporter.id);
      expect(serialized).not.toContain(moderator.id);

      const payload = JSON.parse(serialized) as { auditLogs?: unknown[] };
      expect(payload.auditLogs).toBeDefined();
      const leakedReporterAudit = (payload.auditLogs ?? []).find((log) => {
        const l = log as {
          actorId?: string;
          metadata?: { adminNote?: string; reason?: string };
        };
        return (
          l.actorId === reporter.id ||
          l.actorId === moderator.id ||
          l.metadata?.adminNote === secretAdminNote ||
          l.metadata?.reason === secretReason
        );
      });
      expect(leakedReporterAudit).toBeUndefined();

      await prisma.auditLog.deleteMany({
        where: { entityId: report.id, entityType: 'user_report' },
      });
      await prisma.userReport.deleteMany({ where: { id: report.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [reporter.id, moderator.id] } },
      });
    });
  });
});
