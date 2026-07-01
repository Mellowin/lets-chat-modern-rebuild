import { Test } from '@nestjs/testing';
import { InvitesAcceptController } from './invites-accept.controller';
import { InvitesService } from './invites.service';
import type { AuthUserResponse } from '../auth/auth.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';

describe('InvitesAcceptController', () => {
  let controller: InvitesAcceptController;
  let invitesService: jest.Mocked<InvitesService>;

  const user: AuthUserResponse = {
    id: 'user-id',
    email: 'u@test.com',
    username: 'user',
    displayName: null,
    avatarUrl: null,
    avatarUpdatedAt: null,
    interfaceLanguage: 'en',
    createdAt: new Date(),
    pushNotificationsEnabled: true,
    mentionNotificationsEnabled: true,
    directMessageNotificationsEnabled: true,
    groupMessageNotificationsEnabled: true,
    channelMessageNotificationsEnabled: true,
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InvitesAcceptController],
      providers: [
        {
          provide: InvitesService,
          useValue: {
            listPending: jest.fn(),
            acceptById: jest.fn(),
            decline: jest.fn(),
            accept: jest.fn(),
            preview: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(InvitesAcceptController);
    invitesService = moduleRef.get(InvitesService);
  });

  it('should call listPending service method', async () => {
    invitesService.listPending.mockResolvedValue([]);
    await controller.listPending(user);
    expect(invitesService.listPending).toHaveBeenCalledWith(
      'user-id',
      'u@test.com',
    );
  });

  it('should call acceptById service method', async () => {
    invitesService.acceptById.mockResolvedValue({
      workspaceId: 'ws-id',
      role: 'MEMBER',
      joinedAt: new Date(),
    });
    await controller.acceptById('invite-id', user);
    expect(invitesService.acceptById).toHaveBeenCalledWith(
      'invite-id',
      'user-id',
      'u@test.com',
    );
  });

  it('should call decline service method', async () => {
    invitesService.decline.mockResolvedValue({
      id: 'invite-id',
      deletedAt: new Date(),
    });
    await controller.decline('invite-id', user);
    expect(invitesService.decline).toHaveBeenCalledWith(
      'invite-id',
      'user-id',
      'u@test.com',
    );
  });

  it('should call accept service method', async () => {
    invitesService.accept.mockResolvedValue({
      workspaceId: 'ws-id',
      role: 'MEMBER',
      joinedAt: new Date(),
    });
    await controller.accept({ token: 'token123' }, user);
    expect(invitesService.accept).toHaveBeenCalledWith(
      'token123',
      'user-id',
      'u@test.com',
    );
  });

  it('should call preview service method', async () => {
    invitesService.preview.mockResolvedValue({
      workspaceName: 'Test Workspace',
      expiresAt: new Date(Date.now() + 86400000),
      valid: true,
    });
    const result = await controller.preview('token123');
    expect(invitesService.preview).toHaveBeenCalledWith('token123');
    expect(result.valid).toBe(true);
  });
});
