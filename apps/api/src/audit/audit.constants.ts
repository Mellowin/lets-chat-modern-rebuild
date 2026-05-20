export const AuditAction = {
  WORKSPACE_MEMBER_ADDED: 'workspace.member.added',
  WORKSPACE_MEMBER_ROLE_UPDATED: 'workspace.member.role_updated',
  WORKSPACE_MEMBER_REMOVED: 'workspace.member.removed',
  WORKSPACE_INVITE_CREATED: 'workspace.invite.created',
  WORKSPACE_INVITE_ACCEPTED: 'workspace.invite.accepted',
  WORKSPACE_INVITE_REVOKED: 'workspace.invite.revoked',
  WORKSPACE_INVITE_DECLINED: 'workspace.invite.declined',
  WORKSPACE_OWNERSHIP_TRANSFERRED: 'workspace.ownership.transferred',
  CHANNEL_INVITE_CREATED: 'channel.invite.created',
  CHANNEL_INVITE_ACCEPTED: 'channel.invite.accepted',
  CHANNEL_INVITE_REVOKED: 'channel.invite.revoked',
  CHANNEL_INVITE_DECLINED: 'channel.invite.declined',
} as const;

export const AuditEntityType = {
  WORKSPACE_MEMBER: 'workspace_member',
  INVITATION: 'invitation',
  WORKSPACE: 'workspace',
  CHANNEL: 'channel',
  MESSAGE: 'message',
  CHANNEL_INVITATION: 'channel_invitation',
} as const;