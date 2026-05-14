import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { InvitesRepository } from './invites.repository';
import { CreateInviteDto } from './dto/create-invite.dto';

@Injectable()
export class InvitesService {
  constructor(
    private readonly invites: InvitesRepository,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  async create(workspaceId: string, dto: CreateInviteDto, invitedById: string) {
    const workspace = await this.workspaces.findActiveById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const role = await this.workspaces.findMemberRole(workspaceId, invitedById);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }

    if ((dto.role as string) === 'OWNER') {
      throw new BadRequestException('Cannot create OWNER invite');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await this.invites.createInvite({
      workspaceId,
      invitedById,
      invitedEmail: dto.email,
      role: dto.role,
      tokenHash,
      expiresAt,
    });

    return {
      id: invite.id,
      workspaceId: invite.workspaceId,
      email: invite.invitedEmail,
      role: invite.role,
      token: rawToken,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    };
  }
}
