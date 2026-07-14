import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { ListPinsQueryDto } from './dto/list-pins-query.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Pins')
@Controller('workspaces/:workspaceId/channels/:channelId')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class ChannelPinsController {
  constructor(private readonly messages: MessagesService) {}

  @Post('messages/:messageId/pin')
  @ApiOperation({ summary: 'Pin a channel message' })
  @ApiCreatedResponse({ description: 'Message pinned' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Channel or message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async pinMessage(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.messages.pinMessage(workspaceId, channelId, messageId, user.id);
  }

  @Delete('messages/:messageId/pin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unpin a channel message' })
  @ApiNoContentResponse({ description: 'Message unpinned' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Channel or message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async unpinMessage(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    await this.messages.unpinMessage(
      workspaceId,
      channelId,
      messageId,
      user.id,
    );
  }

  @Get('pins')
  @ApiOperation({ summary: 'List pinned channel messages' })
  @ApiOkResponse({ description: 'Pinned messages list' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listPins(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Query() query: ListPinsQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.messages.listPinnedMessages(
      workspaceId,
      channelId,
      user.id,
      query,
    );
  }
}
