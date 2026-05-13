import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AttachmentsService } from './attachments.service';
import { PresignAttachmentDto } from './dto/presign-attachment.dto';
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

  @Post('presign')
  @ApiOperation({ summary: 'Get presigned upload URL for attachment' })
  @ApiCreatedResponse({ description: 'Presigned URL created' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Message or channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async presign(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: PresignAttachmentDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.attachments.presign(
      workspaceId,
      channelId,
      messageId,
      dto,
      user.id,
    );
  }

  @Post(':attachmentId/complete')
  @ApiOperation({ summary: 'Confirm attachment upload completion' })
  @ApiCreatedResponse({ description: 'Attachment upload confirmed' })
  @ApiConflictResponse({ description: 'Upload not completed' })
  @ApiUnprocessableEntityResponse({ description: 'Size or content-type mismatch' })
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

  @Get(':attachmentId/download')
  @ApiOperation({ summary: 'Get presigned download URL for attachment' })
  @ApiOkResponse({ description: 'Presigned download URL created' })
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
}
