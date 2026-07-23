import { Test } from '@nestjs/testing';
import { WebsocketEventsService } from './websocket-events.service';
import { WebsocketGateway } from './websocket.gateway';
import {
  ForwardPermissionsHelper,
  ForwardedFromPayload,
} from '../messages/forward-permissions.helper';

describe('WebsocketEventsService', () => {
  let service: WebsocketEventsService;
  let gateway: jest.Mocked<WebsocketGateway>;
  let forwardPermissions: jest.Mocked<ForwardPermissionsHelper>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebsocketEventsService,
        {
          provide: WebsocketGateway,
          useValue: {
            broadcastToRoom: jest.fn(),
          },
        },
        {
          provide: ForwardPermissionsHelper,
          useValue: {
            maskResponse: jest.fn((value: ForwardedFromPayload | undefined) =>
              value
                ? {
                    sourceType: value.sourceType,
                    originalCreatedAt: value.originalCreatedAt,
                    isAnonymous: true as const,
                  }
                : undefined,
            ),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(WebsocketEventsService);
    gateway = moduleRef.get(WebsocketGateway);
    forwardPermissions = moduleRef.get(ForwardPermissionsHelper);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const fullForwardedFrom: ForwardedFromPayload = {
    sourceType: 'channel',
    sourceMessageId: 'orig-msg',
    sourceChatId: 'orig-channel',
    originalAuthorId: 'u1',
    originalAuthorName: 'Alice',
    originalCreatedAt: '2024-01-01T00:00:00Z',
  };

  function getEmittedForwardedFrom(
    callIndex = 0,
  ): Record<string, unknown> | undefined {
    const payload = gateway.broadcastToRoom.mock.calls[callIndex][2] as {
      forwardedFrom?: Record<string, unknown>;
    };
    return payload.forwardedFrom;
  }

  describe('broadcastMessageCreated', () => {
    it('emits an anonymous forwardedFrom payload to the channel room', () => {
      const payload = {
        id: 'msg-1',
        channelId: 'ch-1',
        content: 'hello',
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        author: {
          id: 'u1',
          username: 'alice',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [] as Array<{
          emoji: string;
          count: number;
          reactedByMe: boolean;
        }>,
        replyToMessageId: null,
        replyTo: null,
        forwardedFrom: fullForwardedFrom,
      };

      service.broadcastMessageCreated('ch-1', payload);

      expect(gateway.broadcastToRoom).toHaveBeenCalledWith(
        'channel:ch-1',
        'message:created',
        expect.anything(),
      );
      const emitted = getEmittedForwardedFrom();
      expect(emitted).not.toHaveProperty('sourceMessageId');
      expect(emitted).not.toHaveProperty('sourceChatId');
      expect(emitted).not.toHaveProperty('originalAuthorId');
      expect(emitted).not.toHaveProperty('originalAuthorName');
      expect(emitted).toHaveProperty('sourceType');
      expect(emitted).toHaveProperty('originalCreatedAt');
    });

    it('does not add forwardedFrom when the message is not a forward', () => {
      const payload = {
        id: 'msg-2',
        channelId: 'ch-1',
        content: 'hello',
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        author: {
          id: 'u1',
          username: 'alice',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [] as Array<{
          emoji: string;
          count: number;
          reactedByMe: boolean;
        }>,
        replyToMessageId: null,
        replyTo: null,
      };

      service.broadcastMessageCreated('ch-1', payload);

      expect(gateway.broadcastToRoom).toHaveBeenCalledWith(
        'channel:ch-1',
        'message:created',
        payload,
      );
      expect(forwardPermissions.maskResponse).not.toHaveBeenCalled();
    });
  });

  describe('broadcastDirectMessageCreated', () => {
    it('emits an anonymous forwardedFrom payload to the direct conversation room', () => {
      const payload = {
        id: 'dm-1',
        conversationId: 'conv-1',
        content: 'hi',
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        author: {
          id: 'u1',
          username: 'alice',
          displayName: null,
          avatarUrl: null,
        },
        parent: null,
        replyToMessageId: null,
        replyTo: null,
        forwardedFrom: fullForwardedFrom,
      };

      service.broadcastDirectMessageCreated('conv-1', payload);

      expect(getEmittedForwardedFrom()).toEqual({
        sourceType: fullForwardedFrom.sourceType,
        originalCreatedAt: fullForwardedFrom.originalCreatedAt,
        isAnonymous: true,
      });
    });
  });

  describe('broadcastGroupMessageCreated', () => {
    it('emits an anonymous forwardedFrom payload to the group room', () => {
      const payload = {
        id: 'gm-1',
        groupId: 'group-1',
        content: 'hi',
        createdAt: new Date(),
        updatedAt: new Date(),
        author: {
          id: 'u1',
          username: 'alice',
          displayName: null,
          avatarUrl: null,
        },
        replyToMessageId: null,
        replyTo: null,
        forwardedFrom: fullForwardedFrom,
      };

      service.broadcastGroupMessageCreated('group-1', payload);

      expect(getEmittedForwardedFrom()).toEqual({
        sourceType: fullForwardedFrom.sourceType,
        originalCreatedAt: fullForwardedFrom.originalCreatedAt,
        isAnonymous: true,
      });
    });
  });

  describe('broadcastDirectConversationUpdated', () => {
    it('masks forwardedFrom in per-recipient conversation updates', () => {
      const payload = {
        id: 'dm-1',
        conversationId: 'conv-1',
        content: 'hi',
        forwardedFrom: fullForwardedFrom,
      };

      service.broadcastDirectConversationUpdated('conv-1', payload, [
        'u1',
        'u2',
      ]);

      expect(gateway.broadcastToRoom).toHaveBeenCalledTimes(2);
      const emitted = gateway.broadcastToRoom.mock.calls[0][2] as {
        forwardedFrom?: Record<string, unknown>;
      };
      expect(emitted.forwardedFrom).toEqual({
        sourceType: fullForwardedFrom.sourceType,
        originalCreatedAt: fullForwardedFrom.originalCreatedAt,
        isAnonymous: true,
      });
    });
  });

  describe('broadcastGroupConversationUpdated', () => {
    it('masks forwardedFrom in per-recipient group conversation updates', () => {
      const payload = {
        id: 'gm-1',
        groupId: 'group-1',
        content: 'hi',
        forwardedFrom: fullForwardedFrom,
      };

      service.broadcastGroupConversationUpdated('group-1', payload, [
        'u1',
        'u2',
      ]);

      expect(gateway.broadcastToRoom).toHaveBeenCalledTimes(2);
      const emitted = gateway.broadcastToRoom.mock.calls[0][2] as {
        forwardedFrom?: Record<string, unknown>;
      };
      expect(emitted.forwardedFrom).toEqual({
        sourceType: fullForwardedFrom.sourceType,
        originalCreatedAt: fullForwardedFrom.originalCreatedAt,
        isAnonymous: true,
      });
    });
  });
});
