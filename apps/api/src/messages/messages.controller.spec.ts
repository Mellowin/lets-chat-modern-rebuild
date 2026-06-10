import { Test, type TestingModule } from '@nestjs/testing';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { AttachmentsService } from './attachments.service';
import type { AuthUserResponse } from '../auth/auth.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';

describe('MessagesController', () => {
  let controller: MessagesController;
  let messagesService: jest.Mocked<MessagesService>;

  const user: AuthUserResponse = {
    id: 'user-id',
    email: 'u@test.com',
    username: 'user',
    displayName: null,
    avatarUrl: null,
    avatarUpdatedAt: null,
    interfaceLanguage: 'en',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [
        {
          provide: MessagesService,
          useValue: {
            create: jest.fn(),
            list: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            searchChannelMessages: jest.fn(),
            getContext: jest.fn(),
          },
        },
        {
          provide: AttachmentsService,
          useValue: {
            prepareUpload: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(MessagesController);
    messagesService = moduleRef.get(MessagesService);
  });

  describe('GET workspaces/:workspaceId/channels/:channelId/messages/search', () => {
    it('calls searchChannelMessages with correct params', async () => {
      messagesService.searchChannelMessages.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      const result = await controller.search(
        'workspace-id',
        'channel-id',
        { q: 'hello', limit: 10 },
        user,
      );

      expect(messagesService.searchChannelMessages).toHaveBeenCalledWith(
        'workspace-id',
        'channel-id',
        user.id,
        { q: 'hello', limit: 10 },
      );
      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('GET workspaces/:workspaceId/channels/:channelId/messages/:messageId/context', () => {
    it('calls getContext with correct params', async () => {
      messagesService.getContext.mockResolvedValue({
        target: { id: 'msg-1', content: 'hello' } as unknown as Awaited<
          ReturnType<MessagesService['getContext']>
        >['target'],
        before: [],
        after: [],
        hasMoreBefore: false,
        hasMoreAfter: false,
      });

      const result = await controller.getContext(
        'workspace-id',
        'channel-id',
        'msg-1',
        { before: 10, after: 10 },
        user,
      );

      expect(messagesService.getContext).toHaveBeenCalledWith(
        'workspace-id',
        'channel-id',
        'msg-1',
        user.id,
        { before: 10, after: 10 },
      );
      expect(result.before).toEqual([]);
      expect(result.after).toEqual([]);
    });
  });
});
