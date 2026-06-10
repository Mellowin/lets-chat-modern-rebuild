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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { AttachmentsService } from './attachments.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { PresignAttachmentDto } from './dto/presign-attachment.dto';
import { PresignAttachmentUploadResponseDto } from './dto/presign-attachment-upload-response.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Messages')
@Controller('workspaces/:workspaceId/channels/:channelId/messages')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly attachments: AttachmentsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create message' })
  @ApiCreatedResponse({ description: 'Message created' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.messages.create(workspaceId, channelId, dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List messages' })
  @ApiOkResponse({ description: 'Messages list' })
  @ApiNotFoundResponse({ description: 'Channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Query() query: ListMessagesQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.messages.list(workspaceId, channelId, user.id, query);
  }

  @Patch(':messageId')
  @ApiOperation({ summary: 'Update message' })
  @ApiOkResponse({ description: 'Message updated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({
    description: 'Only the author can edit this message',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Message edit window has expired',
  })
  @ApiNotFoundResponse({ description: 'Message or channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: UpdateMessageDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.messages.update(
      workspaceId,
      channelId,
      messageId,
      dto,
      user.id,
    );
  }

  @Delete(':messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete message' })
  @ApiNoContentResponse({ description: 'Message deleted' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Message or channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async remove(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    await this.messages.remove(workspaceId, channelId, messageId, user.id);
  }

  @Post('attachments/presign')
  @ApiOperation({ summary: 'Get presigned upload URL for a future attachment' })
  @ApiCreatedResponse({
    description: 'Presigned URL created',
    type: PresignAttachmentUploadResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Workspace or channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async presignAttachmentUpload(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body() dto: PresignAttachmentDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.attachments.prepareUpload(workspaceId, channelId, dto, user.id);
  }
}
