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
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  Res,
  StreamableFile,
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
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupMessageDto } from './dto/create-group-message.dto';
import { ListGroupMessagesQueryDto } from './dto/list-group-messages-query.dto';
import { GroupMessageContextQueryDto } from './dto/message-context-query.dto';
import { ListPinsQueryDto } from '../messages/dto/list-pins-query.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../messages/attachment-validation';

@ApiTags('Groups')
@Controller('groups')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a group' })
  @ApiCreatedResponse({ description: 'Group created' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Body() dto: CreateGroupDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List groups I belong to' })
  @ApiOkResponse({ description: 'Groups list' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(@CurrentUser() user: AuthUserResponse) {
    return this.groups.list(user.id);
  }

  @Get(':groupId')
  @ApiOperation({ summary: 'Get group details' })
  @ApiOkResponse({ description: 'Group details' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findOne(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.get(groupId, user.id);
  }

  @Patch(':groupId')
  @ApiOperation({ summary: 'Rename group (owner only)' })
  @ApiOkResponse({ description: 'Group updated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async update(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.update(groupId, dto, user.id);
  }

  @Delete(':groupId')
  @ApiOperation({ summary: 'Archive group (owner only)' })
  @ApiOkResponse({ description: 'Group archived' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async archive(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.archive(groupId, user.id);
  }

  @Post(':groupId/members')
  @ApiOperation({ summary: 'Add a member (owner only)' })
  @ApiCreatedResponse({ description: 'Member added' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Group or user not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async addMember(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: AddGroupMemberDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.addMember(groupId, dto, user.id);
  }

  @Delete(':groupId/members/:userId')
  @ApiOperation({ summary: 'Remove a member (owner only)' })
  @ApiOkResponse({ description: 'Member removed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Group or member not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async removeMember(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.removeMember(groupId, userId, user.id);
  }

  @Post(':groupId/leave')
  @ApiOperation({ summary: 'Leave group' })
  @ApiOkResponse({ description: 'Left group' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async leave(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.leave(groupId, user.id);
  }

  @Get(':groupId/messages/:messageId/context')
  @ApiOperation({ summary: 'Get group message context' })
  @ApiOkResponse({ description: 'Message context' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Group or message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getMessageContext(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Query() query: GroupMessageContextQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.getMessageContext(groupId, messageId, user.id, query);
  }

  @Get(':groupId/messages')
  @ApiOperation({ summary: 'List group messages' })
  @ApiOkResponse({ description: 'Messages list' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findMessages(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: ListGroupMessagesQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.listMessages(groupId, user.id, query);
  }

  @Post(':groupId/messages')
  @ApiOperation({ summary: 'Send a group message' })
  @ApiCreatedResponse({ description: 'Message sent' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async createMessage(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateGroupMessageDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.createMessage(groupId, dto, user.id);
  }

  @Post(':groupId/read')
  @ApiOperation({ summary: 'Mark group as read' })
  @ApiOkResponse({ description: 'Group marked as read' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async markAsRead(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.markAsRead(groupId, user.id);
  }

  @Post(':groupId/messages/:messageId/pin')
  @ApiOperation({ summary: 'Pin a group message (owner only)' })
  @ApiCreatedResponse({ description: 'Message pinned' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({
    description: 'Only the group owner can pin messages',
  })
  @ApiNotFoundResponse({ description: 'Group or message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async pinMessage(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.pinMessage(groupId, messageId, user.id);
  }

  @Delete(':groupId/messages/:messageId/pin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unpin a group message (owner only)' })
  @ApiNoContentResponse({ description: 'Message unpinned' })
  @ApiForbiddenResponse({
    description: 'Only the group owner can unpin messages',
  })
  @ApiNotFoundResponse({ description: 'Group or message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async unpinMessage(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    await this.groups.unpinMessage(groupId, messageId, user.id);
  }

  @Get(':groupId/pins')
  @ApiOperation({ summary: 'List pinned group messages' })
  @ApiOkResponse({ description: 'Pinned messages list' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listPins(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: ListPinsQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.listPinnedMessages(groupId, user.id, query);
  }

  @Post(':groupId/messages/attachments/upload')
  @ApiOperation({
    summary: 'Upload a group message attachment through the API proxy',
  })
  @ApiCreatedResponse({ description: 'Attachment uploaded' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_ATTACHMENT_SIZE_BYTES,
      },
    }),
  )
  async uploadAttachment(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.uploadAttachment(groupId, file, user.id);
  }

  @Get(':groupId/messages/:messageId/attachments/:attachmentId/file')
  @ApiOperation({
    summary: 'Download group message attachment file through API proxy',
  })
  @ApiOkResponse({ description: 'Attachment file content' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiNotFoundResponse({ description: 'Attachment or message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async downloadAttachmentFile(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUserResponse,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { encodeContentDisposition } =
      await import('../messages/attachments.service.js');
    const file = await this.groups.downloadAttachmentFile(
      groupId,
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
}
