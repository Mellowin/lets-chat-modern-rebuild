import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';
import { AdminReportsService } from './admin-reports.service';
import { AdminReportQueryDto } from './dto/admin-report-query.dto';
import { UpdateAdminReportDto } from './dto/update-admin-report.dto';

@ApiTags('Admin Reports')
@Controller('admin/reports')
@UseGuards(JwtAccessGuard, AdminGuard)
@ApiBearerAuth()
export class AdminReportsController {
  constructor(private readonly adminReports: AdminReportsService) {}

  @Get()
  @ApiOperation({ summary: 'List user reports (admin/moderator only)' })
  @ApiOkResponse({ description: 'Reports returned successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async findAll(@Query() query: AdminReportQueryDto) {
    return this.adminReports.listReports({
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get report details (admin/moderator only)' })
  @ApiOkResponse({ description: 'Report returned successfully' })
  @ApiNotFoundResponse({ description: 'Report not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminReports.getReport(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update report status and/or note (admin/moderator only)',
  })
  @ApiOkResponse({ description: 'Report updated successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Report not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminReportDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.adminReports.updateReport(id, user.id, {
      status: dto.status,
      adminNote: dto.adminNote,
    });
  }
}
