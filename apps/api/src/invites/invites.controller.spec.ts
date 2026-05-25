import { Test } from '@nestjs/testing';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';

describe('InvitesController', () => {
  let controller: InvitesController;
  let invitesService: jest.Mocked<InvitesService>;

  const user = {
    id: 'user-id',
    email: 'u@test.com',
    username: 'user',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InvitesController],
      providers: [
        {
          provide: InvitesService,
          useValue: {
            list: jest.fn(),
            create: jest.fn(),
            revoke: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(InvitesController);
    invitesService = moduleRef.get(InvitesService);
  });

  it('should call list service method', async () => {
    invitesService.list.mockResolvedValue([]);
    await controller.list('workspace-id', user as any);
    expect(invitesService.list).toHaveBeenCalledWith('workspace-id', 'user-id');
  });

  it('should call create service method', async () => {
    invitesService.create.mockResolvedValue({} as any);
    await controller.create(
      'workspace-id',
      { email: 'test@test.com', role: 'MEMBER' },
      user as any,
    );
    expect(invitesService.create).toHaveBeenCalledWith(
      'workspace-id',
      { email: 'test@test.com', role: 'MEMBER' },
      'user-id',
    );
  });
});
