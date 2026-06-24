import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { StorageService } from './../src/storage/storage.service';
import { PrismaService } from '@lets-chat/database';
import { TokenService } from './../src/auth/token.service';

interface ContactResponse {
  id: string;
  ownerUserId: string;
  contactUserId: string;
  username: string;
  displayName: string;
}

interface DirectConversationResponse {
  id: string;
  otherParticipant: {
    id: string;
    username: string;
  } | null;
}

describe('Contacts E2E Security', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokenService: TokenService;

  let userA: { id: string; email: string; username: string };
  let userB: { id: string; email: string; username: string };
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

    [userA, userB] = await Promise.all(
      ['a', 'b'].map((suffix) =>
        prisma.user.create({
          data: {
            email: `e2e-contacts-${suffix}@example.com`,
            username: `e2econtacts${suffix}`,
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
  });

  afterAll(async () => {
    await prisma.userContact.deleteMany({
      where: { ownerUserId: { in: [userA.id, userB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
    await app.close();
  });

  describe('contact lifecycle', () => {
    it('user can add a contact by userId', async () => {
      return request(app.getHttpServer())
        .post('/contacts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id })
        .expect(201)
        .then((res) => {
          const body = res.body as ContactResponse;
          expect(body.contactUserId).toBe(userB.id);
          expect(body.username).toBe(userB.username);
        });
    });

    it('adding the same contact is idempotent', async () => {
      return request(app.getHttpServer())
        .post('/contacts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userB.id })
        .expect(201)
        .then((res) => {
          const body = res.body as ContactResponse;
          expect(body.contactUserId).toBe(userB.id);
        });
    });

    it('lists the added contact', async () => {
      return request(app.getHttpServer())
        .get('/contacts')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .then((res) => {
          const body = res.body as ContactResponse[];
          expect(body.length).toBe(1);
          expect(body[0].contactUserId).toBe(userB.id);
        });
    });

    it('does not leak contacts between users', async () => {
      return request(app.getHttpServer())
        .get('/contacts')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200)
        .then((res) => {
          const body = res.body as ContactResponse[];
          expect(body.length).toBe(0);
        });
    });

    it('rejects adding self as a contact', async () => {
      return request(app.getHttpServer())
        .post('/contacts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: userA.id })
        .expect(400);
    });

    it('rejects adding a non-existent user', async () => {
      return request(app.getHttpServer())
        .post('/contacts')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });

    it('can start a DM with a contact', async () => {
      return request(app.getHttpServer())
        .post(`/contacts/${userB.id}/start-dm`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(201)
        .then((res) => {
          const body = res.body as DirectConversationResponse;
          expect(body.otherParticipant?.id).toBe(userB.id);
        });
    });

    it('cannot start a DM with a non-contact', async () => {
      return request(app.getHttpServer())
        .post(`/contacts/${userA.id}/start-dm`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('can remove a contact', async () => {
      await request(app.getHttpServer())
        .delete(`/contacts/${userB.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      return request(app.getHttpServer())
        .get('/contacts')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .then((res) => {
          const body = res.body as ContactResponse[];
          expect(body.length).toBe(0);
        });
    });
  });
});
