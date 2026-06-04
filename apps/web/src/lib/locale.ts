import { useCallback, useSyncExternalStore } from "react";

export type Locale = "en" | "uk" | "ru";

const LOCALE_KEY = "lets-chat:locale";
const LOCALE_CHANGED_EVENT = "lets-chat:locale-changed";

declare global {
  interface WindowEventMap {
    "lets-chat:locale-changed": CustomEvent<Locale>;
  }
}

const LABELS: Record<Locale, { label: string; native: string }> = {
  en: { label: "English", native: "English" },
  uk: { label: "Ukrainian", native: "Українська" },
  ru: { label: "Russian", native: "Русский" },
};

export type TranslationKey =
  | "header.profile"
  | "header.logout"
  | "header.signIn"
  | "header.createAccount"
  | "profile.title"
  | "profile.back"
  | "profile.accountInfo"
  | "profile.email"
  | "profile.username"
  | "profile.displayName"
  | "profile.displayNamePlaceholder"
  | "profile.save"
  | "profile.saving"
  | "profile.displayNameUpdated"
  | "profile.avatar"
  | "profile.uploadAvatar"
  | "profile.uploading"
  | "profile.avatarUpdated"
  | "profile.editDisplayName"
  | "profile.interfaceLanguage"
  | "profile.selected"
  | "profile.languageSaved"
  | "profile.languageSaveFailed"
  | "profile.errorUpdateDisplayNameFailed"
  | "profile.errorAvatarInvalidType"
  | "profile.errorAvatarTooLarge"
  | "profile.errorUploadAvatarFailed"
  | "profile.avatarPreviewAlt"
  | "profile.avatarAlt"
  | "dashboard.welcome"
  | "dashboard.signedInAs"
  | "dashboard.profileSettings"
  | "dashboard.createWorkspace"
  | "dashboard.workspaceName"
  | "dashboard.workspaceSlug"
  | "dashboard.create"
  | "dashboard.creating"
  | "dashboard.yourWorkspaces"
  | "dashboard.noWorkspaces"
  | "dashboard.pendingInvitations"
  | "dashboard.pendingChannelInvitations"
  | "dashboard.archivedWorkspaces"
  | "dashboard.loading"
  | "dashboard.loadingInvites"
  | "dashboard.loadingChannelInvites"
  | "dashboard.loadingArchived"
  | "dashboard.loadingWorkspaces"
  | "dashboard.archivedLabel"
  | "dashboard.noPendingInvitations"
  | "dashboard.noPendingChannelInvitations"
  | "dashboard.noArchivedWorkspaces"
  | "dashboard.invitedBy"
  | "dashboard.joinAs"
  | "dashboard.accept"
  | "dashboard.decline"
  | "dashboard.archive"
  | "dashboard.restore"
  | "auth.loadingSession"
  | "auth.authRequired"
  | "auth.pleaseSignIn"
  | "auth.pleaseSignInDashboard"
  | "auth.signIn"
  | "auth.pleaseSignInWorkspace"
  | "auth.pleaseSignInChannel"
  | "auth.loginTitle"
  | "auth.loginSubtitle"
  | "auth.email"
  | "auth.password"
  | "auth.signingIn"
  | "auth.emailPasswordRequired"
  | "auth.loginFailed"
  | "auth.signedInAs"
  | "auth.noAccount"
  | "auth.createOne"
  | "auth.registerTitle"
  | "auth.registerSubtitle"
  | "auth.username"
  | "auth.usernameHint"
  | "auth.passwordHint"
  | "auth.creatingAccount"
  | "auth.allFieldsRequired"
  | "auth.usernameInvalid"
  | "auth.registrationFailed"
  | "auth.accountCreatedFor"
  | "auth.alreadyHaveAccount"
  | "workspace.backToDashboard"
  | "workspace.loading"
  | "workspace.createChannel"
  | "workspace.channelName"
  | "workspace.channelDescription"
  | "workspace.publicChannel"
  | "workspace.privateChannel"
  | "workspace.create"
  | "workspace.creating"
  | "workspace.channels"
  | "workspace.loadingChannels"
  | "workspace.noChannels"
  | "workspace.archive"
  | "workspace.members"
  | "workspace.loadingMembers"
  | "workspace.noMembers"
  | "workspace.remove"
  | "workspace.removing"
  | "workspace.invitePlaceholder"
  | "workspace.owner"
  | "workspace.admin"
  | "workspace.member"
  | "workspace.addMember"
  | "workspace.addingMember"
  | "workspace.leaveWorkspace"
  | "workspace.archivedChannels"
  | "workspace.loadingArchived"
  | "workspace.noArchivedChannels"
  | "workspace.restore"
  | "workspace.restoring"
  | "channel.backToWorkspace"
  | "channel.loading"
  | "channel.archive"
  | "channel.archiving"
  | "channel.leaveChannel"
  | "channel.leaving"
  | "channel.messages"
  | "channel.messagePlaceholder"
  | "channel.send"
  | "channel.sending"
  | "channel.loadingMessages"
  | "channel.noMessages"
  | "channel.members"
  | "channel.invitePlaceholder"
  | "channel.add"
  | "channel.adding"
  | "channel.member"
  | "channel.admin"
  | "channel.owner"
  | "channel.publicChannel"
  | "channel.privateChannel"
  | "channel.invitationSent"
  | "channel.loadingMembers"
  | "channel.noMembers"
  | "channel.searchMembers"
  | "channel.remove"
  | "channel.removing"
  | "channel.edit"
  | "channel.delete"
  | "channel.save"
  | "channel.savingEdit"
  | "channel.cancel"
  | "channel.edited"
  | "channel.reply"
  | "channel.replyingTo"
  | "channel.replyOriginalUnavailable"
  | "channel.cancelReply"
  | "channel.isTyping"
  | "channel.areTyping"
  | "channel.confirmDeleteMessage"
  | "channel.confirmArchiveChannelPrefix"
  | "channel.confirmArchiveChannelBody"
  | "channel.confirmLeaveChannelPrefix"
  | "channel.confirmRemoveMemberPrefix"
  | "channel.confirmRemoveMemberSuffix"
  | "channel.fallbackThisChannel"
  | "channel.errorMessageEmpty"
  | "channel.errorMessageTooLong"
  | "channel.errorUpdateMessageFailed"
  | "channel.errorDeleteMessageFailed"
  | "channel.errorLoadChannelFailed"
  | "channel.errorLoadMembersFailed"
  | "channel.errorArchiveChannelFailed"
  | "channel.errorLeaveChannelFailed"
  | "channel.errorUsernameOrEmailRequired"
  | "channel.errorSendInvitationFailed"
  | "channel.errorSendMessageFailed"
  | "channel.errorRemoveMemberFailed"
  | "channel.react"
  | "channel.failedReactMessage"
  | "channel.failedRemoveReaction"
  | "channel.copyText"
  | "channel.forward"
  | "channel.forwardTo"
  | "channel.errorForwardFailed"
  | "channel.noConversations"
  | "channel.messageMenu"
  | "channel.socketDisconnected"
  | "channel.socketConnecting"
  | "channel.socketConnected"
  | "channel.socketJoined"
  | "channel.socketError"
  | "messageAuthor.unknownUser"
  | "workspace.confirmArchiveChannelPrefix"
  | "workspace.confirmArchiveChannelBody"
  | "workspace.confirmRestoreChannelPrefix"
  | "workspace.confirmLeaveWorkspacePrefix"
  | "workspace.confirmRemoveMemberPrefix"
  | "workspace.confirmRemoveMemberSuffix"
  | "workspace.fallbackThisWorkspace"
  | "workspace.errorChannelNameTooShort"
  | "workspace.errorCreateChannelFailed"
  | "workspace.errorLoadWorkspaceFailed"
  | "workspace.errorLoadMembersFailed"
  | "workspace.errorLoadArchivedChannelsFailed"
  | "workspace.errorArchiveChannelFailed"
  | "workspace.errorRestoreChannelFailed"
  | "workspace.errorEnterUsernameOrEmail"
  | "workspace.errorAddMemberFailed"
  | "workspace.errorLeaveWorkspaceFailed"
  | "workspace.errorRemoveMemberFailed"
  | "workspace.invitationSent"
  | "workspace.memberRemoved"
  | "dashboard.errorLoadWorkspacesFailed"
  | "dashboard.errorLoadInvitesFailed"
  | "dashboard.errorLoadChannelInvitesFailed"
  | "dashboard.errorLoadArchivedWorkspacesFailed"
  | "dashboard.errorNameRequired"
  | "dashboard.errorCreateWorkspaceFailed"
  | "dashboard.errorArchiveWorkspaceFailed"
  | "dashboard.errorAcceptInviteFailed"
  | "dashboard.errorDeclineInviteFailed"
  | "dashboard.errorAcceptChannelInviteFailed"
  | "dashboard.errorDeclineChannelInviteFailed"
  | "dashboard.errorRestoreWorkspaceFailed"
  | "dashboard.confirmArchiveWorkspacePrefix"
  | "dashboard.confirmArchiveWorkspaceBody"
  | "dashboard.confirmDeclineInvitation"
  | "dashboard.confirmDeclineChannelInvitation"
  | "dashboard.confirmRestoreWorkspacePrefix"
  | "direct.title"
  | "direct.startChat"
  | "direct.usernameOrEmail"
  | "direct.noConversations"
  | "direct.loadingConversations"
  | "direct.failedLoadConversations"
  | "direct.failedStartConversation"
  | "direct.typeMessage"
  | "direct.send"
  | "direct.sending"
  | "direct.loadingMessages"
  | "direct.noMessages"
  | "direct.online"
  | "direct.offline"
  | "direct.sent"
  | "direct.seen"
  | "direct.failedLoadMessages"
  | "direct.failedSendMessage"
  | "direct.backToDirectMessages"
  | "direct.reply"
  | "direct.replyingTo"
  | "direct.cancelReply"
  | "direct.originalMessageMissing"
  | "direct.forward"
  | "direct.forwardMessage"
  | "direct.forwardTo"
  | "direct.cancelForward"
  | "direct.failedForwardMessage"
  | "direct.noForwardTargets"
  | "direct.react"
  | "direct.copyText"
  | "direct.messageMenu"
  | "direct.edit"
  | "direct.editingMessage"
  | "direct.cancelEdit"
  | "direct.failedEditMessage"
  | "direct.saveEdit"
  | "direct.delete"
  | "direct.confirmDelete"
  | "direct.failedDeleteMessage"
  | "direct.typing"
  | "direct.typingFallback"
  | "direct.unreadMessages"
  | "sidebar.moveUp"
  | "sidebar.moveDown"
  | "sidebar.direct"
  | "sidebar.directMessages"
  | "sidebar.workspaces"
  | "sidebar.overview"
  | "sidebar.loading"
  | "sidebar.failedToLoadWorkspaces"
  | "sidebar.noWorkspacesYet"
  | "sidebar.failedToLoadChannels"
  | "sidebar.noChannelsYet"
  | "sidebar.unknownUser"
  | "sidebar.publicShort"
  | "sidebar.privateShort";

