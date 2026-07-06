import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

import { AuditService } from './audit.service';
import { AdminAuditQueryDto } from './dto/admin-audit-query.dto';
import { AuditAction, AuditEntityType, AuditSeverity } from './audit.constants';

@ApiTags('Admin Audit Log')
@Controller('admin/audit')
@UseGuards(JwtAccessGuard, AdminGuard)
@ApiBearerAuth()
export class AuditLogController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log events (admin/moderator only)' })
  @ApiOkResponse({ description: 'Audit events returned successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async findAll(@Query() query: AdminAuditQueryDto, @Req() req: Request) {
    const requestId =
      typeof req.id === 'string' && req.id.length > 0 ? req.id : undefined;

    await this.audit.record({
      actorId: null,
      action: AuditAction.ADMIN_VIEWED_AUDIT_LOG,
      entityType: AuditEntityType.USER,
      entityId: '00000000-0000-0000-0000-000000000000',
      severity: AuditSeverity.INFO,
      requestId,
    });

    return this.audit.listAdmin({
      cursor: query.cursor,
      limit: query.limit,
      actorUserId: query.actorUserId,
      targetUserId: query.targetUserId,
      workspaceId: query.workspaceId,
      channelId: query.channelId,
      groupId: query.groupId,
      action: query.action,
      entityType: query.entityType,
      severity: query.severity,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get audit event details (admin/moderator only)' })
  @ApiOkResponse({ description: 'Audit event returned successfully' })
  @ApiNotFoundResponse({ description: 'Audit event not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const event = await this.audit.findById(id);
    if (!event) {
      throw new NotFoundException('Audit event not found');
    }
    return event;
  }
}
