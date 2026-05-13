import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelType, Prisma } from '@lets-chat/database';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { ChannelsRepository } from './channels.repository';
import { CreateChannelDto } from './dto/create-channel.dto';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly channels: ChannelsRepository,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  async create(
    workspaceId: string,
    dto: CreateChannelDto,
    userId: string,
  ) {
    // Any active WorkspaceMember may create a channel.
    // The creator receives ChannelMember OWNER role.
    const role = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }

    const slug = this.slugify(dto.name);
    if (slug.length < 2) {
      throw new BadRequestException('Invalid channel name');
    }

    const existing = await this.channels.findBySlug(workspaceId, slug);
    if (existing) {
      throw new ConflictException('Channel slug already in use');
    }

    try {
      return await this.channels.createChannel(
        {
          workspaceId,
          name: dto.name.trim(),
          slug,
          description: dto.description?.trim(),
          type: dto.type ?? ChannelType.PUBLIC,
          createdById: userId,
        },
        userId,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Channel slug already in use');
      }
      throw error;
    }
  }

  async list(workspaceId: string, userId: string) {
    const role = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }
    return this.channels.listForWorkspace(workspaceId, userId);
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }
}
