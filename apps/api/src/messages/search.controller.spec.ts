import { Test, type TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { MessagesSearchService } from './messages-search.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import type { AuthUserResponse } from '../auth/auth.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { NotFoundException } from '@nestjs/common';
import { SearchMessagesQueryDto } from './dto/search-messages-query.dto';

describe('SearchController', () => {
  let controller: SearchController;
  let searchService: jest.Mocked<MessagesSearchService>;
  let workspacesService: jest.Mocked<WorkspacesService>;

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
    role: 'USER',
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        {
          provide: MessagesSearchService,
          useValue: {
            search: jest.fn(),
          },
        },
        {
          provide: WorkspacesService,
          useValue: {
            findById: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(SearchController);
    searchService = moduleRef.get(MessagesSearchService);
    workspacesService = moduleRef.get(WorkspacesService);
  });

  describe('GET workspaces/:workspaceId/search/messages', () => {
    it('checks workspace access before searching', async () => {
      workspacesService.findById.mockResolvedValue({
        id: 'workspace-id',
      } as Awaited<ReturnType<typeof workspacesService.findById>>);
      searchService.search.mockResolvedValue([]);

      const query: SearchMessagesQueryDto = { q: 'hello' };
      const result = await controller.searchMessages(
        'workspace-id',
        query,
        user,
      );

      expect(workspacesService.findById).toHaveBeenCalledWith(
        'workspace-id',
        user.id,
      );
      expect(searchService.search).toHaveBeenCalledWith(
        'workspace-id',
        user.id,
        query,
      );
      expect(result).toEqual([]);
    });

    it('throws NotFoundException when workspace is deleted or user is not a member', async () => {
      workspacesService.findById.mockRejectedValue(
        new NotFoundException('Workspace not found'),
      );

      await expect(
        controller.searchMessages('workspace-id', { q: 'hello' }, user),
      ).rejects.toThrow(NotFoundException);

      expect(searchService.search).not.toHaveBeenCalled();
    });
  });
});