const DICTIONARY: Record<Locale, Record<TranslationKey, string | ((name: string) => string)>> = {
  en: {
    "header.profile": "Profile",
    "header.logout": "Logout",
    "header.signIn": "Sign in",
    "header.createAccount": "Create account",
    "profile.title": "Profile",
    "profile.back": "← Back to dashboard",
    "profile.accountInfo": "Account information",
    "profile.email": "Email",
    "profile.username": "Username",
    "profile.displayName": "Display name",
    "profile.displayNamePlaceholder": "Your display name",
    "profile.editDisplayName": "Edit display name",
    "profile.save": "Save",
    "profile.saving": "Saving…",
    "profile.displayNameUpdated": "Display name updated.",
    "profile.avatar": "Avatar",
    "profile.uploadAvatar": "Upload avatar",
    "profile.uploading": "Uploading…",
    "profile.avatarUpdated": "Avatar updated.",
    "profile.interfaceLanguage": "Interface language",
    "profile.selected": "Selected:",
    "profile.languageSaved": "Language saved.",
    "profile.languageSaveFailed": "Failed to save language preference.",
    "profile.errorUpdateDisplayNameFailed": "Failed to update display name",
    "profile.errorAvatarInvalidType": "Only JPEG, PNG, or WebP images are allowed",
    "profile.errorAvatarTooLarge": "Image must be 2 MB or smaller",
    "profile.errorUploadAvatarFailed": "Failed to upload avatar",
    "profile.avatarPreviewAlt": "Avatar preview",
    "profile.avatarAlt": "Avatar",
    "dashboard.welcome": "Welcome",
    "dashboard.signedInAs": "You are signed in as",
    "dashboard.profileSettings": "Profile settings",
    "dashboard.createWorkspace": "Create workspace",
    "dashboard.workspaceName": "Workspace name",
    "dashboard.workspaceSlug": "slug (optional, auto-generated)",
    "dashboard.create": "Create",
    "dashboard.creating": "Creating…",
    "dashboard.yourWorkspaces": "Your Workspaces",
    "dashboard.noWorkspaces": "No workspaces yet. Create one to get started.",
    "dashboard.pendingInvitations": "Pending Invitations",
    "dashboard.pendingChannelInvitations": "Pending Channel Invitations",
    "dashboard.archivedWorkspaces": "Archived Workspaces",
    "dashboard.loading": "Loading session…",
    "dashboard.loadingInvites": "Loading invites…",
    "dashboard.loadingChannelInvites": "Loading channel invites…",
    "dashboard.loadingArchived": "Loading archived workspaces…",
    "dashboard.loadingWorkspaces": "Loading workspaces…",
    "dashboard.archivedLabel": "Archived",
    "dashboard.noPendingInvitations": "No pending invitations.",
    "dashboard.noPendingChannelInvitations": "No pending channel invitations.",
    "dashboard.noArchivedWorkspaces": "No archived workspaces.",
    "dashboard.invitedBy": "Invited by",
    "dashboard.joinAs": "You will join as",
    "dashboard.accept": "Accept",
    "dashboard.decline": "Decline",
    "dashboard.archive": "Archive",
    "dashboard.restore": "Restore",
    "auth.loadingSession": "Loading session…",
    "auth.authRequired": "Authentication required",
    "auth.pleaseSignIn": "Please sign in to view your profile.",
    "auth.pleaseSignInDashboard": "Please sign in to view your dashboard.",
    "auth.signIn": "Sign in",
    "auth.pleaseSignInWorkspace": "Please sign in to view this workspace.",
    "auth.pleaseSignInChannel": "Please sign in to view this channel.",
    "auth.loginTitle": "Sign in",
    "auth.loginSubtitle": "Welcome back. Enter your credentials.",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.signingIn": "Signing in…",
    "auth.emailPasswordRequired": "Email and password are required",
    "auth.loginFailed": "Login failed",
    "auth.signedInAs": "Signed in as",
    "auth.noAccount": "No account?",
    "auth.createOne": "Create one",
    "auth.registerTitle": "Create account",
    "auth.registerSubtitle": "Get started with a free account.",
    "auth.username": "Username",
    "auth.usernameHint": "Letters, numbers and underscore are allowed.",
    "auth.passwordHint": "Minimum 8 characters.",
    "auth.creatingAccount": "Creating account…",
    "auth.allFieldsRequired": "All fields are required",
    "auth.usernameInvalid": "Username can only contain letters, numbers and underscores",
    "auth.registrationFailed": "Registration failed",
    "auth.accountCreatedFor": "Account created for",
    "auth.alreadyHaveAccount": "Already have an account?",
    "workspace.backToDashboard": "← Back to dashboard",
    "workspace.loading": "Loading workspace…",
    "workspace.createChannel": "Create channel",
    "workspace.channelName": "Channel name",
    "workspace.channelDescription": "Description (optional)",
    "workspace.publicChannel": "Public",
    "workspace.privateChannel": "Private",
    "workspace.create": "Create",
    "workspace.creating": "Creating…",
    "workspace.channels": "Channels",
    "workspace.loadingChannels": "Loading channels…",
    "workspace.noChannels": "No channels yet.",
    "workspace.archive": "Archive",
    "workspace.members": "Members",
    "workspace.loadingMembers": "Loading members…",
    "workspace.noMembers": "No members yet.",
    "workspace.remove": "Remove",
    "workspace.removing": "Removing…",
    "workspace.invitePlaceholder": "Username or email",
    "workspace.owner": "Owner",
    "workspace.admin": "Admin",
    "workspace.member": "Member",
    "workspace.addMember": "Add member",
    "workspace.addingMember": "Adding…",
    "workspace.leaveWorkspace": "Leave workspace",
    "workspace.archivedChannels": "Archived channels",
    "workspace.loadingArchived": "Loading archived channels…",
    "workspace.noArchivedChannels": "No archived channels.",
    "workspace.restore": "Restore",
    "workspace.restoring": "Restoring…",
    "channel.backToWorkspace": "← Back to workspace",
    "channel.loading": "Loading channel…",
    "channel.archive": "Archive",
    "channel.archiving": "Archiving…",
    "channel.leaveChannel": "Leave channel",
    "channel.leaving": "Leaving…",
    "channel.messages": "Messages",
    "channel.messagePlaceholder": "Type a message…",
    "channel.send": "Send",
    "channel.sending": "Sending…",
    "channel.loadingMessages": "Loading messages…",
    "channel.noMessages": "No messages yet.",
    "channel.members": "Members",
    "channel.invitePlaceholder": "Username or email",
    "channel.add": "Add",
    "channel.adding": "Adding…",
    "channel.member": "Member",
    "channel.admin": "Admin",
    "channel.owner": "Owner",
    "channel.publicChannel": "Public",
    "channel.privateChannel": "Private",
    "channel.invitationSent": "Channel invitation sent",
    "channel.loadingMembers": "Loading members…",
    "channel.noMembers": "No members yet.",
    "channel.searchMembers": "Search members…",
    "channel.remove": "Remove",
    "channel.removing": "Removing…",
    "channel.edit": "Edit",
    "channel.delete": "Delete",
    "channel.save": "Save",
    "channel.savingEdit": "Saving…",
    "channel.cancel": "Cancel",
    "channel.edited": "edited",
    "channel.reply": "Reply",
    "channel.replyingTo": "Replying to",
    "channel.replyOriginalUnavailable": "Original message is not loaded",
    "channel.cancelReply": "Cancel reply",
    "channel.isTyping": "is typing…",
    "channel.areTyping": "are typing…",
    "channel.confirmDeleteMessage": "Delete this message?",
    "channel.confirmArchiveChannelPrefix": "Archive channel",
    "channel.confirmArchiveChannelBody": "This will hide the channel from the workspace. Only the channel owner can do this.",
    "channel.confirmLeaveChannelPrefix": "Leave channel",
    "channel.confirmRemoveMemberPrefix": "Remove member",
    "channel.confirmRemoveMemberSuffix": "from this channel?",
    "channel.fallbackThisChannel": "this channel",
    "channel.errorMessageEmpty": "Message cannot be empty",
    "channel.errorMessageTooLong": "Message is too long (max 4000 characters)",
    "channel.errorUpdateMessageFailed": "Failed to update message",
    "channel.errorDeleteMessageFailed": "Failed to delete message",
    "channel.errorLoadChannelFailed": "Failed to load channel",
    "channel.errorLoadMembersFailed": "Failed to load members",
    "channel.errorArchiveChannelFailed": "Failed to archive channel",
    "channel.errorLeaveChannelFailed": "Failed to leave channel",
    "channel.errorUsernameOrEmailRequired": "Username or email is required",
    "channel.errorSendInvitationFailed": "Failed to send invitation",
    "channel.errorSendMessageFailed": "Failed to send message",
    "channel.errorRemoveMemberFailed": "Failed to remove member",
    "channel.react": "React",
    "channel.failedReactMessage": "Failed to add reaction",
    "channel.failedRemoveReaction": "Failed to remove reaction",
    "channel.copyText": "Copy text",
    "channel.forward": "Forward",
    "channel.forwardTo": "Forward to",
    "channel.errorForwardFailed": "Failed to forward message",
    "channel.noConversations": "No direct conversations yet.",
    "channel.messageMenu": "Message actions",
    "channel.socketDisconnected": "Disconnected",
    "channel.socketConnecting": "Connecting",
    "channel.socketConnected": "Connected",
    "channel.socketJoined": "Joined",
    "channel.socketError": "Error",
    "messageAuthor.unknownUser": "Unknown user",
    "direct.title": "Direct messages",
    "direct.startChat": "Start chat",
    "direct.usernameOrEmail": "Username or email",
    "direct.noConversations": "No conversations yet.",
    "direct.loadingConversations": "Loading conversations…",
    "direct.failedLoadConversations": "Failed to load conversations",
    "direct.failedStartConversation": "Failed to start conversation",
    "direct.typeMessage": "Type a message…",
    "direct.send": "Send",
    "direct.sending": "Sending…",
    "direct.loadingMessages": "Loading messages…",
    "direct.noMessages": "No messages yet.",
    "direct.online": "Online",
    "direct.offline": "Offline",
    "direct.sent": "Sent",
    "direct.seen": "Seen",
    "direct.failedLoadMessages": "Failed to load messages",
    "direct.failedSendMessage": "Failed to send message",
    "direct.backToDirectMessages": "← Back to direct messages",
    "direct.reply": "Reply",
    "direct.replyingTo": "Replying to",
    "direct.cancelReply": "Cancel reply",
    "direct.originalMessageMissing": "Original message is not loaded",
    "direct.forward": "Forward",
    "direct.forwardMessage": "Forward message",
    "direct.forwardTo": "Forward to",
    "direct.cancelForward": "Cancel forward",
    "direct.failedForwardMessage": "Failed to forward message",
    "direct.noForwardTargets": "No other direct conversations",
    "direct.react": "React",
    "direct.copyText": "Copy text",
    "direct.messageMenu": "Message actions",
    "direct.edit": "Edit",
    "direct.editingMessage": "Editing message",
    "direct.cancelEdit": "Cancel edit",
    "direct.failedEditMessage": "Failed to edit message",
    "direct.saveEdit": "Save",
    "direct.delete": "Delete",
    "direct.confirmDelete": "Delete this message?",
    "direct.failedDeleteMessage": "Failed to delete message",
    "direct.typing": "{arg0} is typing…",
    "direct.typingFallback": "Someone is typing…",
    "direct.unreadMessages": "Unread messages",
    "sidebar.moveUp": "Move up",
    "sidebar.moveDown": "Move down",
    "sidebar.direct": "Direct",
    "sidebar.directMessages": "Direct messages",
    "sidebar.workspaces": "Workspaces",
    "sidebar.overview": "Overview",
    "sidebar.loading": "Loading…",
    "sidebar.failedToLoadWorkspaces": "Failed to load workspaces",
    "sidebar.noWorkspacesYet": "No workspaces yet",
    "sidebar.failedToLoadChannels": "Failed to load channels",
    "sidebar.noChannelsYet": "No channels yet",
    "sidebar.unknownUser": "Unknown",
    "sidebar.publicShort": "Pub",
    "sidebar.privateShort": "Prv",
    "workspace.confirmArchiveChannelPrefix": "Archive channel",
    "workspace.confirmArchiveChannelBody": "This will hide the channel from the workspace. Only the channel owner can do this.",
    "workspace.confirmRestoreChannelPrefix": "Restore channel",
    "workspace.confirmLeaveWorkspacePrefix": "Leave workspace",
    "workspace.confirmRemoveMemberPrefix": "Remove",
    "workspace.confirmRemoveMemberSuffix": "from this workspace?",
    "workspace.fallbackThisWorkspace": "this workspace",
    "workspace.errorChannelNameTooShort": "Channel name must be at least 2 characters",
    "workspace.errorCreateChannelFailed": "Failed to create channel",
    "workspace.errorLoadWorkspaceFailed": "Failed to load workspace",
    "workspace.errorLoadMembersFailed": "Failed to load members",
    "workspace.errorLoadArchivedChannelsFailed": "Failed to load archived channels",
    "workspace.errorArchiveChannelFailed": "Failed to archive channel",
    "workspace.errorRestoreChannelFailed": "Failed to restore channel",
    "workspace.errorEnterUsernameOrEmail": "Enter a username or email",
    "workspace.errorAddMemberFailed": "Failed to add member",
    "workspace.errorLeaveWorkspaceFailed": "Failed to leave workspace",
    "workspace.errorRemoveMemberFailed": "Failed to remove member",
    "workspace.invitationSent": "Invitation sent",
    "workspace.memberRemoved": "Member removed",
    "dashboard.errorLoadWorkspacesFailed": "Failed to load workspaces",
    "dashboard.errorLoadInvitesFailed": "Failed to load invites",
    "dashboard.errorLoadChannelInvitesFailed": "Failed to load channel invites",
    "dashboard.errorLoadArchivedWorkspacesFailed": "Failed to load archived workspaces",
    "dashboard.errorNameRequired": "Name is required",
    "dashboard.errorCreateWorkspaceFailed": "Failed to create workspace",
    "dashboard.errorArchiveWorkspaceFailed": "Failed to archive workspace",
    "dashboard.errorAcceptInviteFailed": "Failed to accept invite",
    "dashboard.errorDeclineInviteFailed": "Failed to decline invite",
    "dashboard.errorAcceptChannelInviteFailed": "Failed to accept channel invite",
    "dashboard.errorDeclineChannelInviteFailed": "Failed to decline channel invite",
    "dashboard.errorRestoreWorkspaceFailed": "Failed to restore workspace",
    "dashboard.confirmArchiveWorkspacePrefix": "Archive workspace",
    "dashboard.confirmArchiveWorkspaceBody": "This will hide the workspace and all its channels. Only the workspace owner can do this.",
    "dashboard.confirmDeclineInvitation": "Decline this invitation?",
    "dashboard.confirmDeclineChannelInvitation": "Decline this channel invitation?",
    "dashboard.confirmRestoreWorkspacePrefix": "Restore workspace",
  },
  uk: {
    "header.profile": "Профіль",
    "header.logout": "Вийти",
    "header.signIn": "Увійти",
    "header.createAccount": "Створити акаунт",
    "profile.title": "Профіль",
    "profile.back": "← Назад до панелі",
    "profile.accountInfo": "Інформація акаунта",
    "profile.email": "Email",
    "profile.username": "Імʼя користувача",
    "profile.displayName": "Відображуване імʼя",
    "profile.displayNamePlaceholder": "Ваше відображуване імʼя",
    "profile.editDisplayName": "Редагувати відображуване імʼя",
    "profile.save": "Зберегти імʼя",
    "profile.saving": "Зберігаємо…",
    "profile.displayNameUpdated": "Імʼя оновлено.",
    "profile.avatar": "Аватар",
    "profile.uploadAvatar": "Завантажити аватар",
    "profile.uploading": "Завантажуємо…",
    "profile.avatarUpdated": "Аватар оновлено.",
    "profile.interfaceLanguage": "Мова інтерфейсу",
    "profile.selected": "Обрано:",
    "profile.languageSaved": "Мову збережено.",
    "profile.languageSaveFailed": "Не вдалося зберегти мову.",
    "profile.errorUpdateDisplayNameFailed": "Не вдалося оновити відображуване імʼя",
    "profile.errorAvatarInvalidType": "Дозволені лише зображення JPEG, PNG або WebP",
    "profile.errorAvatarTooLarge": "Зображення має бути 2 МБ або менше",
    "profile.errorUploadAvatarFailed": "Не вдалося завантажити аватар",
    "profile.avatarPreviewAlt": "Попередній перегляд аватара",
    "profile.avatarAlt": "Аватар",
    "dashboard.welcome": "Вітаємо",
    "dashboard.signedInAs": "Ви увійшли як",
    "dashboard.profileSettings": "Налаштування профілю",
    "dashboard.createWorkspace": "Створити робочий простір",
    "dashboard.workspaceName": "Назва робочого простору",
    "dashboard.workspaceSlug": "slug (необовʼязково, генерується автоматично)",
    "dashboard.create": "Створити",
    "dashboard.creating": "Створюємо…",
    "dashboard.yourWorkspaces": "Ваші робочі простори",
    "dashboard.noWorkspaces": "Робочих просторів ще немає. Створіть один, щоб почати.",
    "dashboard.pendingInvitations": "Запрошення",
    "dashboard.pendingChannelInvitations": "Запрошення до каналів",
    "dashboard.archivedWorkspaces": "Архівовані робочі простори",
    "dashboard.loading": "Завантажуємо сесію…",
    "dashboard.loadingInvites": "Завантажуємо запрошення…",
    "dashboard.loadingChannelInvites": "Завантажуємо запрошення до каналів…",
    "dashboard.loadingArchived": "Завантажуємо архівовані простори…",
    "dashboard.loadingWorkspaces": "Завантажуємо робочі простори…",
    "dashboard.archivedLabel": "Архівовано",
    "dashboard.noPendingInvitations": "Немає запрошень.",
    "dashboard.noPendingChannelInvitations": "Немає запрошень до каналів.",
    "dashboard.noArchivedWorkspaces": "Немає архівованих робочих просторів.",
    "dashboard.invitedBy": "Запросив",
    "dashboard.joinAs": "Ви приєднаєтесь як",
    "dashboard.accept": "Прийняти",
    "dashboard.decline": "Відхилити",
    "dashboard.archive": "Архівувати",
    "dashboard.restore": "Відновити",
    "auth.loadingSession": "Завантажуємо сесію…",
    "auth.authRequired": "Потрібна автентифікація",
    "auth.pleaseSignIn": "Увійдіть, щоб переглянути профіль.",
    "auth.pleaseSignInDashboard": "Увійдіть, щоб переглянути панель.",
    "auth.signIn": "Увійти",
    "auth.pleaseSignInWorkspace": "Увійдіть, щоб переглянути робочий простір.",
    "auth.pleaseSignInChannel": "Увійдіть, щоб переглянути канал.",
    "auth.loginTitle": "Увійти",
    "auth.loginSubtitle": "Раді бачити вас знову. Введіть свої дані.",
    "auth.email": "Email",
    "auth.password": "Пароль",
    "auth.signingIn": "Входимо…",
    "auth.emailPasswordRequired": "Email і пароль обовʼязкові",
    "auth.loginFailed": "Не вдалося увійти",
    "auth.signedInAs": "Ви увійшли як",
    "auth.noAccount": "Немає акаунта?",
    "auth.createOne": "Створити",
    "auth.registerTitle": "Створити акаунт",
    "auth.registerSubtitle": "Почніть з безкоштовного акаунта.",
    "auth.username": "Імʼя користувача",
    "auth.usernameHint": "Дозволені літери, цифри та підкреслення.",
    "auth.passwordHint": "Мінімум 8 символів.",
    "auth.creatingAccount": "Створюємо акаунт…",
    "auth.allFieldsRequired": "Усі поля обовʼязкові",
    "auth.usernameInvalid": "Імʼя користувача може містити лише літери, цифри та підкреслення",
    "auth.registrationFailed": "Не вдалося зареєструватися",
    "auth.accountCreatedFor": "Акаунт створено для",
    "auth.alreadyHaveAccount": "Вже маєте акаунт?",
    "workspace.backToDashboard": "← Назад до панелі",
    "workspace.loading": "Завантажуємо робочий простір…",
    "workspace.createChannel": "Створити канал",
    "workspace.channelName": "Назва каналу",
    "workspace.channelDescription": "Опис (необовʼязково)",
    "workspace.publicChannel": "Публічний",
    "workspace.privateChannel": "Приватний",
    "workspace.create": "Створити",
    "workspace.creating": "Створюємо…",
    "workspace.channels": "Канали",
    "workspace.loadingChannels": "Завантажуємо канали…",
    "workspace.noChannels": "Каналів ще немає.",
    "workspace.archive": "Архівувати",
    "workspace.members": "Учасники",
    "workspace.loadingMembers": "Завантажуємо учасників…",
    "workspace.noMembers": "Учасників ще немає.",
    "workspace.remove": "Вилучити",
    "workspace.removing": "Вилучаємо…",
    "workspace.invitePlaceholder": "Імʼя користувача або email",
    "workspace.owner": "Власник",
    "workspace.admin": "Адмін",
    "workspace.member": "Учасник",
    "workspace.addMember": "Додати учасника",
    "workspace.addingMember": "Додаємо…",
    "workspace.leaveWorkspace": "Покинути простір",
    "workspace.archivedChannels": "Архівовані канали",
    "workspace.loadingArchived": "Завантажуємо архівовані канали…",
    "workspace.noArchivedChannels": "Немає архівованих каналів.",
    "workspace.restore": "Відновити",
    "workspace.restoring": "Відновлюємо…",
    "channel.backToWorkspace": "← Назад до робочого простору",
    "channel.loading": "Завантажуємо канал…",
    "channel.archive": "Архівувати",
    "channel.archiving": "Архівуємо…",
    "channel.leaveChannel": "Покинути канал",
    "channel.leaving": "Покидаємо…",
    "channel.messages": "Повідомлення",
    "channel.messagePlaceholder": "Напишіть повідомлення…",
    "channel.send": "Надіслати",
    "channel.sending": "Надсилаємо…",
    "channel.loadingMessages": "Завантажуємо повідомлення…",
    "channel.noMessages": "Повідомлень ще немає.",
    "channel.members": "Учасники",
    "channel.invitePlaceholder": "Імʼя користувача або email",
    "channel.add": "Додати",
    "channel.adding": "Додаємо…",
    "channel.member": "Учасник",
    "channel.admin": "Адмін",
    "channel.owner": "Власник",
    "channel.publicChannel": "Публічний",
    "channel.privateChannel": "Приватний",
    "channel.invitationSent": "Запрошення до каналу надіслано",
    "channel.loadingMembers": "Завантажуємо учасників…",
    "channel.noMembers": "Учасників ще немає.",
    "channel.searchMembers": "Пошук учасників…",
    "channel.remove": "Вилучити",
    "channel.removing": "Вилучаємо…",
    "channel.edit": "Редагувати",
    "channel.delete": "Видалити",
    "channel.save": "Зберегти",
    "channel.savingEdit": "Зберігаємо…",
    "channel.cancel": "Скасувати",
    "channel.edited": "змінено",
    "channel.reply": "Відповісти",
    "channel.replyingTo": "Відповідь на",
    "channel.replyOriginalUnavailable": "Оригінальне повідомлення не завантажено",
    "channel.cancelReply": "Скасувати відповідь",
    "channel.isTyping": "пише…",
    "channel.areTyping": "пишуть…",
    "channel.confirmDeleteMessage": "Видалити це повідомлення?",
    "channel.confirmArchiveChannelPrefix": "Архівувати канал",
    "channel.confirmArchiveChannelBody": "Це приховає канал з робочого простору. Це може зробити лише власник каналу.",
    "channel.confirmLeaveChannelPrefix": "Покинути канал",
    "channel.confirmRemoveMemberPrefix": "Вилучити учасника",
    "channel.confirmRemoveMemberSuffix": "з цього каналу?",
    "channel.fallbackThisChannel": "цей канал",
    "channel.errorMessageEmpty": "Повідомлення не може бути порожнім",
    "channel.errorMessageTooLong": "Повідомлення занадто довге (максимум 4000 символів)",
    "channel.errorUpdateMessageFailed": "Не вдалося оновити повідомлення",
    "channel.errorDeleteMessageFailed": "Не вдалося видалити повідомлення",
    "channel.errorLoadChannelFailed": "Не вдалося завантажити канал",
    "channel.errorLoadMembersFailed": "Не вдалося завантажити учасників",
    "channel.errorArchiveChannelFailed": "Не вдалося архівувати канал",
    "channel.errorLeaveChannelFailed": "Не вдалося покинути канал",
    "channel.errorUsernameOrEmailRequired": "Потрібно вказати імʼя користувача або email",
    "channel.errorSendInvitationFailed": "Не вдалося надіслати запрошення",
    "channel.errorSendMessageFailed": "Не вдалося надіслати повідомлення",
    "channel.errorRemoveMemberFailed": "Не вдалося вилучити учасника",
    "channel.react": "Реакція",
    "channel.failedReactMessage": "Не вдалося додати реакцію",
    "channel.failedRemoveReaction": "Не вдалося прибрати реакцію",
    "channel.copyText": "Копіювати текст",
    "channel.forward": "Переслати",
    "channel.forwardTo": "Переслати до",
    "channel.errorForwardFailed": "Не вдалося переслати повідомлення",
    "channel.noConversations": "Особистих розмов ще немає.",
    "channel.messageMenu": "Дії з повідомленням",
    "channel.socketDisconnected": "Відʼєднано",
    "channel.socketConnecting": "Підключення",
    "channel.socketConnected": "Підключено",
    "channel.socketJoined": "Приєднано",
    "channel.socketError": "Помилка",
    "messageAuthor.unknownUser": "Невідомий користувач",
    "direct.title": "Особисті повідомлення",
    "direct.startChat": "Почати чат",
    "direct.usernameOrEmail": "Імʼя користувача або email",
    "direct.noConversations": "Розмов ще немає.",
    "direct.loadingConversations": "Завантажуємо розмови…",
    "direct.failedLoadConversations": "Не вдалося завантажити розмови",
    "direct.failedStartConversation": "Не вдалося почати розмову",
    "direct.typeMessage": "Напишіть повідомлення…",
    "direct.send": "Надіслати",
    "direct.sending": "Надсилаємо…",
    "direct.loadingMessages": "Завантажуємо повідомлення…",
    "direct.noMessages": "Повідомлень ще немає.",
    "direct.online": "Онлайн",
    "direct.offline": "Офлайн",
    "direct.sent": "Надіслано",
    "direct.seen": "Переглянуто",
    "direct.failedLoadMessages": "Не вдалося завантажити повідомлення",
    "direct.failedSendMessage": "Не вдалося надіслати повідомлення",
    "direct.backToDirectMessages": "← Назад до особистих повідомлень",
    "direct.reply": "Відповісти",
    "direct.replyingTo": "Відповідь для",
    "direct.cancelReply": "Скасувати відповідь",
    "direct.originalMessageMissing": "Оригінальне повідомлення не завантажено",
    "direct.forward": "Переслати",
    "direct.forwardMessage": "Переслати повідомлення",
    "direct.forwardTo": "Переслати до",
    "direct.cancelForward": "Скасувати пересилання",
    "direct.failedForwardMessage": "Не вдалося переслати повідомлення",
    "direct.noForwardTargets": "Немає інших особистих чатів",
    "direct.react": "Реакція",
    "direct.copyText": "Копіювати текст",
    "direct.messageMenu": "Дії з повідомленням",
    "direct.edit": "Редагувати",
    "direct.editingMessage": "Редагування повідомлення",
    "direct.cancelEdit": "Скасувати редагування",
    "direct.failedEditMessage": "Не вдалося відредагувати повідомлення",
    "direct.saveEdit": "Зберегти",
    "direct.delete": "Видалити",
    "direct.confirmDelete": "Видалити це повідомлення?",
    "direct.failedDeleteMessage": "Не вдалося видалити повідомлення",
    "direct.typing": "{arg0} друкує…",
    "direct.typingFallback": "Хтось друкує…",
    "direct.unreadMessages": "Непрочитані повідомлення",
    "sidebar.moveUp": "Перемістити вгору",
    "sidebar.moveDown": "Перемістити вниз",
    "sidebar.direct": "Особисті",
    "sidebar.directMessages": "Особисті повідомлення",
    "sidebar.workspaces": "Робочі простори",
    "sidebar.overview": "Огляд",
    "sidebar.loading": "Завантаження…",
    "sidebar.failedToLoadWorkspaces": "Не вдалося завантажити робочі простори",
    "sidebar.noWorkspacesYet": "Робочих просторів ще немає",
    "sidebar.failedToLoadChannels": "Не вдалося завантажити канали",
    "sidebar.noChannelsYet": "Каналів ще немає",
    "sidebar.unknownUser": "Невідомо",
    "sidebar.publicShort": "Публ.",
    "sidebar.privateShort": "Прив.",
    "workspace.confirmArchiveChannelPrefix": "Архівувати канал",
    "workspace.confirmArchiveChannelBody": "Це приховає канал з робочого простору. Це може зробити лише власник каналу.",
    "workspace.confirmRestoreChannelPrefix": "Відновити канал",
    "workspace.confirmLeaveWorkspacePrefix": "Покинути робочий простір",
    "workspace.confirmRemoveMemberPrefix": "Вилучити",
    "workspace.confirmRemoveMemberSuffix": "з цього робочого простору?",
    "workspace.fallbackThisWorkspace": "цей робочий простір",
    "workspace.errorChannelNameTooShort": "Назва каналу має містити щонайменше 2 символи",
    "workspace.errorCreateChannelFailed": "Не вдалося створити канал",
    "workspace.errorLoadWorkspaceFailed": "Не вдалося завантажити робочий простір",
    "workspace.errorLoadMembersFailed": "Не вдалося завантажити учасників",
    "workspace.errorLoadArchivedChannelsFailed": "Не вдалося завантажити архівовані канали",
    "workspace.errorArchiveChannelFailed": "Не вдалося архівувати канал",
    "workspace.errorRestoreChannelFailed": "Не вдалося відновити канал",
    "workspace.errorEnterUsernameOrEmail": "Вкажіть імʼя користувача або email",
    "workspace.errorAddMemberFailed": "Не вдалося додати учасника",
    "workspace.errorLeaveWorkspaceFailed": "Не вдалося покинути робочий простір",
    "workspace.errorRemoveMemberFailed": "Не вдалося вилучити учасника",
    "workspace.invitationSent": "Запрошення надіслано",
    "workspace.memberRemoved": "Учасника вилучено",
    "dashboard.errorLoadWorkspacesFailed": "Не вдалося завантажити робочі простори",
    "dashboard.errorLoadInvitesFailed": "Не вдалося завантажити запрошення",
    "dashboard.errorLoadChannelInvitesFailed": "Не вдалося завантажити запрошення до каналів",
    "dashboard.errorLoadArchivedWorkspacesFailed": "Не вдалося завантажити архівовані робочі простори",
    "dashboard.errorNameRequired": "Назва обовʼязкова",
    "dashboard.errorCreateWorkspaceFailed": "Не вдалося створити робочий простір",
    "dashboard.errorArchiveWorkspaceFailed": "Не вдалося архівувати робочий простір",
    "dashboard.errorAcceptInviteFailed": "Не вдалося прийняти запрошення",
    "dashboard.errorDeclineInviteFailed": "Не вдалося відхилити запрошення",
    "dashboard.errorAcceptChannelInviteFailed": "Не вдалося прийняти запрошення до каналу",
    "dashboard.errorDeclineChannelInviteFailed": "Не вдалося відхилити запрошення до каналу",
    "dashboard.errorRestoreWorkspaceFailed": "Не вдалося відновити робочий простір",
    "dashboard.confirmArchiveWorkspacePrefix": "Архівувати робочий простір",
    "dashboard.confirmArchiveWorkspaceBody": "Це приховає робочий простір і всі його канали. Це може зробити лише власник робочого простору.",
    "dashboard.confirmDeclineInvitation": "Відхилити це запрошення?",
    "dashboard.confirmDeclineChannelInvitation": "Відхилити це запрошення до каналу?",
    "dashboard.confirmRestoreWorkspacePrefix": "Відновити робочий простір",
  },
  ru: {
    "header.profile": "Профиль",
    "header.logout": "Выйти",
    "header.signIn": "Войти",
    "header.createAccount": "Создать аккаунт",
    "profile.title": "Профиль",
    "profile.back": "← Назад к панели",
    "profile.accountInfo": "Информация аккаунта",
    "profile.email": "Email",
    "profile.username": "Имя пользователя",
    "profile.displayName": "Отображаемое имя",
    "profile.displayNamePlaceholder": "Ваше отображаемое имя",
    "profile.editDisplayName": "Редактировать отображаемое имя",
    "profile.save": "Сохранить имя",
    "profile.saving": "Сохраняем…",
    "profile.displayNameUpdated": "Имя обновлено.",
    "profile.avatar": "Аватар",
    "profile.uploadAvatar": "Загрузить аватар",
    "profile.uploading": "Загружаем…",
    "profile.avatarUpdated": "Аватар обновлён.",
    "profile.interfaceLanguage": "Язык интерфейса",
    "profile.selected": "Выбрано:",
    "profile.languageSaved": "Язык сохранён.",
    "profile.languageSaveFailed": "Не удалось сохранить язык.",
    "profile.errorUpdateDisplayNameFailed": "Не удалось обновить отображаемое имя",
    "profile.errorAvatarInvalidType": "Разрешены только изображения JPEG, PNG или WebP",
    "profile.errorAvatarTooLarge": "Изображение должно быть 2 МБ или меньше",
    "profile.errorUploadAvatarFailed": "Не удалось загрузить аватар",
    "profile.avatarPreviewAlt": "Предпросмотр аватара",
    "profile.avatarAlt": "Аватар",
    "dashboard.welcome": "Добро пожаловать",
    "dashboard.signedInAs": "Вы вошли как",
    "dashboard.profileSettings": "Настройки профиля",
    "dashboard.createWorkspace": "Создать рабочее пространство",
    "dashboard.workspaceName": "Название рабочего пространства",
    "dashboard.workspaceSlug": "slug (необязательно, генерируется автоматически)",
    "dashboard.create": "Создать",
    "dashboard.creating": "Создаём…",
    "dashboard.yourWorkspaces": "Ваши рабочие пространства",
    "dashboard.noWorkspaces": "Рабочих пространств пока нет. Создайте одно, чтобы начать.",
    "dashboard.pendingInvitations": "Приглашения",
    "dashboard.pendingChannelInvitations": "Приглашения в каналы",
    "dashboard.archivedWorkspaces": "Архивированные рабочие пространства",
    "dashboard.loading": "Загружаем сессию…",
    "dashboard.loadingInvites": "Загружаем приглашения…",
    "dashboard.loadingChannelInvites": "Загружаем приглашения в каналы…",
    "dashboard.loadingArchived": "Загружаем архивированные пространства…",
    "dashboard.loadingWorkspaces": "Загружаем рабочие пространства…",
    "dashboard.archivedLabel": "Архивировано",
    "dashboard.noPendingInvitations": "Нет приглашений.",
    "dashboard.noPendingChannelInvitations": "Нет приглашений в каналы.",
    "dashboard.noArchivedWorkspaces": "Нет архивированных рабочих пространств.",
    "dashboard.invitedBy": "Пригласил",
    "dashboard.joinAs": "Вы присоединитесь как",
    "dashboard.accept": "Принять",
    "dashboard.decline": "Отклонить",
    "dashboard.archive": "Архивировать",
    "dashboard.restore": "Восстановить",
    "auth.loadingSession": "Загружаем сессию…",
    "auth.authRequired": "Требуется аутентификация",
    "auth.pleaseSignIn": "Войдите, чтобы просмотреть профиль.",
    "auth.pleaseSignInDashboard": "Войдите, чтобы просмотреть панель.",
    "auth.signIn": "Войти",
    "auth.pleaseSignInWorkspace": "Войдите, чтобы просмотреть рабочее пространство.",
    "auth.pleaseSignInChannel": "Войдите, чтобы просмотреть канал.",
    "auth.loginTitle": "Войти",
    "auth.loginSubtitle": "Рады видеть вас снова. Введите свои данные.",
    "auth.email": "Email",
    "auth.password": "Пароль",
    "auth.signingIn": "Входим…",
    "auth.emailPasswordRequired": "Email и пароль обязательны",
    "auth.loginFailed": "Не удалось войти",
    "auth.signedInAs": "Вы вошли как",
    "auth.noAccount": "Нет аккаунта?",
    "auth.createOne": "Создать",
    "auth.registerTitle": "Создать аккаунт",
    "auth.registerSubtitle": "Начните с бесплатного аккаунта.",
    "auth.username": "Имя пользователя",
    "auth.usernameHint": "Разрешены буквы, цифры и подчёркивание.",
    "auth.passwordHint": "Минимум 8 символов.",
    "auth.creatingAccount": "Создаём аккаунт…",
    "auth.allFieldsRequired": "Все поля обязательны",
    "auth.usernameInvalid": "Имя пользователя может содержать только буквы, цифры и подчёркивание",
    "auth.registrationFailed": "Не удалось зарегистрироваться",
    "auth.accountCreatedFor": "Аккаунт создан для",
    "auth.alreadyHaveAccount": "Уже есть аккаунт?",
    "workspace.backToDashboard": "← Назад к панели",
    "workspace.loading": "Загружаем рабочее пространство…",
    "workspace.createChannel": "Создать канал",
    "workspace.channelName": "Название канала",
    "workspace.channelDescription": "Описание (необязательно)",
    "workspace.publicChannel": "Публичный",
    "workspace.privateChannel": "Приватный",
    "workspace.create": "Создать",
    "workspace.creating": "Создаём…",
    "workspace.channels": "Каналы",
    "workspace.loadingChannels": "Загружаем каналы…",
    "workspace.noChannels": "Каналов пока нет.",
    "workspace.archive": "Архивировать",
    "workspace.members": "Участники",
    "workspace.loadingMembers": "Загружаем участников…",
    "workspace.noMembers": "Участников пока нет.",
    "workspace.remove": "Удалить",
    "workspace.removing": "Удаляем…",
    "workspace.invitePlaceholder": "Имя пользователя или email",
    "workspace.owner": "Владелец",
    "workspace.admin": "Админ",
    "workspace.member": "Участник",
    "workspace.addMember": "Добавить участника",
    "workspace.addingMember": "Добавляем…",
    "workspace.leaveWorkspace": "Покинуть пространство",
    "workspace.archivedChannels": "Архивированные каналы",
    "workspace.loadingArchived": "Загружаем архивированные каналы…",
    "workspace.noArchivedChannels": "Нет архивированных каналов.",
    "workspace.restore": "Восстановить",
    "workspace.restoring": "Восстанавливаем…",
    "channel.backToWorkspace": "← Назад к рабочему пространству",
    "channel.loading": "Загружаем канал…",
    "channel.archive": "Архивировать",
    "channel.archiving": "Архивируем…",
    "channel.leaveChannel": "Покинуть канал",
    "channel.leaving": "Покидаем…",
    "channel.messages": "Сообщения",
    "channel.messagePlaceholder": "Напишите сообщение…",
    "channel.send": "Отправить",
    "channel.sending": "Отправляем…",
    "channel.loadingMessages": "Загружаем сообщения…",
    "channel.noMessages": "Сообщений пока нет.",
    "channel.members": "Участники",
    "channel.invitePlaceholder": "Имя пользователя или email",
    "channel.add": "Добавить",
    "channel.adding": "Добавляем…",
    "channel.member": "Участник",
    "channel.admin": "Админ",
    "channel.owner": "Владелец",
    "channel.publicChannel": "Публичный",
    "channel.privateChannel": "Приватный",
    "channel.invitationSent": "Приглашение в канал отправлено",
    "channel.loadingMembers": "Загружаем участников…",
    "channel.noMembers": "Участников пока нет.",
    "channel.searchMembers": "Поиск участников…",
    "channel.remove": "Удалить",
    "channel.removing": "Удаляем…",
    "channel.edit": "Редактировать",
    "channel.delete": "Удалить",
    "channel.save": "Сохранить",
    "channel.savingEdit": "Сохраняем…",
    "channel.cancel": "Отмена",
    "channel.edited": "изменено",
    "channel.reply": "Ответить",
    "channel.replyingTo": "Ответ на",
    "channel.replyOriginalUnavailable": "Исходное сообщение не загружено",
    "channel.cancelReply": "Отменить ответ",
    "channel.isTyping": "печатает…",
    "channel.areTyping": "печатают…",
    "channel.confirmDeleteMessage": "Удалить это сообщение?",
    "channel.confirmArchiveChannelPrefix": "Архивировать канал",
    "channel.confirmArchiveChannelBody": "Это скроет канал из рабочего пространства. Это может сделать только владелец канала.",
    "channel.confirmLeaveChannelPrefix": "Покинуть канал",
    "channel.confirmRemoveMemberPrefix": "Удалить участника",
    "channel.confirmRemoveMemberSuffix": "из этого канала?",
    "channel.fallbackThisChannel": "этот канал",
    "channel.errorMessageEmpty": "Сообщение не может быть пустым",
    "channel.errorMessageTooLong": "Сообщение слишком длинное (максимум 4000 символов)",
    "channel.errorUpdateMessageFailed": "Не удалось обновить сообщение",
    "channel.errorDeleteMessageFailed": "Не удалось удалить сообщение",
    "channel.errorLoadChannelFailed": "Не удалось загрузить канал",
    "channel.errorLoadMembersFailed": "Не удалось загрузить участников",
    "channel.errorArchiveChannelFailed": "Не удалось архивировать канал",
    "channel.errorLeaveChannelFailed": "Не удалось покинуть канал",
    "channel.errorUsernameOrEmailRequired": "Нужно указать имя пользователя или email",
    "channel.errorSendInvitationFailed": "Не удалось отправить приглашение",
    "channel.errorSendMessageFailed": "Не удалось отправить сообщение",
    "channel.errorRemoveMemberFailed": "Не удалось удалить участника",
    "channel.react": "Реакция",
    "channel.failedReactMessage": "Не удалось добавить реакцию",
    "channel.failedRemoveReaction": "Не удалось убрать реакцию",
    "channel.copyText": "Копировать текст",
    "channel.forward": "Переслать",
    "channel.forwardTo": "Переслать в",
    "channel.errorForwardFailed": "Не удалось переслать сообщение",
    "channel.noConversations": "Личных переписок пока нет.",
    "channel.messageMenu": "Действия с сообщением",
    "channel.socketDisconnected": "Отключено",
    "channel.socketConnecting": "Подключение",
    "channel.socketConnected": "Подключено",
    "channel.socketJoined": "Подключено к каналу",
    "channel.socketError": "Ошибка",
    "messageAuthor.unknownUser": "Неизвестный пользователь",
    "direct.title": "Личные сообщения",
    "direct.startChat": "Начать чат",
    "direct.usernameOrEmail": "Имя пользователя или email",
    "direct.noConversations": "Разговоров пока нет.",
    "direct.loadingConversations": "Загружаем разговоры…",
    "direct.failedLoadConversations": "Не удалось загрузить разговоры",
    "direct.failedStartConversation": "Не удалось начать разговор",
    "direct.typeMessage": "Напишите сообщение…",
    "direct.send": "Отправить",
    "direct.sending": "Отправляем…",
    "direct.loadingMessages": "Загружаем сообщения…",
    "direct.noMessages": "Сообщений пока нет.",
    "direct.online": "Онлайн",
    "direct.offline": "Офлайн",
    "direct.sent": "Отправлено",
    "direct.seen": "Просмотрено",
    "direct.failedLoadMessages": "Не удалось загрузить сообщения",
    "direct.failedSendMessage": "Не удалось отправить сообщение",
    "direct.backToDirectMessages": "← Назад к личным сообщениям",
    "direct.reply": "Ответить",
    "direct.replyingTo": "Ответ для",
    "direct.cancelReply": "Отменить ответ",
    "direct.originalMessageMissing": "Исходное сообщение не загружено",
    "direct.forward": "Переслать",
    "direct.forwardMessage": "Переслать сообщение",
    "direct.forwardTo": "Переслать в",
    "direct.cancelForward": "Отменить пересылку",
    "direct.failedForwardMessage": "Не удалось переслать сообщение",
    "direct.noForwardTargets": "Нет других личных чатов",
    "direct.react": "Реакция",
    "direct.copyText": "Копировать текст",
    "direct.messageMenu": "Действия с сообщением",
    "direct.edit": "Редактировать",
    "direct.editingMessage": "Редактирование сообщения",
    "direct.cancelEdit": "Отменить редактирование",
    "direct.failedEditMessage": "Не удалось отредактировать сообщение",
    "direct.saveEdit": "Сохранить",
    "direct.delete": "Удалить",
    "direct.confirmDelete": "Удалить это сообщение?",
    "direct.failedDeleteMessage": "Не удалось удалить сообщение",
    "direct.typing": "{arg0} печатает…",
    "direct.typingFallback": "Кто-то печатает…",
    "direct.unreadMessages": "Непрочитанные сообщения",
    "sidebar.moveUp": "Переместить вверх",
    "sidebar.moveDown": "Переместить вниз",
    "sidebar.direct": "Личные",
    "sidebar.directMessages": "Личные сообщения",
    "sidebar.workspaces": "Рабочие пространства",
    "sidebar.overview": "Обзор",
    "sidebar.loading": "Загрузка…",
    "sidebar.failedToLoadWorkspaces": "Не удалось загрузить рабочие пространства",
    "sidebar.noWorkspacesYet": "Рабочих пространств ещё нет",
    "sidebar.failedToLoadChannels": "Не удалось загрузить каналы",
    "sidebar.noChannelsYet": "Каналов ещё нет",
    "sidebar.unknownUser": "Неизвестно",
    "sidebar.publicShort": "Публ.",
    "sidebar.privateShort": "Прив.",
    "workspace.confirmArchiveChannelPrefix": "Архивировать канал",
    "workspace.confirmArchiveChannelBody": "Это скроет канал из рабочего пространства. Это может сделать только владелец канала.",
    "workspace.confirmRestoreChannelPrefix": "Восстановить канал",
    "workspace.confirmLeaveWorkspacePrefix": "Покинуть рабочее пространство",
    "workspace.confirmRemoveMemberPrefix": "Удалить",
    "workspace.confirmRemoveMemberSuffix": "из этого рабочего пространства?",
    "workspace.fallbackThisWorkspace": "это рабочее пространство",
    "workspace.errorChannelNameTooShort": "Название канала должно быть не короче 2 символов",
    "workspace.errorCreateChannelFailed": "Не удалось создать канал",
    "workspace.errorLoadWorkspaceFailed": "Не удалось загрузить рабочее пространство",
    "workspace.errorLoadMembersFailed": "Не удалось загрузить участников",
    "workspace.errorLoadArchivedChannelsFailed": "Не удалось загрузить архивированные каналы",
    "workspace.errorArchiveChannelFailed": "Не удалось архивировать канал",
    "workspace.errorRestoreChannelFailed": "Не удалось восстановить канал",
    "workspace.errorEnterUsernameOrEmail": "Укажите имя пользователя или email",
    "workspace.errorAddMemberFailed": "Не удалось добавить участника",
    "workspace.errorLeaveWorkspaceFailed": "Не удалось покинуть рабочее пространство",
    "workspace.errorRemoveMemberFailed": "Не удалось удалить участника",
    "workspace.invitationSent": "Приглашение отправлено",
    "workspace.memberRemoved": "Участник удалён",
    "dashboard.errorLoadWorkspacesFailed": "Не удалось загрузить рабочие пространства",
    "dashboard.errorLoadInvitesFailed": "Не удалось загрузить приглашения",
    "dashboard.errorLoadChannelInvitesFailed": "Не удалось загрузить приглашения в каналы",
    "dashboard.errorLoadArchivedWorkspacesFailed": "Не удалось загрузить архивированные рабочие пространства",
    "dashboard.errorNameRequired": "Название обязательно",
    "dashboard.errorCreateWorkspaceFailed": "Не удалось создать рабочее пространство",
    "dashboard.errorArchiveWorkspaceFailed": "Не удалось архивировать рабочее пространство",
    "dashboard.errorAcceptInviteFailed": "Не удалось принять приглашение",
    "dashboard.errorDeclineInviteFailed": "Не удалось отклонить приглашение",
    "dashboard.errorAcceptChannelInviteFailed": "Не удалось принять приглашение в канал",
    "dashboard.errorDeclineChannelInviteFailed": "Не удалось отклонить приглашение в канал",
    "dashboard.errorRestoreWorkspaceFailed": "Не удалось восстановить рабочее пространство",
    "dashboard.confirmArchiveWorkspacePrefix": "Архивировать рабочее пространство",
    "dashboard.confirmArchiveWorkspaceBody": "Это скроет рабочее пространство и все его каналы. Это может сделать только владелец рабочего пространства.",
    "dashboard.confirmDeclineInvitation": "Отклонить это приглашение?",
    "dashboard.confirmDeclineChannelInvitation": "Отклонить это приглашение в канал?",
    "dashboard.confirmRestoreWorkspacePrefix": "Восстановить рабочее пространство",
  },
};

