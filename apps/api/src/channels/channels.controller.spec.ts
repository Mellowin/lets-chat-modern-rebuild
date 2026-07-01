import { Test } from '@nestjs/testing';
import { GoneException } from '@nestjs/common';
import { ChannelRole } from '@lets-chat/database';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import type { AuthUserResponse } from '../auth/auth.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';

describe('ChannelsController', () => {
  let controller: ChannelsController;
  let channelsService: jest.Mocked<ChannelsService>;

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
      controllers: [ChannelsController],
      providers: [
        {
          provide: ChannelsService,
          useValue: {
            addChannelMember: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(ChannelsController);
    channelsService = moduleRef.get(ChannelsService);
  });

  describe('addMember', () => {
    it('should throw GoneException with message about channel invitations', async () => {
      await expect(
        controller.addMember(
          'workspace-id',
          'channel-id',
          { identifier: 'alice', role: ChannelRole.MEMBER },
          user,
        ),
      ).rejects.toBeInstanceOf(GoneException);

      await expect(
        controller.addMember(
          'workspace-id',
          'channel-id',
          { identifier: 'alice', role: ChannelRole.MEMBER },
          user,
        ),
      ).rejects.toThrow('Use channel invitations to add members');
    });

    it('should not call channels.addChannelMember', async () => {
      try {
        await controller.addMember(
          'workspace-id',
          'channel-id',
          { identifier: 'alice', role: ChannelRole.MEMBER },
          user,
        );
      } catch {
        // expected
      }
      expect(channelsService.addChannelMember).not.toHaveBeenCalled();
    });
  });
});
