import {
  Controller,
  Get,
  Inject,
  Optional,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminDiagnosticsService } from './admin-diagnostics.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditEntityType,
  AuditSeverity,
} from '../audit/audit.constants';
import type {
  DiagnosticsHealthResponse,
  DiagnosticsConfigResponse,
  DiagnosticsChecksResponse,
} from './admin-diagnostics.service';

@ApiTags('Admin Diagnostics')
@Controller('admin/diagnostics')
@UseGuards(JwtAccessGuard, AdminGuard)
@ApiBearerAuth()
export class AdminDiagnosticsController {
  constructor(
    private readonly diagnostics: AdminDiagnosticsService,
    @Optional()
    @Inject(AuditService)
    private readonly audit: AuditService | null = null,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Get admin health diagnostics' })
  @ApiOkResponse({ description: 'Health diagnostics returned' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async health(@Req() req: Request): Promise<DiagnosticsHealthResponse> {
    await this.recordViewed(req);
    return this.diagnostics.getHealth(this.extractRequestId(req));
  }

  @Get('config')
  @ApiOperation({ summary: 'Get safe admin config summary' })
  @ApiOkResponse({ description: 'Config summary returned' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  config(@Req() req: Request = {} as Request): DiagnosticsConfigResponse {
    void this.recordViewed(req);
    return this.diagnostics.getConfig();
  }

  @Get('checks')
  @ApiOperation({ summary: 'Get dependency checks' })
  @ApiOkResponse({ description: 'Dependency checks returned' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async checks(@Req() req: Request): Promise<DiagnosticsChecksResponse> {
    await this.recordViewed(req);
    return this.diagnostics.getChecks(this.extractRequestId(req));
  }

  private extractRequestId(req: Request): string | undefined {
    return typeof req.id === 'string' && req.id.length > 0 ? req.id : undefined;
  }

  private recordViewed(req: Request): Promise<unknown> | undefined {
    return this.audit?.record({
      actorId: null,
      action: AuditAction.ADMIN_VIEWED_DIAGNOSTICS,
      entityType: AuditEntityType.USER,
      entityId: '00000000-0000-0000-0000-000000000000',
      severity: AuditSeverity.INFO,
      requestId: this.extractRequestId(req),
    });
  }
}
