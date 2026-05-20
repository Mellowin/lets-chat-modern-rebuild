-- DropChannelInvitationActiveIndex
-- The previous unique index idx_channel_invitation_active on (channelId, invitedEmail) WHERE deletedAt IS NULL
-- was incorrect because accepted invites have usedAt set but deletedAt remains NULL, which would block
-- future invites to the same email in the same channel even after the user was removed.
-- Duplicate pending invite prevention is handled at the service level.
DROP INDEX IF EXISTS "idx_channel_invitation_active";
