export const AuditAction = {
  WORKSPACE_MEMBER_ROLE_UPDATED: 'workspace.member.role_updated',
  WORKSPACE_MEMBER_REMOVED: 'workspace.member.removed',
  WORKSPACE_INVITE_CREATED: 'workspace.invite.created',
  WORKSPACE_INVITE_ACCEPTED: 'workspace.invite.accepted',
  WORKSPACE_INVITE_REVOKED: 'workspace.invite.revoked',
} as const;

export const AuditEntityType = {
  WORKSPACE_MEMBER: 'workspace_member',
  INVITATION: 'invitation',
  WORKSPACE: 'workspace',
  CHANNEL: 'channel',
  MESSAGE: 'message',
} as const;
