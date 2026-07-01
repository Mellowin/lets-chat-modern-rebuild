import { Test, type TestingModule } from '@nestjs/testing';
import { GlobalSearchController } from './global-search.controller';
import { MessagesSearchService } from './messages-search.service';
import type { AuthUserResponse } from '../auth/auth.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { SearchGlobalMessagesQueryDto } from './dto/search-global-messages-query.dto';

describe('GlobalSearchController', () => {
  let controller: GlobalSearchController;
  let searchService: jest.Mocked<MessagesSearchService>;

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
      controllers: [GlobalSearchController],
      providers: [
        {
          provide: MessagesSearchService,
          useValue: {
            searchGlobal: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(GlobalSearchController);
    searchService = moduleRef.get(MessagesSearchService);
  });

  describe('GET /search/messages', () => {
    it('delegates to search service with user id and query', async () => {
      const response = { items: [], nextCursor: null };
      searchService.searchGlobal.mockResolvedValue(response);

      const query: SearchGlobalMessagesQueryDto = { q: 'hello' };
      const result = await controller.searchMessages(query, user);

      expect(searchService.searchGlobal).toHaveBeenCalledWith(user.id, query);
      expect(result).toEqual(response);
    });

    it('passes scope and filters to search service', async () => {
      const response = { items: [], nextCursor: null };
      searchService.searchGlobal.mockResolvedValue(response);

      const query: SearchGlobalMessagesQueryDto = {
        q: 'hello',
        scope: 'group',
        groupId: 'group-id',
      };
      await controller.searchMessages(query, user);

      expect(searchService.searchGlobal).toHaveBeenCalledWith(user.id, query);
    });
  });
});
