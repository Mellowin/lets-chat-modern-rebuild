import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MessagesSearchService, SearchResult } from './messages-search.service';
import { SearchMessagesQueryDto } from './dto/search-messages-query.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Search')
@Controller('workspaces/:workspaceId/search')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class SearchController {
  constructor(private readonly search: MessagesSearchService) {}

  @Get('messages')
  @ApiOperation({ summary: 'Search messages in workspace' })
  @ApiOkResponse({ description: 'Search results' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Workspace or channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async searchMessages(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: SearchMessagesQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ): Promise<SearchResult[]> {
    return this.search.search(workspaceId, user.id, query);
  }
}
