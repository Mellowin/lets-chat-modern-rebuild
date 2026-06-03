import { Test, type TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;
  const accessSecret = 'test-access-secret-min-32-characters';
  const refreshSecret = 'test-refresh-secret-min-32-characters';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [
            () => ({
              JWT_ACCESS_SECRET: accessSecret,
              JWT_REFRESH_SECRET: refreshSecret,
              JWT_ACCESS_EXPIRES_IN: '15m',
              JWT_REFRESH_EXPIRES_IN: '7d',
            }),
          ],
        }),
        JwtModule.register({}),
      ],
      providers: [TokenService],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  describe('verifyAccessToken', () => {
    it('should accept a valid access token', async () => {
      const payload = { sub: 'user-id', email: 'u@test.com', jti: 'jti-1' };
      const token = await service.signAccessToken(payload);
      const decoded = await service.verifyAccessToken(token);
      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.email).toBe(payload.email);
    });

    it('should reject an expired access token', async () => {
      const jwtService = new JwtService({ secret: accessSecret });
      const expiredToken = jwtService.sign({
        sub: 'user-id',
        email: 'u@test.com',
        jti: 'jti-2',
        exp: Math.floor(Date.now() / 1000) - 60,
      });

      await expect(service.verifyAccessToken(expiredToken)).rejects.toThrow();
    });

    it('should reject a malformed access token', async () => {
      await expect(
        service.verifyAccessToken('not-a-valid-token'),
      ).rejects.toThrow();
    });

    it('should reject a token signed with a different secret', async () => {
      const jwtService = new JwtService({
        secret: 'wrong-secret-min-32-characters',
      });
      const wrongToken = jwtService.sign({ sub: 'user-id' });
      await expect(service.verifyAccessToken(wrongToken)).rejects.toThrow();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should accept a valid refresh token', async () => {
      const payload = { sub: 'user-id', email: 'u@test.com', jti: 'jti-3' };
      const token = await service.signRefreshToken(payload);
      const decoded = await service.verifyRefreshToken(token);
      expect(decoded.sub).toBe(payload.sub);
    });

    it('should reject an expired refresh token', async () => {
      const jwtService = new JwtService({ secret: refreshSecret });
      const expiredToken = jwtService.sign({
        sub: 'user-id',
        email: 'u@test.com',
        jti: 'jti-4',
        exp: Math.floor(Date.now() / 1000) - 60,
      });
      await expect(service.verifyRefreshToken(expiredToken)).rejects.toThrow();
    });
  });
});
