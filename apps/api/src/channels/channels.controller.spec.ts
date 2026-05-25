import { Test } from '@nestjs/testing';
import { GoneException } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';

describe('ChannelsController', () => {
  let controller: ChannelsController;
  let channelsService: jest.Mocked<ChannelsService>;

  const user = {
    id: 'user-id',
    email: 'u@test.com',
    username: 'user',
    displayName: null,
    createdAt: new Date(),
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
          { identifier: 'alice', role: 'MEMBER' } as any,
          user as any,
        ),
      ).rejects.toBeInstanceOf(GoneException);

      await expect(
        controller.addMember(
          'workspace-id',
          'channel-id',
          { identifier: 'alice', role: 'MEMBER' } as any,
          user as any,
        ),
      ).rejects.toThrow('Use channel invitations to add members');
    });

    it('should not call channels.addChannelMember', async () => {
      try {
        await controller.addMember(
          'workspace-id',
          'channel-id',
          { identifier: 'alice', role: 'MEMBER' } as any,
          user as any,
        );
      } catch {
        // expected
      }
      expect(channelsService.addChannelMember).not.toHaveBeenCalled();
    });
  });
});