export function getLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const raw = localStorage.getItem(LOCALE_KEY);
  if (raw === "uk" || raw === "ru") return raw;
  return "en";
}

export function setLocaleStorage(locale: Locale) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCALE_KEY, locale);
}

export function syncLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  setLocaleStorage(locale);
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGED_EVENT, { detail: locale }));
}

export function localeLabel(locale: Locale): string {
  return LABELS[locale].native;
}

export function translate(locale: Locale, key: TranslationKey): string {
  const value = DICTIONARY[locale][key];
  return typeof value === "function" ? value("") : value;
}

export function useLocale(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, ...args: string[]) => string;
} {
  const locale = useSyncExternalStore<Locale>(
    (callback) => {
      const handleEvent = () => callback();
      window.addEventListener(LOCALE_CHANGED_EVENT, handleEvent);
      return () => window.removeEventListener(LOCALE_CHANGED_EVENT, handleEvent);
    },
    () => getLocale(),
    () => "en",
  );

  const handleSetLocale = useCallback((next: Locale) => {
    syncLocale(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, ...args: string[]) => {
      let value = DICTIONARY[locale][key];
      if (typeof value === "function") {
        return args[0] ? value(args[0]) : value("");
      }
      for (let i = 0; i < args.length; i++) {
        value = (value as string).replace(`{arg${i}}`, args[i]);
      }
      return value as string;
    },
    [locale],
  );

  return { locale, setLocale: handleSetLocale, t };
}
