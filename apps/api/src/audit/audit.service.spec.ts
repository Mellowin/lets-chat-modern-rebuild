import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { AuditRepository } from './audit.repository';
import { AuditAction, AuditEntityType } from './audit.constants';

type CreatedAuditLog = Awaited<ReturnType<AuditRepository['create']>>;

describe('AuditService', () => {
  let service: AuditService;
  let auditRepository: jest.Mocked<AuditRepository>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: AuditRepository,
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuditService);
    auditRepository = moduleRef.get(AuditRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create AuditLog with required fields', async () => {
    const input = {
      action: AuditAction.WORKSPACE_MEMBER_ROLE_UPDATED,
      entityType: AuditEntityType.WORKSPACE_MEMBER,
      entityId: '11111111-1111-1111-1111-111111111111',
    };

    auditRepository.create.mockResolvedValue({
      id: 'audit-1',
    } as CreatedAuditLog);

    await service.record(input);

    expect(auditRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        actorId: null,
        workspaceId: null,
        channelId: null,
        ipAddress: null,
        userAgent: null,
      }),
    );
  });

  it('should support actorId', async () => {
    const input = {
      actorId: '22222222-2222-2222-2222-222222222222',
      action: AuditAction.WORKSPACE_MEMBER_REMOVED,
      entityType: AuditEntityType.WORKSPACE_MEMBER,
      entityId: '11111111-1111-1111-1111-111111111111',
    };

    auditRepository.create.mockResolvedValue({
      id: 'audit-2',
    } as CreatedAuditLog);

    await service.record(input);

    expect(auditRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: input.actorId,
      }),
    );
  });

  it('should support workspaceId', async () => {
    const input = {
      action: AuditAction.WORKSPACE_INVITE_CREATED,
      entityType: AuditEntityType.INVITATION,
      entityId: '11111111-1111-1111-1111-111111111111',
      workspaceId: '33333333-3333-3333-3333-333333333333',
    };

    auditRepository.create.mockResolvedValue({
      id: 'audit-3',
    } as CreatedAuditLog);

    await service.record(input);

    expect(auditRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: input.workspaceId,
      }),
    );
  });

  it('should support channelId', async () => {
    const input = {
      action: AuditAction.WORKSPACE_INVITE_ACCEPTED,
      entityType: AuditEntityType.INVITATION,
      entityId: '11111111-1111-1111-1111-111111111111',
      channelId: '44444444-4444-4444-4444-444444444444',
    };

    auditRepository.create.mockResolvedValue({
      id: 'audit-4',
    } as CreatedAuditLog);

    await service.record(input);

    expect(auditRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: input.channelId,
      }),
    );
  });

  it('should support metadata', async () => {
    const input = {
      action: AuditAction.WORKSPACE_MEMBER_ROLE_UPDATED,
      entityType: AuditEntityType.WORKSPACE_MEMBER,
      entityId: '11111111-1111-1111-1111-111111111111',
      metadata: { oldRole: 'MEMBER', newRole: 'ADMIN' },
    };

    auditRepository.create.mockResolvedValue({
      id: 'audit-5',
    } as CreatedAuditLog);

    await service.record(input);

    expect(auditRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: input.metadata,
      }),
    );
  });

  it('should support null actorId for system action', async () => {
    const input = {
      actorId: null,
      action: AuditAction.WORKSPACE_INVITE_REVOKED,
      entityType: AuditEntityType.INVITATION,
      entityId: '11111111-1111-1111-1111-111111111111',
    };

    auditRepository.create.mockResolvedValue({
      id: 'audit-6',
    } as CreatedAuditLog);

    await service.record(input);

    expect(auditRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
      }),
    );
  });

  it('should call repository.create with expected shape', async () => {
    const input = {
      actorId: '22222222-2222-2222-2222-222222222222',
      action: AuditAction.WORKSPACE_MEMBER_ROLE_UPDATED,
      entityType: AuditEntityType.WORKSPACE_MEMBER,
      entityId: '11111111-1111-1111-1111-111111111111',
      workspaceId: '33333333-3333-3333-3333-333333333333',
      channelId: null,
      metadata: { oldRole: 'MEMBER', newRole: 'ADMIN' },
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    };

    auditRepository.create.mockResolvedValue({
      id: 'audit-7',
    } as CreatedAuditLog);

    await service.record(input);

    expect(auditRepository.create).toHaveBeenCalledWith({
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      workspaceId: input.workspaceId,
      channelId: null,
      metadata: input.metadata,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  });

  it('should use string constants for actions', () => {
    expect(AuditAction.WORKSPACE_MEMBER_ROLE_UPDATED).toBe(
      'workspace.member.role_updated',
    );
    expect(AuditAction.WORKSPACE_MEMBER_REMOVED).toBe(
      'workspace.member.removed',
    );
    expect(AuditAction.WORKSPACE_INVITE_CREATED).toBe(
      'workspace.invite.created',
    );
    expect(AuditAction.WORKSPACE_INVITE_ACCEPTED).toBe(
      'workspace.invite.accepted',
    );
    expect(AuditAction.WORKSPACE_INVITE_REVOKED).toBe(
      'workspace.invite.revoked',
    );
  });

  it('should use string constants for entity types', () => {
    expect(AuditEntityType.WORKSPACE_MEMBER).toBe('workspace_member');
    expect(AuditEntityType.INVITATION).toBe('invitation');
    expect(AuditEntityType.WORKSPACE).toBe('workspace');
    expect(AuditEntityType.CHANNEL).toBe('channel');
    expect(AuditEntityType.MESSAGE).toBe('message');
  });
});
