import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminReportsRepository } from './admin-reports.repository';
import { ReportStatus } from './dto/admin-report-query.dto';

export interface AdminReportListResult {
  items: Awaited<ReturnType<AdminReportsRepository['findManyAdminReports']>>;
  nextCursor: string | null;
}

const ALLOWED_STATUSES = new Set<string>([
  ReportStatus.OPEN,
  ReportStatus.REVIEWED,
  ReportStatus.DISMISSED,
  ReportStatus.ACTION_TAKEN,
]);

@Injectable()
export class AdminReportsService {
  constructor(private readonly repo: AdminReportsRepository) {}

  async listReports(options: {
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<AdminReportListResult> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const cursor = options.cursor
      ? this.decodeCursor(options.cursor)
      : undefined;

    const items = await this.repo.findManyAdminReports({
      status: options.status,
      cursor,
      limit: limit + 1,
    });

    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? this.encodeCursor(trimmed[trimmed.length - 1])
      : null;

    return { items: trimmed, nextCursor };
  }

  async getReport(id: string) {
    const report = await this.repo.findAdminReportById(id);
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    return report;
  }

  async updateReport(
    id: string,
    actorId: string,
    input: { status?: string; adminNote?: string },
  ) {
    if (!input.status && input.adminNote === undefined) {
      throw new BadRequestException('No update fields provided');
    }

    if (input.status && !ALLOWED_STATUSES.has(input.status)) {
      throw new BadRequestException('Invalid report status');
    }

    const report = await this.repo.findAdminReportById(id);
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const updateData: {
      status?: string;
      adminNote?: string | null;
      reviewedAt?: Date;
      reviewedBy?: string;
    } = {};

    if (input.status) {
      updateData.status = input.status;
    }

    if (input.adminNote !== undefined) {
      updateData.adminNote = input.adminNote.trim() || null;
    }

    if (input.status || input.adminNote !== undefined) {
      updateData.reviewedAt = new Date();
      updateData.reviewedBy = actorId;
    }

    return this.repo.updateAdminReport(id, updateData);
  }

  private encodeCursor(
    item: {
      createdAt: Date;
      id: string;
    } | null,
  ): string | null {
    if (!item) return null;
    const payload = JSON.stringify({
      createdAt: item.createdAt.toISOString(),
      id: item.id,
    });
    return Buffer.from(payload).toString('base64url');
  }

  private decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded) as {
        createdAt: string;
        id: string;
      };
      return { createdAt: new Date(parsed.createdAt), id: parsed.id };
    } catch {
      return null;
    }
  }
}
