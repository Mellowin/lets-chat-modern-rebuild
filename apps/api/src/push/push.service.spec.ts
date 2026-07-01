import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@lets-chat/database';
import * as webpush from 'web-push';
import { PushService } from './push.service';
import { PushRepository } from './push.repository';
import { BlocksService } from '../safety/blocks.service';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
  WebPushError: class WebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

const mockSubscription = {
  id: 'sub-1',
  userId: 'user-b',
  endpoint: 'https://push.example/1',
  p256dh: 'p256dh',
  auth: 'auth',
  userAgent: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const objectContaining = <T>(expected: T) =>
  expect.objectContaining(expected) as unknown as T;

describe('PushService', () => {
  let service: PushService;
  let configService: { get: jest.Mock };
  let pushRepository: {
    upsertSubscription: jest.Mock;
    deleteSubscription: jest.Mock;
    deleteByEndpoint: jest.Mock;
  };
  let prisma: {
    channel: { findUnique: jest.Mock };
    channelMember: { findMany: jest.Mock };
    directConversation: { findUnique: jest.Mock };
    groupConversation: { findUnique: jest.Mock };
    groupMember: { findMany: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let blocksService: { findBlockerIdsWhoBlockedUser: jest.Mock };

  beforeEach(async () => {
    configService = { get: jest.fn() };
    pushRepository = {
      upsertSubscription: jest.fn().mockResolvedValue(mockSubscription),
      deleteSubscription: jest.fn().mockResolvedValue({ count: 1 }),
      deleteByEndpoint: jest.fn().mockResolvedValue({ count: 1 }),
    };
    prisma = {
      channel: { findUnique: jest.fn() },
      channelMember: { findMany: jest.fn() },
      directConversation: { findUnique: jest.fn() },
      groupConversation: { findUnique: jest.fn() },
      groupMember: { findMany: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    blocksService = {
      findBlockerIdsWhoBlockedUser: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: ConfigService, useValue: configService },
        { provide: PushRepository, useValue: pushRepository },
        { provide: PrismaService, useValue: prisma },
        { provide: BlocksService, useValue: blocksService },
      ],
    }).compile();

    service = module.get<PushService>(PushService);
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('configures VAPID when keys are present', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'VAPID_PUBLIC_KEY') return 'public-key';
        if (key === 'VAPID_PRIVATE_KEY') return 'private-key';
        if (key === 'VAPID_SUBJECT') return 'mailto:test@example.com';
        return undefined;
      });

      service.onModuleInit();

      expect(webpush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:test@example.com',
        'public-key',
        'private-key',
      );
      expect(service.isVapidConfigured()).toBe(true);
    });

    it('does not configure VAPID when keys are missing', () => {
      configService.get.mockReturnValue(undefined);

      service.onModuleInit();

      expect(webpush.setVapidDetails).not.toHaveBeenCalled();
      expect(service.isVapidConfigured()).toBe(false);
    });
  });

  describe('saveSubscription', () => {
    it('upserts the subscription in the repository', async () => {
      const dto: CreatePushSubscriptionDto = {
        endpoint: 'https://push.example/1',
        keys: { p256dh: 'p256dh', auth: 'auth' },
      };

      await service.saveSubscription('user-a', dto);

      expect(pushRepository.upsertSubscription).toHaveBeenCalledWith('user-a', {
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      });
    });
  });

  describe('removeSubscription', () => {
    it('deletes the subscription by endpoint for the user', async () => {
      await service.removeSubscription('user-a', 'https://push.example/1');

      expect(pushRepository.deleteSubscription).toHaveBeenCalledWith(
        'user-a',
        'https://push.example/1',
      );
    });
  });

  describe('notifyChannelMessage', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'VAPID_PUBLIC_KEY') return 'public-key';
        if (key === 'VAPID_PRIVATE_KEY') return 'private-key';
        return undefined;
      });
      service.onModuleInit();
    });

    it('sends push notifications to channel members except the sender', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        name: 'general',
        workspaceId: 'workspace-1',
        workspace: { id: 'workspace-1', name: 'Acme' },
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        displayName: 'Alice',
        username: 'alice',
        interfaceLanguage: 'en',
      });
      prisma.channelMember.findMany.mockResolvedValue([
        {
          userId: 'user-b',
          user: {
            pushNotificationsEnabled: true,
            mentionNotificationsEnabled: true,
            directMessageNotificationsEnabled: true,
            groupMessageNotificationsEnabled: true,
            channelMessageNotificationsEnabled: true,
            role: 'USER',
            pushSubscriptions: [mockSubscription],
          },
        },
        {
          userId: 'user-c',
          user: {
            pushNotificationsEnabled: true,
            mentionNotificationsEnabled: true,
            directMessageNotificationsEnabled: true,
            groupMessageNotificationsEnabled: true,
            channelMessageNotificationsEnabled: true,
            role: 'USER',
            pushSubscriptions: [
              {
                ...mockSubscription,
                id: 'sub-2',
                userId: 'user-c',
                endpoint: 'https://push.example/2',
              },
            ],
          },
        },
      ]);

      await service.notifyChannelMessage('channel-1', {
        id: 'msg-1',
        content: 'Hello everyone',
        authorId: 'user-a',
      });

      expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
      const calls = (webpush.sendNotification as jest.Mock).mock.calls as [
        unknown,
        string,
      ][];
      const payload = JSON.parse(calls[0][1]) as {
        title: string;
        body: string;
        data: Record<string, unknown>;
      };
      expect(payload.title).toContain('Alice');
      expect(payload.title).toContain('#general');
      expect(payload.body).toBe('Hello everyone');
      expect(payload.data).toEqual({
        type: 'channel_message',
        workspaceId: 'workspace-1',
        channelId: 'channel-1',
        messageId: 'msg-1',
      });
    });

    it('does nothing when VAPID is not configured', async () => {
      configService.get.mockReturnValue(undefined);
      service.onModuleInit();

      await service.notifyChannelMessage('channel-1', {
        id: 'msg-1',
        content: 'Hello',
        authorId: 'user-a',
      });

      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });

    it('removes expired subscriptions when push service returns 410', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        name: 'general',
        workspaceId: 'workspace-1',
        workspace: { id: 'workspace-1', name: 'Acme' },
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        displayName: 'Alice',
        username: 'alice',
        interfaceLanguage: 'en',
      });
      prisma.channelMember.findMany.mockResolvedValue([
        {
          userId: 'user-b',
          user: {
            pushNotificationsEnabled: true,
            mentionNotificationsEnabled: true,
            directMessageNotificationsEnabled: true,
            groupMessageNotificationsEnabled: true,
            channelMessageNotificationsEnabled: true,
            role: 'USER',
            pushSubscriptions: [mockSubscription],
          },
        },
      ]);

      const error = new (webpush.WebPushError as unknown as new (
        message: string,
        statusCode: number,
      ) => Error)('Gone', 410);
      (webpush.sendNotification as jest.Mock).mockRejectedValue(error);

      await service.notifyChannelMessage('channel-1', {
        id: 'msg-1',
        content: 'Hello',
        authorId: 'user-a',
      });

      expect(pushRepository.deleteByEndpoint).toHaveBeenCalledWith(
        mockSubscription.endpoint,
      );
    });
  });

  describe('notifyDirectMessage', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'VAPID_PUBLIC_KEY') return 'public-key';
        if (key === 'VAPID_PRIVATE_KEY') return 'private-key';
        return undefined;
      });
      service.onModuleInit();
    });

    it('sends push notifications to the other participant only', async () => {
      prisma.directConversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        participants: [
          {
            userId: 'user-a',
            user: {
              pushNotificationsEnabled: true,
              mentionNotificationsEnabled: true,
              directMessageNotificationsEnabled: true,
              groupMessageNotificationsEnabled: true,
              channelMessageNotificationsEnabled: true,
              role: 'USER',
              pushSubscriptions: [],
            },
          },
          {
            userId: 'user-b',
            user: {
              pushNotificationsEnabled: true,
              mentionNotificationsEnabled: true,
              directMessageNotificationsEnabled: true,
              groupMessageNotificationsEnabled: true,
              channelMessageNotificationsEnabled: true,
              role: 'USER',
              pushSubscriptions: [mockSubscription],
            },
          },
        ],
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        displayName: 'Alice',
        username: 'alice',
        interfaceLanguage: 'en',
      });

      await service.notifyDirectMessage('conv-1', {
        id: 'msg-1',
        content: 'Hi!',
        authorId: 'user-a',
      });

      expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
      const calls = (webpush.sendNotification as jest.Mock).mock.calls as [
        unknown,
        string,
      ][];
      const payload = JSON.parse(calls[0][1]) as {
        title: string;
        body: string;
        data: Record<string, unknown>;
      };
      expect(payload.title).toBe('Alice');
      expect(payload.body).toBe('Hi!');
      expect(payload.data).toEqual({
        type: 'direct_message',
        conversationId: 'conv-1',
        messageId: 'msg-1',
      });
    });
  });

  describe('notifyGroupMessage', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'VAPID_PUBLIC_KEY') return 'public-key';
        if (key === 'VAPID_PRIVATE_KEY') return 'private-key';
        return undefined;
      });
      service.onModuleInit();
    });

    function makeGroupSubscription(userId: string, subId: string) {
      return {
        ...mockSubscription,
        id: subId,
        userId,
        endpoint: `https://push.example/${subId}`,
      };
    }

    it('sends push notifications to group members except sender', async () => {
      prisma.groupConversation.findUnique.mockResolvedValue({
        id: 'group-1',
        archivedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        displayName: 'Alice',
        username: 'alice',
        interfaceLanguage: 'en',
      });
      prisma.groupMember.findMany.mockResolvedValue([
        {
          userId: 'user-b',
          user: {
            id: 'user-b',
            interfaceLanguage: 'en',
            pushNotificationsEnabled: true,
            mentionNotificationsEnabled: true,
            directMessageNotificationsEnabled: true,
            groupMessageNotificationsEnabled: true,
            channelMessageNotificationsEnabled: true,
            role: 'USER',
            pushSubscriptions: [makeGroupSubscription('user-b', 'sub-b')],
          },
        },
        {
          userId: 'user-c',
          user: {
            id: 'user-c',
            interfaceLanguage: 'en',
            pushNotificationsEnabled: true,
            mentionNotificationsEnabled: true,
            directMessageNotificationsEnabled: true,
            groupMessageNotificationsEnabled: true,
            channelMessageNotificationsEnabled: true,
            role: 'USER',
            pushSubscriptions: [makeGroupSubscription('user-c', 'sub-c')],
          },
        },
      ]);

      await service.notifyGroupMessage('group-1', {
        id: 'msg-1',
        content: 'Hello group',
        authorId: 'user-a',
      });

      expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('uses English localized title and body by default', async () => {
      prisma.groupConversation.findUnique.mockResolvedValue({
        id: 'group-1',
        archivedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        displayName: 'Alice',
        username: 'alice',
        interfaceLanguage: 'en',
      });
      prisma.groupMember.findMany.mockResolvedValue([
        {
          userId: 'user-b',
          user: {
            id: 'user-b',
            interfaceLanguage: 'en',
            pushNotificationsEnabled: true,
            mentionNotificationsEnabled: true,
            directMessageNotificationsEnabled: true,
            groupMessageNotificationsEnabled: true,
            channelMessageNotificationsEnabled: true,
            role: 'USER',
            pushSubscriptions: [makeGroupSubscription('user-b', 'sub-b')],
          },
        },
      ]);

      await service.notifyGroupMessage('group-1', {
        id: 'msg-1',
        content: 'Hello group',
        authorId: 'user-a',
      });

      const calls = (webpush.sendNotification as jest.Mock).mock.calls as [
        unknown,
        string,
      ][];
      const payload = JSON.parse(calls[0][1]) as {
        title: string;
        body: string;
        data: Record<string, unknown>;
      };
      expect(payload.title).toBe('Alice: New group message');
      expect(payload.body).toBe('Hello group');
      expect(payload.data).toEqual({
        type: 'group_message',
        groupId: 'group-1',
        messageId: 'msg-1',
      });
    });

    it('uses Ukrainian localized title and body for uk locale', async () => {
      prisma.groupConversation.findUnique.mockResolvedValue({
        id: 'group-1',
        archivedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        displayName: 'Alice',
        username: 'alice',
        interfaceLanguage: 'en',
      });
      prisma.groupMember.findMany.mockResolvedValue([
        {
          userId: 'user-b',
          user: {
            id: 'user-b',
            interfaceLanguage: 'uk',
            pushNotificationsEnabled: true,
            mentionNotificationsEnabled: true,
            directMessageNotificationsEnabled: true,
            groupMessageNotificationsEnabled: true,
            channelMessageNotificationsEnabled: true,
            role: 'USER',
            pushSubscriptions: [makeGroupSubscription('user-b', 'sub-b')],
          },
        },
      ]);

      await service.notifyGroupMessage('group-1', {
        id: 'msg-1',
        content: 'Hello group',
        authorId: 'user-a',
      });

      const calls = (webpush.sendNotification as jest.Mock).mock.calls as [
        unknown,
        string,
      ][];
      const payload = JSON.parse(calls[0][1]) as {
        title: string;
        body: string;
        data: Record<string, unknown>;
      };
      expect(payload.title).toBe('Alice: нове повідомлення в групі');
      expect(payload.body).toBe('Hello group');
      expect(payload.data).toEqual({
        type: 'group_message',
        groupId: 'group-1',
        messageId: 'msg-1',
      });
    });

    it('does not notify non-members', async () => {
      prisma.groupConversation.findUnique.mockResolvedValue({
        id: 'group-1',
        archivedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        displayName: 'Alice',
        username: 'alice',
        interfaceLanguage: 'en',
      });
      prisma.groupMember.findMany.mockResolvedValue([]);

      await service.notifyGroupMessage('group-1', {
        id: 'msg-1',
        content: 'Hello group',
        authorId: 'user-a',
      });

      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });

    it('does not notify removed or left members', async () => {
      prisma.groupConversation.findUnique.mockResolvedValue({
        id: 'group-1',
        archivedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        displayName: 'Alice',
        username: 'alice',
        interfaceLanguage: 'en',
      });
      prisma.groupMember.findMany.mockResolvedValue([]);

      await service.notifyGroupMessage('group-1', {
        id: 'msg-1',
        content: 'Hello group',
        authorId: 'user-a',
      });

      expect(webpush.sendNotification).not.toHaveBeenCalled();
      expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
        objectContaining({
          where: objectContaining({ leftAt: null }),
        }),
      );
    });

    it('does not notify archived groups', async () => {
      prisma.groupConversation.findUnique.mockResolvedValue({
        id: 'group-1',
        archivedAt: new Date(),
      });

      await service.notifyGroupMessage('group-1', {
        id: 'msg-1',
        content: 'Hello group',
        authorId: 'user-a',
      });

      expect(webpush.sendNotification).not.toHaveBeenCalled();
      expect(prisma.groupMember.findMany).not.toHaveBeenCalled();
    });

    it('payload data contains type, groupId, and messageId only', async () => {
      prisma.groupConversation.findUnique.mockResolvedValue({
        id: 'group-1',
        archivedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        displayName: 'Alice',
        username: 'alice',
        interfaceLanguage: 'en',
      });
      prisma.groupMember.findMany.mockResolvedValue([
        {
          userId: 'user-b',
          user: {
            id: 'user-b',
            interfaceLanguage: 'en',
            pushNotificationsEnabled: true,
            mentionNotificationsEnabled: true,
            directMessageNotificationsEnabled: true,
            groupMessageNotificationsEnabled: true,
            channelMessageNotificationsEnabled: true,
            role: 'USER',
            pushSubscriptions: [makeGroupSubscription('user-b', 'sub-b')],
          },
        },
      ]);

      await service.notifyGroupMessage('group-1', {
        id: 'msg-1',
        content: 'Hello group',
        authorId: 'user-a',
      });

      const calls = (webpush.sendNotification as jest.Mock).mock.calls as [
        unknown,
        string,
      ][];
      const payload = JSON.parse(calls[0][1]) as {
        data: Record<string, unknown>;
      };
      expect(Object.keys(payload.data)).toEqual([
        'type',
        'groupId',
        'messageId',
      ]);
      expect(payload.data).not.toHaveProperty('tokens');
      expect(payload.data).not.toHaveProperty('fileUrl');
    });

    it('does nothing when VAPID is not configured', async () => {
      configService.get.mockReturnValue(undefined);
      service.onModuleInit();

      await service.notifyGroupMessage('group-1', {
        id: 'msg-1',
        content: 'Hello group',
        authorId: 'user-a',
      });

      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });
  });
});
