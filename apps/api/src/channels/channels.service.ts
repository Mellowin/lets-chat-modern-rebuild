import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelType, Prisma } from '@lets-chat/database';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { ChannelsRepository } from './channels.repository';
import { CreateChannelDto } from './dto/create-channel.dto';
import { slugify } from '../common/transliterate';
import { UpdateChannelDto } from './dto/update-channel.dto';

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

    const baseSlug = slugify(dto.name);
    if (baseSlug.length < 2) {
      throw new BadRequestException('Invalid channel name');
    }

    const slug = await this.deduplicateChannelSlug(workspaceId, baseSlug);

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

  private async deduplicateChannelSlug(workspaceId: string, baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let counter = 2;
    while (await this.channels.findBySlug(workspaceId, slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
      if (counter > 1000) {
        throw new ConflictException('Unable to generate unique channel slug');
      }
    }
    return slug;
  }

  async list(workspaceId: string, userId: string) {
    const role = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }
    return this.channels.listForWorkspace(workspaceId, userId);
  }

  async findById(workspaceId: string, channelId: string, userId: string) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.type === 'PRIVATE') {
      const chRole = await this.channels.findChannelMemberRole(
        channelId,
        userId,
      );
      if (!chRole) {
        throw new NotFoundException('Channel not found');
      }
    }

    return channel;
  }

  async findBySlug(workspaceId: string, slug: string, userId: string) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findBySlug(workspaceId, slug);
    if (!channel || channel.deletedAt) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.type === 'PRIVATE') {
      const chRole = await this.channels.findChannelMemberRole(
        channel.id,
        userId,
      );
      if (!chRole) {
        throw new NotFoundException('Channel not found');
      }
    }

    return channel;
  }

  async update(
    workspaceId: string,
    channelId: string,
    dto: UpdateChannelDto,
    userId: string,
  ) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const chRole = await this.channels.findChannelMemberRole(channelId, userId);
    if (!chRole) {
      if (channel.type === 'PUBLIC') {
        throw new ForbiddenException('Insufficient permissions');
      }
      throw new NotFoundException('Channel not found');
    }
    if (chRole !== 'OWNER' && chRole !== 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }

    const updateData: { name?: string; description?: string } = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;

    return this.channels.updateChannel(channelId, updateData);
  }

  async archive(workspaceId: string, channelId: string, userId: string) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const chRole = await this.channels.findChannelMemberRole(channelId, userId);
    if (!chRole) {
      if (channel.type === 'PUBLIC') {
        throw new ForbiddenException('Insufficient permissions');
      }
      throw new NotFoundException('Channel not found');
    }
    if (chRole !== 'OWNER') {
      throw new ForbiddenException('Only owner can archive channel');
    }

    await this.channels.archiveChannel(channelId);
    return { success: true };
  }


}
