import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
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
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ReactionsService } from './reactions.service';
import { CreateReactionDto } from './dto/create-reaction.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Reactions')
@Controller(
  'workspaces/:workspaceId/channels/:channelId/messages/:messageId/reactions',
)
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class ReactionsController {
  constructor(private readonly reactions: ReactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Add or toggle reaction on message' })
  @ApiCreatedResponse({ description: 'Reaction summary after add/toggle' })
  @ApiNotFoundResponse({ description: 'Message or channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: CreateReactionDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.reactions.addReaction(
      workspaceId,
      channelId,
      messageId,
      dto,
      user.id,
    );
  }

  @Delete(':emoji')
  @ApiOperation({ summary: 'Remove own reaction' })
  @ApiOkResponse({ description: 'Reaction summary after removal' })
  @ApiBadRequestResponse({ description: 'Invalid emoji' })
  @ApiNotFoundResponse({ description: 'Reaction or message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async remove(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('emoji') emoji: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.reactions.removeReaction(
      workspaceId,
      channelId,
      messageId,
      emoji,
      user.id,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List reactions for message' })
  @ApiOkResponse({ description: 'Reactions list' })
  @ApiNotFoundResponse({ description: 'Message or channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.reactions.listReactions(
      workspaceId,
      channelId,
      messageId,
      user.id,
    );
  }
}
