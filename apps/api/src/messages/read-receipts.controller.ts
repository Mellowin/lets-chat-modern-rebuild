import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ReadReceiptsService } from './read-receipts.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Read Receipts')
@Controller('workspaces/:workspaceId/channels/:channelId/messages/:messageId')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class ReadReceiptsController {
  constructor(private readonly readReceipts: ReadReceiptsService) {}

  @Post('read')
  @ApiOperation({ summary: 'Mark message as read' })
  @ApiCreatedResponse({ description: 'Read receipt created or updated' })
  @ApiNotFoundResponse({ description: 'Message or channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async markAsRead(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.readReceipts.markAsRead(
      workspaceId,
      channelId,
      messageId,
      user.id,
    );
  }

  @Get('read-receipts')
  @ApiOperation({ summary: 'List read receipts for message' })
  @ApiOkResponse({ description: 'Read receipts list' })
  @ApiNotFoundResponse({ description: 'Message or channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.readReceipts.listReadReceipts(
      workspaceId,
      channelId,
      messageId,
      user.id,
    );
  }
}
