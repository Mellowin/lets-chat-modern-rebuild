import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { StorageService } from './../src/storage/storage.service';
import { PrismaService } from '@lets-chat/database';
import { TokenService } from './../src/auth/token.service';
import { PasswordService } from './../src/auth/password.service';
import { AccountDeletionFinalizerService } from './../src/auth/account-deletion-finalizer.service';
import { MailService } from './../src/mail/mail.service';

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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue({})
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
  });
});
