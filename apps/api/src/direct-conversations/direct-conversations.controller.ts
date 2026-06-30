import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DirectConversationsService } from './direct-conversations.service';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { CreateDirectReactionDto } from './dto/create-direct-reaction.dto';
import { UpdateDirectMessageDto } from './dto/update-direct-message.dto';
import { ListDirectMessagesQueryDto } from './dto/list-direct-messages-query.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Direct Conversations')
@Controller('direct-conversations')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class DirectConversationsController {
  constructor(
    private readonly directConversations: DirectConversationsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create or open a direct conversation' })
  @ApiCreatedResponse({
    description: 'Direct conversation created or returned',
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Body() dto: CreateDirectConversationDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List my direct conversations' })
  @ApiOkResponse({ description: 'Direct conversations list' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(@CurrentUser() user: AuthUserResponse) {
    return this.directConversations.list(user.id);
  }

  @Get(':conversationId/messages')
  @ApiOperation({ summary: 'List messages in a direct conversation' })
  @ApiOkResponse({ description: 'Messages list' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findMessages(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: ListDirectMessagesQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.listMessages(
      conversationId,
      user.id,
      query,
    );
  }

  @Post(':conversationId/messages')
  @ApiOperation({ summary: 'Send a direct message' })
  @ApiCreatedResponse({ description: 'Direct message sent' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async createMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: CreateDirectMessageDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.createMessage(conversationId, dto, user.id);
  }

  @Post(':conversationId/read')
  @ApiOperation({ summary: 'Mark direct conversation as read' })
  @ApiOkResponse({ description: 'Conversation marked as read' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async markAsRead(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.markAsRead(conversationId, user.id);
  }

  @Post(':conversationId/messages/:messageId/reactions')
  @ApiOperation({ summary: 'Add reaction to direct message' })
  @ApiCreatedResponse({ description: 'Reaction added' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiNotFoundResponse({ description: 'Message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async addReaction(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: CreateDirectReactionDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.addReaction(
      conversationId,
      messageId,
      dto,
      user.id,
    );
  }

  @Patch(':conversationId/messages/:messageId')
  @ApiOperation({ summary: 'Edit own direct message' })
  @ApiOkResponse({ description: 'Message updated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiNotFoundResponse({ description: 'Message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async updateMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: UpdateDirectMessageDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.updateMessage(
      conversationId,
      messageId,
      user.id,
      dto.content,
    );
  }

  @Delete(':conversationId/messages/:messageId')
  @ApiOperation({ summary: 'Delete own direct message' })
  @ApiOkResponse({ description: 'Message deleted' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiNotFoundResponse({ description: 'Message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async deleteMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.deleteMessage(
      conversationId,
      messageId,
      user.id,
    );
  }

  @Delete(':conversationId/messages/:messageId/reactions/:emoji')
  @ApiOperation({ summary: 'Remove own reaction from direct message' })
  @ApiOkResponse({ description: 'Reaction removed' })
  @ApiBadRequestResponse({ description: 'Invalid emoji' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiNotFoundResponse({ description: 'Message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async removeReaction(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('emoji') emoji: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.removeReaction(
      conversationId,
      messageId,
      emoji,
      user.id,
    );
  }
}
