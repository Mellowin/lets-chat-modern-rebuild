import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessGuard } from './guards/jwt-access.guard';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const user = {
    id: 'user-id',
    email: 'u@test.com',
    username: 'user',
    displayName: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            refresh: jest.fn(),
            logout: jest.fn(),
            updateMe: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(AuthController);
    authService = moduleRef.get(AuthService);
  });

  it('PATCH /auth/me trims displayName and calls updateMe', async () => {
    authService.updateMe.mockResolvedValue({
      ...user,
      displayName: 'John Doe',
    } as any);

    await controller.updateMe(user as any, { displayName: '  John Doe  ' });

    expect(authService.updateMe).toHaveBeenCalledWith('user-id', 'John Doe');
  });

  it('PATCH /auth/me converts empty string to null', async () => {
    authService.updateMe.mockResolvedValue({
      ...user,
      displayName: null,
    } as any);

    await controller.updateMe(user as any, { displayName: '   ' });

    expect(authService.updateMe).toHaveBeenCalledWith('user-id', null);
  });
});
