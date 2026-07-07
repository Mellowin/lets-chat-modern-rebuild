export const AuditSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
} as const;

export const AuditAction = {
  // Auth / account
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  LOGOUT: 'auth.logout',
  PASSWORD_CHANGED: 'auth.password.changed',
  EMAIL_VERIFIED: 'auth.email.verified',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset.requested',
  PASSWORD_RESET_COMPLETED: 'auth.password_reset.completed',
  SESSION_REVOKED: 'auth.session.revoked',
  DEMO_SESSION_CREATED: 'demo.session.created',

  // Workspace
  WORKSPACE_CREATED: 'workspace.created',
  WORKSPACE_MEMBER_ADDED: 'workspace.member.added',
  WORKSPACE_MEMBER_ROLE_UPDATED: 'workspace.member.role_updated',
  WORKSPACE_MEMBER_REMOVED: 'workspace.member.removed',
  WORKSPACE_INVITE_CREATED: 'workspace.invite.created',
  WORKSPACE_INVITE_ACCEPTED: 'workspace.invite.accepted',
  WORKSPACE_INVITE_REVOKED: 'workspace.invite.revoked',
  WORKSPACE_INVITE_DECLINED: 'workspace.invite.declined',
  WORKSPACE_OWNERSHIP_TRANSFERRED: 'workspace.ownership.transferred',

  // Channel
  CHANNEL_CREATED: 'channel.created',
  CHANNEL_UPDATED: 'channel.updated',
  CHANNEL_ARCHIVED: 'channel.archived',
  CHANNEL_DELETED: 'channel.deleted',
  CHANNEL_MEMBER_ADDED: 'channel.member.added',
  CHANNEL_MEMBER_REMOVED: 'channel.member.removed',
  CHANNEL_INVITE_CREATED: 'channel.invite.created',
  CHANNEL_INVITE_ACCEPTED: 'channel.invite.accepted',
  CHANNEL_INVITE_REVOKED: 'channel.invite.revoked',
  CHANNEL_INVITE_DECLINED: 'channel.invite.declined',

  // Groups
  GROUP_CREATED: 'group.created',
  GROUP_ARCHIVED: 'group.archived',
  GROUP_MEMBER_ADDED: 'group.member.added',
  GROUP_MEMBER_REMOVED: 'group.member.removed',
  GROUP_MEMBER_LEFT: 'group.member.left',
  GROUP_INVITE_LINK_CREATED: 'group.invite_link.created',
  GROUP_INVITE_LINK_REVOKED: 'group.invite_link.revoked',
  GROUP_INVITE_LINK_USED: 'group.invite_link.used',

  // Attachments
  ATTACHMENT_UPLOADED: 'attachment.uploaded',
  ATTACHMENT_DELETED: 'attachment.deleted',

  // Safety / moderation
  USER_BLOCKED: 'user.blocked',
  USER_UNBLOCKED: 'user.unblocked',
  REPORT_CREATED: 'report.created',
  REPORT_UPDATED: 'report.updated',

  // Admin / diagnostics
  ADMIN_VIEWED_DIAGNOSTICS: 'admin.viewed.diagnostics',
  ADMIN_VIEWED_REPORTS: 'admin.viewed.reports',
  ADMIN_VIEWED_AUDIT_LOG: 'admin.viewed.audit_log',
  ADMIN_UPDATED_REPORT: 'admin.updated.report',
} as const;

export const AuditEntityType = {
  USER: 'user',
  WORKSPACE: 'workspace',
  WORKSPACE_MEMBER: 'workspace_member',
  INVITATION: 'invitation',
  CHANNEL: 'channel',
  CHANNEL_MEMBER: 'channel_member',
  CHANNEL_INVITATION: 'channel_invitation',
  GROUP: 'group',
  GROUP_MEMBER: 'group_member',
  GROUP_INVITE_LINK: 'group_invite_link',
  MESSAGE: 'message',
  DIRECT_MESSAGE: 'direct_message',
  GROUP_MESSAGE: 'group_message',
  ATTACHMENT: 'attachment',
  USER_BLOCK: 'user_block',
  USER_REPORT: 'user_report',
  SESSION: 'session',
} as const;
