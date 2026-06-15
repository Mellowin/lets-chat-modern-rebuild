import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  MessagesSearchService,
  GlobalSearchResponse,
} from './messages-search.service';
import { SearchGlobalMessagesQueryDto } from './dto/search-global-messages-query.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Search')
@Controller('me/search')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class UserSearchController {
  // Global user message search entry point
  constructor(private readonly search: MessagesSearchService) {}

  @Get('messages')
  @ApiOperation({
    summary: 'Search all messages accessible to the current user',
  })
  @ApiOkResponse({ description: 'Search results' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async searchMessages(
    @Query() query: SearchGlobalMessagesQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ): Promise<GlobalSearchResponse> {
    return this.search.searchGlobal(user.id, query);
  }
}
