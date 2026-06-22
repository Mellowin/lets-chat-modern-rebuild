import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  AttachmentsService,
  encodeContentDisposition,
} from './attachments.service';
import { CompleteAttachmentResponseDto } from './dto/complete-attachment-response.dto';
import { AttachmentDownloadResponseDto } from './dto/attachment-download-response.dto';
import { AttachmentDownloadUrlResponseDto } from './dto/attachment-download-url-response.dto';
import type { Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Attachments')
@Controller(
  'workspaces/:workspaceId/channels/:channelId/messages/:messageId/attachments',
)
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post(':attachmentId/complete')
  @ApiOperation({ summary: 'Confirm attachment upload completion' })
  @ApiCreatedResponse({
    description: 'Attachment upload confirmed',
    type: CompleteAttachmentResponseDto,
  })
  @ApiConflictResponse({ description: 'Upload not completed' })
  @ApiUnprocessableEntityResponse({
    description: 'Size or content-type mismatch',
  })
  @ApiNotFoundResponse({ description: 'Attachment or message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async complete(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.attachments.complete(
      workspaceId,
      channelId,
      messageId,
      attachmentId,
      user.id,
    );
  }

  @Get(':attachmentId/download-url')
  @ApiOperation({ summary: 'Get presigned download URL for attachment' })
  @ApiOkResponse({
    description: 'Presigned download URL created',
    type: AttachmentDownloadUrlResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Attachment or message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getDownloadUrl(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.attachments.getDownloadUrl(
      workspaceId,
      channelId,
      messageId,
      attachmentId,
      user.id,
    );
  }

  @Get(':attachmentId/download')
  @ApiOperation({ summary: 'Get presigned download URL for attachment' })
  @ApiOkResponse({
    description: 'Presigned download URL created',
    type: AttachmentDownloadResponseDto,
  })
  @ApiConflictResponse({ description: 'Upload not completed' })
  @ApiNotFoundResponse({ description: 'Attachment or message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async download(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.attachments.download(
      workspaceId,
      channelId,
      messageId,
      attachmentId,
      user.id,
    );
  }

  @Get(':attachmentId/file')
  @ApiOperation({ summary: 'Download attachment file through API proxy' })
  @ApiOkResponse({ description: 'Attachment file content' })
  @ApiConflictResponse({ description: 'Upload not completed' })
  @ApiNotFoundResponse({ description: 'Attachment or message not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async downloadFile(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthUserResponse,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.attachments.downloadFile(
      workspaceId,
      channelId,
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
