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
  UploadedFile,
  UseInterceptors,
  Res,
  StreamableFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
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
import { DirectMessageContextQueryDto } from './dto/message-context-query.dto';
import { ListPinsQueryDto } from '../messages/dto/list-pins-query.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../messages/attachment-validation';

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

  @Get(':conversationId/messages/:messageId/context')
  @ApiOperation({ summary: 'Get direct message context' })
  @ApiOkResponse({ description: 'Message context' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiNotFoundResponse({ description: 'Message or conversation not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getMessageContext(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Query() query: DirectMessageContextQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.getMessageContext(
      conversationId,
      messageId,
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

  @Post(':conversationId/messages/attachments/upload')
  @ApiOperation({
    summary: 'Upload a direct message attachment through the API proxy',
  })
  @ApiCreatedResponse({ description: 'Attachment uploaded' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_ATTACHMENT_SIZE_BYTES,
      },
    }),
  )
  async uploadAttachment(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.uploadAttachment(
      conversationId,
      file,
      user.id,
    );
  }

  @Get(':conversationId/messages/:messageId/attachments/:attachmentId/file')
  @ApiOperation({
    summary: 'Download direct message attachment file through API proxy',
  })
  @ApiOkResponse({ description: 'Attachment file content' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiNotFoundResponse({ description: 'Attachment or message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async downloadAttachmentFile(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUserResponse,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { encodeContentDisposition } =
      await import('../messages/attachments.service.js');
    const file = await this.directConversations.downloadAttachmentFile(
      conversationId,
      messageId,
      attachmentId,
      user.id,
    );

    res.setHeader('Content-Type', file.mimeType);
    if (file.contentLength > 0) {
      res.setHeader('Content-Length', String(file.contentLength));
    }
    res.setHeader(
      'Content-Disposition',
      encodeContentDisposition(file.filename),
    );

    return new StreamableFile(file.body, {
      type: file.mimeType,
    });
  }

  @Post(':conversationId/messages/:messageId/pin')
  @ApiOperation({ summary: 'Pin a direct message' })
  @ApiCreatedResponse({ description: 'Message pinned' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiNotFoundResponse({ description: 'Message or conversation not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async pinMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.pinMessage(
      conversationId,
      messageId,
      user.id,
    );
  }

  @Delete(':conversationId/messages/:messageId/pin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unpin a direct message' })
  @ApiNoContentResponse({ description: 'Message unpinned' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiNotFoundResponse({ description: 'Message or conversation not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async unpinMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    await this.directConversations.unpinMessage(
      conversationId,
      messageId,
      user.id,
    );
  }

  @Get(':conversationId/pins')
  @ApiOperation({ summary: 'List pinned direct messages' })
  @ApiOkResponse({ description: 'Pinned messages list' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listPins(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: ListPinsQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.listPinnedMessages(
      conversationId,
      user.id,
      query,
    );
  }
}
