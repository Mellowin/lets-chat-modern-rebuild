import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lets-chat/database';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.prisma.auditLog.create({ data });
  }
}
