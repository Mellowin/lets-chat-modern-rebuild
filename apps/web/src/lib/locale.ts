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
  | "header.loading"
  | "header.searchAllMessages"
  | "header.openMenu"
  | "globalSearch.title"
  | "globalSearch.placeholder"
  | "globalSearch.search"
  | "globalSearch.loading"
  | "globalSearch.empty"
  | "globalSearch.error"
  | "globalSearch.loadMore"
  | "globalSearch.publicChannelLabel"
  | "globalSearch.privateChannelLabel"
  | "globalSearch.directLabel"
  | "globalSearch.directConversation"
  | "globalSearch.groupLabel"
  | "globalSearch.scopeAll"
  | "globalSearch.scopeChannel"
  | "globalSearch.scopeDirect"
  | "globalSearch.scopeGroup"
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
  | "profile.changePassword"
  | "profile.currentPassword"
  | "profile.newPassword"
  | "profile.confirmNewPassword"
  | "profile.passwordFieldsRequired"
  | "profile.passwordsDoNotMatch"
  | "profile.passwordChangeFailed"
  | "profile.passwordChanged"
  | "profile.account"
  | "profile.security"
  | "profile.languageSection"
  | "profile.showSessions"
  | "profile.hideSessions"
  | "profile.activeSessionsCount"
  | "profile.sessionsExplanation"
  | "profile.showPassword"
  | "profile.hidePassword"
  | "profile.accountSettings"
  | "profile.profileSettings"
  | "profile.notifications"
  | "profile.pushNotifications"
  | "profile.pushNotificationsDescription"
  | "profile.pushNotificationsUnsupported"
  | "profile.pushNotificationsBlocked"
  | "profile.pushNotificationsDisabled"
  | "profile.pushNotificationsEnabled"
  | "profile.enableNotifications"
  | "profile.disableNotifications"
  | "profile.enablingNotifications"
  | "profile.disablingNotifications"
  | "profile.notificationsEnabled"
  | "profile.notificationsDisabled"
  | "profile.notificationPreferences"
  | "profile.notificationPreferencesDescription"
  | "profile.pushNotificationsToggle"
  | "profile.pushNotificationsToggleDescription"
  | "profile.mentionNotificationsToggle"
  | "profile.mentionNotificationsToggleDescription"
  | "profile.directMessageNotificationsToggle"
  | "profile.directMessageNotificationsToggleDescription"
  | "profile.groupMessageNotificationsToggle"
  | "profile.groupMessageNotificationsToggleDescription"
  | "profile.channelMessageNotificationsToggle"
  | "profile.channelMessageNotificationsToggleDescription"
  | "profile.loadingNotificationPreferences"
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
  | "auth.emailPlaceholder"
  | "auth.password"
  | "auth.usernamePlaceholder"
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
  | "auth.checkYourEmail"
  | "auth.verificationEmailSent"
  | "auth.verifyEmailTitle"
  | "auth.verifyingEmail"
  | "auth.emailVerified"
  | "auth.emailVerificationFailed"
  | "auth.emailVerificationMissingToken"
  | "auth.resendVerification"
  | "auth.resendingVerification"
  | "auth.resendVerificationSuccess"
  | "auth.resendVerificationHint"
  | "auth.resendCooldown"
  | "auth.resendLimitReached"
  | "auth.spamFolderHint"
  | "auth.verificationExpiredOrInvalid"
  | "auth.emailNotVerifiedHint"
  | "auth.emailNotVerified"
  | "auth.signInAfterVerification"
  | "auth.backToSignIn"
  | "auth.loading"
  | "auth.tryDemo"
  | "auth.demoLoading"
  | "auth.demoUnavailable"
  | "auth.passwordsDoNotMatch"
  | "auth.passwordMinLength"
  | "auth.confirmPassword"
  | "auth.forgotPassword"
  | "auth.forgotPasswordTitle"
  | "auth.forgotPasswordSubtitle"
  | "auth.sendResetLink"
  | "auth.resetLinkSent"
  | "auth.resetPasswordTitle"
  | "auth.newPassword"
  | "auth.passwordResetSuccess"
  | "auth.passwordResetFailed"
  | "auth.changeEmailTitle"
  | "auth.changeEmailSubtitle"
  | "auth.currentEmail"
  | "auth.newEmail"
  | "auth.emailChangeRequested"
  | "auth.emailChangeLatestOnly"
  | "auth.confirmEmailChangeTitle"
  | "auth.emailChanged"
  | "auth.emailChangeFailed"
  | "auth.backToProfile"
  | "auth.requestChange"
  | "workspace.backToDashboard"
  | "workspace.loading"
  | "workspace.createChannel"
  | "workspace.channelName"
  | "workspace.channelDescription"
  | "workspace.publicChannel"
  | "workspace.privateChannel"
  | "workspace.channelType"
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
  | "workspace.changeRole"
  | "workspace.confirmChangeRole"
  | "workspace.roleUpdated"
  | "workspace.errorUpdateRoleFailed"
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
  | "workspace.delete"
  | "workspace.deleting"
  | "workspace.confirmDeleteChannelPrefix"
  | "workspace.confirmDeleteChannelBody"
  | "workspace.errorDeleteChannelFailed"
  | "workspace.dangerZone"
  | "workspace.deleteWorkspace"
  | "workspace.deleteWorkspaceDescription"
  | "workspace.deleteWorkspaceConfirmPrefix"
  | "workspace.deleteWorkspaceConfirmBody"
  | "workspace.deleteWorkspaceInputPlaceholder"
  | "workspace.deletingWorkspace"
  | "workspace.errorDeleteWorkspaceFailed"
  | "workspace.confirmDeleteWorkspace"
  | "channel.backToWorkspace"
  | "invite.loadingInvite"
  | "invite.invitedToJoin"
  | "invite.inviteExpires"
  | "invite.acceptInvite"
  | "invite.acceptingInvite"
  | "invite.inviteAccepted"
  | "invite.invalidOrExpired"
  | "invite.signInToAccept"
  | "invite.goToWorkspace"
  | "invite.goToLogin"
  | "invite.acceptFailed"
  | "invite.goToDashboard"
  | "invite.expired"
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
  | "channel.loadOlderMessages"
  | "channel.loadingOlderMessages"
  | "channel.errorLoadMessagesFailed"
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
  | "channel.membersPanelInfo"
  | "channel.manageWorkspaceRoles"
  | "channel.inviteAcceptanceNote"
  | "channel.publicChannelNote"
  | "channel.privateChannelNote"
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
  | "channel.replyAttachmentIndicator"
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
  | "channel.attachFile"
  | "channel.removeAttachment"
  | "channel.errorTooManyAttachments"
  | "channel.errorInvalidAttachmentType"
  | "channel.errorAttachmentTooLarge"
  | "channel.errorAttachmentTooLargeByCategory"
  | "channel.errorAttachmentsTotalTooLarge"
  | "channel.errorSomeAttachmentsInvalid"
  | "channel.errorDownloadFailed"
  | "channel.attachmentUploading"
  | "channel.attachmentUploadFailed"
  | "channel.retryUpload"
  | "channel.attachmentReady"
  | "channel.attachmentUploaded"
  | "channel.attachmentLoading"
  | "channel.errorAttachmentUploadFailed"
  | "channel.dropFilesHere"
  | "channel.lightboxTitle"
  | "channel.lightboxClose"
  | "channel.lightboxPrevious"
  | "channel.lightboxNext"
  | "channel.lightboxDownload"
  | "channel.lightboxLoading"
  | "channel.lightboxImageFailed"
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
  | "workspace.invites"
  | "workspace.createInviteLink"
  | "workspace.inviteByEmail"
  | "workspace.maxUses"
  | "workspace.uses"
  | "workspace.expires"
  | "workspace.copyInviteLink"
  | "workspace.copied"
  | "workspace.revokeInvite"
  | "workspace.inviteRevoked"
  | "workspace.errorCreateInviteFailed"
  | "workspace.errorLoadInvitesFailed"
  | "workspace.errorRevokeInviteFailed"
  | "workspace.noPermissionToManageInvites"
  | "workspace.inviteRole"
  | "workspace.publicInviteLink"
  | "workspace.targetedInvite"
  | "workspace.inviteLinkCreated"
  | "workspace.active"
  | "workspace.past"
  | "workspace.noInvites"
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
  | "direct.subtitle"
  | "direct.newConversation"
  | "direct.startChat"
  | "direct.startChatDescription"
  | "direct.noConversationsDescription"
  | "direct.usernameOrEmail"
  | "direct.noConversations"
  | "direct.loadingConversations"
  | "direct.failedLoadConversations"
  | "direct.failedStartConversation"
  | "direct.typeMessage"
  | "direct.send"
  | "direct.sending"
  | "direct.loadingMessages"
  | "direct.loadOlderMessages"
  | "direct.loadingOlderMessages"
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
  | "direct.replyAttachmentIndicator"
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
  | "groups.title"
  | "groups.subtitle"
  | "groups.createGroup"
  | "groups.createGroupDescription"
  | "groups.groupName"
  | "groups.groupNamePlaceholder"
  | "groups.searchMembers"
  | "groups.noMembersFound"
  | "groups.selectedMembers"
  | "groups.members"
  | "groups.memberCount"
  | "groups.owner"
  | "groups.member"
  | "groups.leaveGroup"
  | "groups.archiveGroup"
  | "groups.renameGroup"
  | "groups.addMember"
  | "groups.removeMember"
  | "groups.settings"
  | "groups.closeSettings"
  | "groups.noGroups"
  | "groups.noGroupsDescription"
  | "groups.noMessages"
  | "groups.loadingGroups"
  | "groups.loadingMessages"
  | "groups.loadOlderMessages"
  | "groups.loadingOlderMessages"
  | "groups.failedLoadGroups"
  | "groups.failedLoadMessages"
  | "groups.failedSendMessage"
  | "groups.failedCreateGroup"
  | "groups.groupArchived"
  | "groups.youRemoved"
  | "groups.leaveOwnerError"
  | "groups.confirmArchive"
  | "groups.confirmLeave"
  | "groups.confirmRemoveMember"
  | "groups.backToGroups"
  | "groups.send"
  | "groups.sending"
  | "groups.typeMessage"
  | "groups.failedRenameGroup"
  | "groups.failedAddMember"
  | "groups.failedRemoveMember"
  | "groups.failedLeaveGroup"
  | "groups.failedArchiveGroup"
  | "groups.groupRenamed"
  | "groups.memberAdded"
  | "groups.memberRemoved"
  | "groups.leftGroup"
  | "sidebar.moveUp"
  | "sidebar.moveDown"
  | "sidebar.direct"
  | "sidebar.directMessages"
  | "sidebar.groups"
  | "sidebar.workspaces"
  | "sidebar.overview"
  | "sidebar.loading"
  | "sidebar.failedToLoadWorkspaces"
  | "sidebar.noWorkspacesYet"
  | "sidebar.failedToLoadChannels"
  | "sidebar.noChannelsYet"
  | "sidebar.unknownUser"
  | "sidebar.publicShort"
  | "sidebar.privateShort"
  | "sidebar.workspace"
  | "sidebar.signInToSeeWorkspaces"
  | "sidebar.unread"
  | "profile.sessions"
  | "profile.revokeOtherSessions"
  | "profile.revokeOthersConfirm"
  | "profile.revokeOthersSuccess"
  | "profile.revokeOthersFailed"
  | "profile.revokeSession"
  | "profile.revokingSession"
  | "profile.revokeSessionSuccess"
  | "profile.revokeSessionFailed"
  | "profile.revokeSessionConfirm"
  | "profile.currentSession"
  | "profile.revokeCurrentSessionDisabled"
  | "profile.sessionNotFoundRefreshed"
  | "profile.loadingSessions"
  | "profile.loadingSessionsFailed"
  | "profile.sessionActive"
  | "profile.sessionRevoked"
  | "profile.sessionExpired"
  | "profile.noSessions"
  | "profile.noInactiveSessions"
  | "profile.showInactiveSessions"
  | "profile.sessionDevice"
  | "profile.ipLabel"
  | "profile.createdAt"
  | "profile.expiresAt"
  | "api.timeoutError"
  | "api.coldStartHint"
  | "channel.searchMessages"
  | "channel.searchInThisChannel"
  | "channel.noMessagesFound"
  | "channel.searchFailed"
  | "channel.loadMoreResults"
  | "channel.searching"
  | "channel.typeSearchQuery"
  | "channel.jumpToMessage"
  | "channel.searchAttachmentMessage"
  | "channel.searchMessageNotLoaded"
  | "channel.loadingContext"
  | "channel.backToLatestMessages"
  | "channel.contextLoadFailed"
  | "workspace.searchMessages"
  | "workspace.searchInWorkspace"
  | "workspace.searchFailed"
  | "workspace.searchQueryTooShort"
  | "workspace.noMessagesFound"
  | "workspace.searching"
  | "channel.attachmentTypeImage"
  | "channel.attachmentTypePdf"
  | "channel.attachmentTypeWord"
  | "channel.attachmentTypeExcel"
  | "channel.attachmentTypePowerPoint"
  | "channel.attachmentTypeArchive"
  | "channel.attachmentTypeVideo"
  | "channel.attachmentTypeAudio"
  | "channel.attachmentTypeFile"
  | "workspace.inviteStatusPending"
  | "workspace.inviteStatusRevoked"
  | "workspace.inviteStatusExpired"
  | "workspace.inviteStatusAccepted"
  | "invite.title"
  | "errors.generic"
  | "errors.validationFailed"
  | "errors.unauthorized"
  | "errors.forbidden"
  | "errors.notFound"
  | "errors.internalServerError"
  | "errors.networkError"
  | "errors.invalidCredentials"
  | "errors.emailNotVerified"
  | "errors.userNotFound"
  | "errors.emailAlreadyExists"
  | "errors.usernameAlreadyTaken"
  | "errors.workspaceNotFound"
  | "errors.channelNotFound"
  | "errors.conversationNotFound"
  | "errors.inviteExpiredOrInvalid"
  | "errors.currentPasswordIncorrect"
  | "errors.newPasswordMustDiffer"
  | "errors.tooManyRequests"
  | "errors.registrationUnavailable"
  | "home.description"
  | "home.title"
  | "home.projectStatus"
  | "home.backendStatus"
  | "home.verifyApi"
  | "home.checking"
  | "home.checkApiHealth"
  | "home.clickToCheck"
  | "home.contactingBackend"
  | "home.healthy"
  | "home.degraded"
  | "home.environment"
  | "home.database"
  | "home.uptime"
  | "home.timestamp"
  | "home.unreachable"
  | "home.makeSureBackend"
  | "home.unknownError"
  | "projectStatus.backToHome"
  | "projectStatus.title"
  | "projectStatus.subtitle"
  | "projectStatus.activeDevelopment"
  | "projectStatus.inProgressNote"
  | "projectStatus.bestViewedAs"
  | "projectStatus.portfolioDescription"
  | "projectStatus.currentProductionStatus"
  | "projectStatus.webDeployed"
  | "projectStatus.apiDeployed"
  | "projectStatus.emailsDelivered"
  | "projectStatus.databaseRunning"
  | "projectStatus.whatWorks"
  | "projectStatus.userRegistration"
  | "projectStatus.loginLogout"
  | "projectStatus.passwordReset"
  | "projectStatus.profileManagement"
  | "projectStatus.sessionManagement"
  | "projectStatus.workspacesChannels"
  | "projectStatus.realTimeMessaging"
  | "projectStatus.messageFeatures"
  | "projectStatus.directMessages"
  | "projectStatus.resendDelivery"
  | "projectStatus.productionSmoke"
  | "projectStatus.inProgressPlanned"
  | "projectStatus.fileAttachments"
  | "projectStatus.messageSearch"
  | "projectStatus.slugUrls"
  | "projectStatus.e2eTests"
  | "projectStatus.uiPolish"
  | "projectStatus.techStack"
  | "projectStatus.frontend"
  | "projectStatus.backend"
  | "projectStatus.email"
  | "projectStatus.storage"
  | "projectStatus.auth"
  | "projectStatus.deployment"
  | "projectStatus.frontendValue"
  | "projectStatus.backendValue"
  | "projectStatus.emailValue"
  | "projectStatus.storageValue"
  | "projectStatus.authValue"
  | "projectStatus.deploymentValue"
  | "projectStatus.productionLinks"
  | "projectStatus.appLinkLabel"
  | "projectStatus.apiHealthLabel"
  | "projectStatus.apiDocsLabel"
  | "projectStatus.sourceLabel"
  | "profile.appInstall"
  | "profile.appInstallDescription"
  | "profile.installAppButton"
  | "profile.addToHomeScreen"
  | "profile.appInstalled"
  | "profile.pwaUnsupported"
  | "profile.pwaManualInstructions"
  | "profile.installingApp"
  | "profile.installAppAccepted"
  | "profile.installAppDismissed"
  | "contacts.title"
  | "contacts.subtitle"
  | "contacts.searchPeople"
  | "contacts.searchPlaceholder"
  | "contacts.addContact"
  | "contacts.removeContact"
  | "contacts.startChat"
  | "contacts.noContacts"
  | "contacts.noContactsDescription"
  | "contacts.contactAdded"
  | "contacts.contactRemoved"
  | "contacts.alreadyInContacts"
  | "contacts.cannotAddYourself"
  | "contacts.searchQueryTooShort"
  | "contacts.searching"
  | "contacts.noUsersFound"
  | "contacts.failedLoadContacts"
  | "contacts.failedAddContact"
  | "contacts.failedRemoveContact"
  | "contacts.failedStartDm"
  | "contacts.email"
  | "contacts.username"
  | "sidebar.contacts"
  | "groupInvites.createInviteLink"
  | "groupInvites.inviteLink"
  | "groupInvites.copyInviteLink"
  | "groupInvites.copied"
  | "groupInvites.revokeInvite"
  | "groupInvites.inviteRevoked"
  | "groupInvites.failedCreateInvite"
  | "groupInvites.failedLoadInvites"
  | "groupInvites.failedRevokeInvite"
  | "groupInvites.inviteLinkDescription"
  | "groupInvites.inviteLinkCreated"
  | "groupInvites.noInvites"
  | "groupInvites.active"
  | "groupInvites.expired"
  | "groupInvites.revoked"
  | "groupInvites.uses"
  | "groupInvite.title"
  | "groupInvite.invitedToJoinGroup"
  | "groupInvite.acceptInvite"
  | "groupInvite.acceptingInvite"
  | "groupInvite.inviteAccepted"
  | "groupInvite.invalidOrExpired"
  | "groupInvite.signInToAccept"
  | "groupInvite.goToGroup"
  | "groupInvite.goToLogin"
  | "groupInvite.acceptFailed"
  | "groupInvite.loadingInvite"
  | "safety.title"
  | "safety.blockedUsers"
  | "safety.blockedUsersDescription"
  | "safety.noBlockedUsers"
  | "safety.block"
  | "safety.blocking"
  | "safety.unblock"
  | "safety.unblocking"
  | "safety.blockUser"
  | "safety.report"
  | "safety.reportUser"
  | "safety.reportMessage"
  | "safety.reportReason"
  | "safety.reportDetails"
  | "safety.reportDetailsPlaceholder"
  | "safety.submitReport"
  | "safety.submittingReport"
  | "safety.reportSubmitted"
  | "safety.reportFailed"
  | "safety.blockFailed"
  | "safety.unblockFailed"
  | "safety.cannotBlockYourself"
  | "safety.reasonOptional"
  | "safety.reasonPlaceholder"
  | "safety.confirmUnblock"
  | "safety.confirmBlock"
  | "safety.actionBlocked"
  | "direct.block"
  | "direct.report"
  | "contacts.block"
  | "contacts.report"
  | "contacts.contactRequestSent"
  | "contacts.requestReceived"
  | "contacts.acceptRequest"
  | "contacts.declineRequest"
  | "contacts.cancelRequest"
  | "contacts.noRequests"
  | "contacts.requestsTitle"
  | "contacts.doesNotAcceptContacts"
  | "contacts.sendRequest"
  | "contacts.failedLoadRequests"
  | "contacts.failedAcceptRequest"
  | "contacts.failedDeclineRequest"
  | "contacts.failedCancelRequest"
  | "profile.contactPrivacy"
  | "profile.contactPrivacyDescription"
  | "profile.contactPrivacyEveryone"
  | "profile.contactPrivacyRequestsOnly"
  | "profile.contactPrivacyNobody"
  | "profile.contactPrivacySaved"
  | "profile.contactPrivacySaveFailed"
  | "groups.block"
  | "groups.reply"
  | "groups.replyingTo"
  | "groups.cancelReply"
  | "groups.originalMessageMissing"
  | "groups.replyAttachmentIndicator"
  | "groups.report";

const DICTIONARY: Record<Locale, Record<TranslationKey, string | ((name: string) => string)>> = {
  en: {
    "header.profile": "Profile",
    "header.logout": "Logout",
    "header.signIn": "Sign in",
    "header.createAccount": "Create account",
    "header.loading": "Loading…",
    "header.searchAllMessages": "Search all messages",
    "header.openMenu": "Open menu",
    "globalSearch.title": "Search all messages",
    "globalSearch.placeholder": "Search across workspaces, channels and DMs…",
    "globalSearch.search": "Search",
    "globalSearch.loading": "Searching…",
    "globalSearch.empty": "No messages found.",
    "globalSearch.error": "Search failed",
    "globalSearch.loadMore": "Load more",
    "globalSearch.publicChannelLabel": "Public channel",
    "globalSearch.privateChannelLabel": "Private channel",
    "globalSearch.directLabel": "DM",
    "globalSearch.directConversation": "Direct conversation",
    "globalSearch.groupLabel": "Group",
    "globalSearch.scopeAll": "All",
    "globalSearch.scopeChannel": "Channels",
    "globalSearch.scopeDirect": "Direct",
    "globalSearch.scopeGroup": "Groups",
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
    "profile.changePassword": "Change password",
    "profile.currentPassword": "Current password",
    "profile.newPassword": "New password",
    "profile.confirmNewPassword": "Confirm new password",
    "profile.passwordFieldsRequired": "All password fields are required",
    "profile.passwordsDoNotMatch": "New passwords do not match",
    "profile.passwordChangeFailed": "Failed to change password",
    "profile.passwordChanged": "Password changed successfully.",
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
    "auth.emailPlaceholder": "you@example.com",
    "auth.password": "Password",
    "auth.usernamePlaceholder": "john_doe",
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
    "auth.checkYourEmail": "Check your email to verify your account",
    "auth.verificationEmailSent": "A verification email has been sent to",
    "auth.verifyEmailTitle": "Verify email",
    "auth.verifyingEmail": "Verifying email…",
    "auth.emailVerified": "Email verified successfully",
    "auth.emailVerificationFailed": "Verification failed. The link may have expired.",
    "auth.emailVerificationMissingToken": "Invalid or missing verification link.",
    "auth.resendVerification": "Resend verification email",
    "auth.resendingVerification": "Sending…",
    "auth.resendVerificationSuccess": "If the email exists and is not verified, a verification email has been sent.",
    "auth.resendVerificationHint": "Didn’t receive the email? You can resend it.",
    "auth.resendCooldown": "Resend available in {arg0}s",
    "auth.resendLimitReached": "Too many resend attempts. Please wait a few minutes and try again.",
    "auth.spamFolderHint": "Check your spam or junk folder if you don’t see it.",
    "auth.verificationExpiredOrInvalid": "This verification link has expired or is invalid.",
    "auth.emailNotVerifiedHint": "We sent a verification link to {arg0}. Please check your inbox.",
    "auth.emailNotVerified": "Please verify your email before signing in.",
    "auth.signInAfterVerification": "You can now sign in with your verified email.",
    "auth.backToSignIn": "Back to sign in",
    "auth.loading": "Loading…",
    "auth.tryDemo": "Try live demo",
    "auth.demoLoading": "Starting demo…",
    "auth.demoUnavailable": "Demo is currently unavailable",
    "auth.passwordsDoNotMatch": "Passwords do not match",
    "auth.passwordMinLength": "Password must be at least 8 characters",
    "auth.confirmPassword": "Confirm password",
    "auth.forgotPassword": "Forgot password?",
    "auth.forgotPasswordTitle": "Reset password",
    "auth.forgotPasswordSubtitle": "Enter your email and we'll send you a reset link.",
    "auth.sendResetLink": "Send reset link",
    "auth.resetLinkSent": "If the email exists, a reset link has been sent.",
    "auth.resetPasswordTitle": "Set new password",
    "auth.newPassword": "New password",
    "auth.passwordResetSuccess": "Password reset successfully",
    "auth.passwordResetFailed": "Password reset failed",
    "auth.changeEmailTitle": "Change email",
    "auth.changeEmailSubtitle": "Enter your new email address.",
    "auth.currentEmail": "Current email",
    "auth.newEmail": "New email",
    "auth.emailChangeRequested": "Check your new email to confirm the change.",
    "auth.emailChangeLatestOnly": "Only the latest confirmation email will work.",
    "auth.confirmEmailChangeTitle": "Confirm email change",
    "auth.emailChanged": "Email changed successfully",
    "auth.emailChangeFailed": "Email change failed",
    "auth.backToProfile": "Back to profile",
    "auth.requestChange": "Request change",
    "workspace.backToDashboard": "← Back to dashboard",
    "workspace.loading": "Loading workspace…",
    "workspace.createChannel": "Create channel",
    "workspace.channelName": "Channel name",
    "workspace.channelDescription": "Description (optional)",
    "workspace.publicChannel": "Public",
    "workspace.privateChannel": "Private",
    "workspace.channelType": "Channel type",
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
    "workspace.changeRole": "Change role",
    "workspace.confirmChangeRole": "Change role of \"{arg0}\" to {arg1}?",
    "workspace.roleUpdated": "Role updated",
    "workspace.errorUpdateRoleFailed": "Failed to update role",
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
    "invite.loadingInvite": "Loading invite…",
    "invite.invitedToJoin": "You have been invited to join",
    "invite.inviteExpires": "Invite expires",
    "invite.acceptInvite": "Accept invite",
    "invite.acceptingInvite": "Accepting invite…",
    "invite.inviteAccepted": "Invite accepted",
    "invite.invalidOrExpired": "This invite link is invalid or expired.",
    "invite.signInToAccept": "Sign in to accept this invite.",
    "invite.goToWorkspace": "Go to workspace",
    "invite.goToLogin": "Go to login",
    "invite.acceptFailed": "Invite could not be accepted",
    "invite.goToDashboard": "Go to dashboard",
    "invite.expired": "Expired",
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
    "channel.loadOlderMessages": "Load older messages",
    "channel.loadingOlderMessages": "Loading older messages…",
    "channel.errorLoadMessagesFailed": "Failed to load older messages",
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
    "channel.membersPanelInfo": "Channel roles control who can manage this channel. They are separate from workspace roles.",
    "channel.manageWorkspaceRoles": "Manage workspace roles",
    "channel.inviteAcceptanceNote": "Invited users must accept before they appear here.",
    "channel.publicChannelNote": "Public channels are visible to all workspace members. Inviting adds a user with channel permissions.",
    "channel.privateChannelNote": "Private channels are invitation-only.",
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
    "channel.replyAttachmentIndicator": "Attachment",
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
    "channel.attachFile": "Attach file",
    "channel.removeAttachment": "Remove attachment",
    "channel.errorTooManyAttachments": "You can attach up to 10 files at once, or up to 20 images.",
    "channel.errorInvalidAttachmentType": "This file type is not supported. Allowed: images, PDF, Word, Excel, PowerPoint, archives, video and audio.",
    "channel.errorAttachmentTooLarge": "File exceeds 10 MB",
    "channel.errorAttachmentTooLargeByCategory": "File is too large. Maximum: video — 100 MB, documents/archives/audio — 50 MB, images — 25 MB.",
    "channel.errorAttachmentsTotalTooLarge": "Total attachment size must not exceed 150 MB.",
    "channel.errorSomeAttachmentsInvalid": "Some files were invalid and not added",
    "channel.errorDownloadFailed": "Failed to download file",
    "channel.attachmentUploading": "Uploading…",
    "channel.attachmentUploadFailed": "Upload failed",
    "channel.retryUpload": "Retry",
    "channel.attachmentReady": "Ready",
    "channel.attachmentUploaded": "Uploaded",
    "channel.attachmentLoading": "Loading…",
    "channel.errorAttachmentUploadFailed": "Attachment upload failed. Please try again.",
    "channel.dropFilesHere": "Drop file here to upload",
    "channel.lightboxTitle": "Image preview",
    "channel.lightboxClose": "Close preview",
    "channel.lightboxPrevious": "Previous image",
    "channel.lightboxNext": "Next image",
    "channel.lightboxDownload": "Download",
    "channel.lightboxLoading": "Loading image…",
    "channel.lightboxImageFailed": "Failed to load image",
    "channel.socketDisconnected": "Disconnected",
    "channel.socketConnecting": "Connecting",
    "channel.socketConnected": "Connected",
    "channel.socketJoined": "Joined",
    "channel.socketError": "Error",
    "messageAuthor.unknownUser": "Unknown user",
    "direct.title": "Direct messages",
    "direct.subtitle": "Chat directly with other users.",
    "direct.newConversation": "New conversation",
    "direct.startChat": "Start chat",
    "direct.startChatDescription": "Enter the username or email of the person you want to message.",
    "direct.noConversationsDescription": "Start a new conversation to begin messaging.",
    "direct.usernameOrEmail": "Username or email",
    "direct.noConversations": "No conversations yet.",
    "direct.loadingConversations": "Loading conversations…",
    "direct.failedLoadConversations": "Failed to load conversations",
    "direct.failedStartConversation": "Failed to start conversation",
    "direct.typeMessage": "Type a message…",
    "direct.send": "Send",
    "direct.sending": "Sending…",
    "direct.loadingMessages": "Loading messages…",
    "direct.loadOlderMessages": "Load older messages",
    "direct.loadingOlderMessages": "Loading older messages…",
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
    "direct.replyAttachmentIndicator": "Attachment",
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
    "groups.title": "Groups",
    "groups.subtitle": "Chat with multiple people in simple groups.",
    "groups.createGroup": "Create group",
    "groups.createGroupDescription": "Create a new group and add members to start chatting.",
    "groups.groupName": "Group name",
    "groups.groupNamePlaceholder": "Enter group name",
    "groups.searchMembers": "Search members…",
    "groups.noMembersFound": "No members found.",
    "groups.selectedMembers": "Selected members",
    "groups.members": "Members",
    "groups.memberCount": "{arg0} members",
    "groups.owner": "Owner",
    "groups.member": "Member",
    "groups.leaveGroup": "Leave group",
    "groups.archiveGroup": "Archive group",
    "groups.renameGroup": "Rename group",
    "groups.addMember": "Add member",
    "groups.removeMember": "Remove",
    "groups.settings": "Settings",
    "groups.closeSettings": "Close settings",
    "groups.noGroups": "No groups yet.",
    "groups.noGroupsDescription": "Create a group to start chatting with multiple people.",
    "groups.noMessages": "No messages yet.",
    "groups.loadingGroups": "Loading groups…",
    "groups.loadingMessages": "Loading messages…",
    "groups.loadOlderMessages": "Load older messages",
    "groups.loadingOlderMessages": "Loading older messages…",
    "groups.failedLoadGroups": "Failed to load groups",
    "groups.failedLoadMessages": "Failed to load messages",
    "groups.failedSendMessage": "Failed to send message",
    "groups.failedCreateGroup": "Failed to create group",
    "groups.groupArchived": "Group archived.",
    "groups.youRemoved": "You were removed from the group.",
    "groups.leaveOwnerError": "The owner cannot leave the group. Archive it instead.",
    "groups.confirmArchive": "Archive this group? It will be hidden for all members.",
    "groups.confirmLeave": "Leave this group?",
    "groups.confirmRemoveMember": "Remove this member from the group?",
    "groups.backToGroups": "← Back to groups",
    "groups.send": "Send",
    "groups.sending": "Sending…",
    "groups.typeMessage": "Type a message…",
    "groups.reply": "Reply",
    "groups.replyingTo": "Replying to",
    "groups.cancelReply": "Cancel reply",
    "groups.originalMessageMissing": "Original message unavailable",
    "groups.replyAttachmentIndicator": "Attachment",
    "groups.failedRenameGroup": "Failed to rename group",
    "groups.failedAddMember": "Failed to add member",
    "groups.failedRemoveMember": "Failed to remove member",
    "groups.failedLeaveGroup": "Failed to leave group",
    "groups.failedArchiveGroup": "Failed to archive group",
    "groups.groupRenamed": "Group renamed.",
    "groups.memberAdded": "Member added.",
    "groups.memberRemoved": "Member removed.",
    "groups.leftGroup": "You left the group.",
    "sidebar.moveUp": "Move up",
    "sidebar.moveDown": "Move down",
    "sidebar.direct": "Direct",
    "sidebar.directMessages": "Direct messages",
    "sidebar.groups": "Groups",
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
    "sidebar.workspace": "Workspace",
    "sidebar.signInToSeeWorkspaces": "Sign in to see your workspaces",
    "sidebar.unread": "Unread",
    "workspace.confirmArchiveChannelPrefix": "Archive channel",
    "workspace.confirmArchiveChannelBody": "This will hide the channel from the workspace. Only the channel owner can do this.",
    "workspace.confirmRestoreChannelPrefix": "Restore channel",
    "workspace.delete": "Delete",
    "workspace.deleting": "Deleting…",
    "workspace.confirmDeleteChannelPrefix": "Delete channel",
    "workspace.confirmDeleteChannelBody": "This will permanently delete the channel and its messages. Only the workspace owner can do this.",
    "workspace.errorDeleteChannelFailed": "Failed to delete channel",
    "workspace.dangerZone": "Danger zone",
    "workspace.deleteWorkspace": "Delete workspace",
    "workspace.deleteWorkspaceDescription": "Once deleted, this workspace, its channels, messages and invites will be inaccessible to everyone. Only the workspace owner can do this. This action cannot be undone.",
    "workspace.deleteWorkspaceConfirmPrefix": "Delete workspace",
    "workspace.deleteWorkspaceConfirmBody": "This action is permanent. Type the workspace name below to confirm.",
    "workspace.deleteWorkspaceInputPlaceholder": "Type workspace name to confirm",
    "workspace.deletingWorkspace": "Deleting workspace…",
    "workspace.errorDeleteWorkspaceFailed": "Failed to delete workspace",
    "workspace.confirmDeleteWorkspace": (name: string) => `Are you sure you want to permanently delete workspace "${name}"?`,
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
    "workspace.invites": "Invites",
    "workspace.createInviteLink": "Create invite link",
    "workspace.inviteByEmail": "Invite by email or username",
    "workspace.maxUses": "Max uses",
    "workspace.uses": "uses",
    "workspace.expires": "Expires",
    "workspace.copyInviteLink": "Copy invite link",
    "workspace.copied": "Copied!",
    "workspace.revokeInvite": "Revoke",
    "workspace.inviteRevoked": "Invite revoked",
    "workspace.errorCreateInviteFailed": "Failed to create invite",
    "workspace.errorLoadInvitesFailed": "Failed to load invites",
    "workspace.errorRevokeInviteFailed": "Failed to revoke invite",
    "workspace.noPermissionToManageInvites": "You don’t have permission to manage invites.",
    "workspace.inviteRole": "Role",
    "workspace.publicInviteLink": "Public invite link",
    "workspace.targetedInvite": "Targeted invite",
    "workspace.inviteLinkCreated": "Invite link created. Copy and share it.",
    "workspace.active": "Active",
    "workspace.past": "Past",
    "workspace.noInvites": "No invites yet.",
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
    "profile.sessions": "Sessions",
    "profile.revokeOtherSessions": "Revoke all other sessions",
    "profile.revokeOthersConfirm": "Are you sure? This will end all other active sessions. Your current session will stay signed in.",
    "profile.revokeOthersSuccess": "Other sessions revoked.",
    "profile.revokeOthersFailed": "Failed to revoke other sessions",
    "profile.revokeSession": "Revoke",
    "profile.revokingSession": "Revoking…",
    "profile.revokeSessionSuccess": "Session revoked",
    "profile.revokeSessionFailed": "Failed to revoke session",
    "profile.revokeSessionConfirm": "Revoke this session? It will be signed out on the next request.",
    "profile.currentSession": "Current session",
    "profile.revokeCurrentSessionDisabled": "You cannot revoke your current session here. Use Sign out instead.",
    "profile.sessionNotFoundRefreshed": "Session was already revoked or expired. The list has been refreshed.",
    "profile.loadingSessions": "Loading sessions…",
    "profile.loadingSessionsFailed": "Failed to load sessions",
    "profile.sessionActive": "Active",
    "profile.sessionRevoked": "Revoked",
    "profile.sessionExpired": "Expired",
    "profile.noSessions": "No sessions found",
    "profile.noInactiveSessions": "No revoked or expired sessions",
    "profile.showInactiveSessions": "Show revoked and expired sessions",
    "profile.sessionDevice": "Device",
    "profile.ipLabel": "IP:",
    "profile.createdAt": "Created",
    "profile.expiresAt": "Expires",
    "profile.account": "Account",
    "profile.security": "Security",
    "profile.languageSection": "Language",
    "profile.showSessions": "Show sessions",
    "profile.hideSessions": "Hide sessions",
    "profile.activeSessionsCount": "Active sessions: {arg0}",
    "profile.sessionsExplanation": "Sessions are devices or browsers where your account is currently signed in. You can stay signed in on multiple devices at the same time.",
    "profile.showPassword": "Show password",
    "profile.hidePassword": "Hide password",
    "profile.accountSettings": "Account settings",
    "profile.profileSettings": "Profile settings",
    "profile.notifications": "Notifications",
    "profile.pushNotifications": "Push notifications",
    "profile.pushNotificationsDescription": "Get notified about new direct messages and channel messages even when the app is closed.",
    "profile.pushNotificationsUnsupported": "Push notifications are not supported in this browser.",
    "profile.pushNotificationsBlocked": "Notifications are blocked for this site. Enable them in your browser settings to use push notifications.",
    "profile.pushNotificationsDisabled": "Push notifications are currently disabled.",
    "profile.pushNotificationsEnabled": "Push notifications are enabled on this device.",
    "profile.enableNotifications": "Enable notifications",
    "profile.disableNotifications": "Disable notifications",
    "profile.enablingNotifications": "Enabling…",
    "profile.disablingNotifications": "Disabling…",
    "profile.notificationsEnabled": "Push notifications enabled.",
    "profile.notificationsDisabled": "Push notifications disabled.",
    "profile.notificationPreferences": "Notification preferences",
    "profile.notificationPreferencesDescription": "Choose which events send you push notifications.",
    "profile.pushNotificationsToggle": "Push notifications",
    "profile.pushNotificationsToggleDescription": "Allow any push notifications on this device.",
    "profile.mentionNotificationsToggle": "Mentions",
    "profile.mentionNotificationsToggleDescription": "Notify when someone mentions you with @username.",
    "profile.directMessageNotificationsToggle": "Direct messages",
    "profile.directMessageNotificationsToggleDescription": "Notify about new direct messages.",
    "profile.groupMessageNotificationsToggle": "Group messages",
    "profile.groupMessageNotificationsToggleDescription": "Notify about new messages in groups.",
    "profile.channelMessageNotificationsToggle": "Channel messages",
    "profile.channelMessageNotificationsToggleDescription": "Notify about new messages in channels.",
    "profile.loadingNotificationPreferences": "Loading preferences…",
    "api.timeoutError": "The server is taking too long to respond. It may be waking up. Please try again in a moment.",
    "api.coldStartHint": "Free Render instances may take up to a minute to wake up.",
    "channel.searchMessages": "Search messages",
    "channel.searchInThisChannel": "Search in this channel",
    "channel.noMessagesFound": "No messages found.",
    "channel.searchFailed": "Search failed",
    "channel.loadMoreResults": "Load more results",
    "channel.searching": "Searching…",
    "channel.typeSearchQuery": "Type a search query",
    "channel.jumpToMessage": "Jump to message",
    "channel.searchAttachmentMessage": "Attachment message",
    "channel.searchMessageNotLoaded": "Message is not currently loaded in the timeline.",
    "channel.loadingContext": "Loading message context…",
    "channel.backToLatestMessages": "Back to latest messages",
    "channel.contextLoadFailed": "Failed to load message context.",
    "workspace.searchMessages": "Search messages",
    "workspace.searchInWorkspace": "Search in workspace…",
    "workspace.searchFailed": "Search failed",
    "workspace.searchQueryTooShort": "Search query must be at least 2 characters.",
    "workspace.noMessagesFound": "No messages found.",
    "workspace.searching": "Searching…",
    "channel.attachmentTypeImage": "Image",
    "channel.attachmentTypePdf": "PDF",
    "channel.attachmentTypeWord": "Word",
    "channel.attachmentTypeExcel": "Excel",
    "channel.attachmentTypePowerPoint": "PowerPoint",
    "channel.attachmentTypeArchive": "Archive",
    "channel.attachmentTypeVideo": "Video",
    "channel.attachmentTypeAudio": "Audio",
    "channel.attachmentTypeFile": "File",
    "workspace.inviteStatusPending": "Pending",
    "workspace.inviteStatusRevoked": "Revoked",
    "workspace.inviteStatusExpired": "Expired",
    "workspace.inviteStatusAccepted": "Accepted",
    "invite.title": "Invite",
    "errors.generic": "Something went wrong. Please try again.",
    "errors.validationFailed": "Please check the entered data and try again.",
    "errors.unauthorized": "You need to sign in to continue.",
    "errors.forbidden": "You don’t have permission to do this.",
    "errors.notFound": "The requested item was not found.",
    "errors.internalServerError": "Server error. Please try again later.",
    "errors.networkError": "Network error. Please check your connection.",
    "errors.invalidCredentials": "Invalid email or password.",
    "errors.emailNotVerified": "Please verify your email before signing in.",
    "errors.userNotFound": "User not found.",
    "errors.emailAlreadyExists": "This email is already registered.",
    "errors.usernameAlreadyTaken": "This username is already taken.",
    "errors.workspaceNotFound": "Workspace not found.",
    "errors.channelNotFound": "Channel not found.",
    "errors.conversationNotFound": "Conversation not found.",
    "errors.inviteExpiredOrInvalid": "Invite link is invalid or expired.",
    "errors.currentPasswordIncorrect": "Current password is incorrect.",
    "errors.newPasswordMustDiffer": "New password must differ from current.",
    "errors.tooManyRequests": "Too many requests. Please wait a moment.",
    "errors.registrationUnavailable": "Registration is temporarily unavailable. Please try again later.",
    "home.description": "Secure team collaboration platform. Backend infrastructure is bootstrapped and ready.",
    "home.title": "lets-chat — Modern Rebuild",
    "home.projectStatus": "Project status",
    "home.backendStatus": "Backend Status",
    "home.verifyApi": "Verify the API is reachable",
    "home.checking": "Checking…",
    "home.checkApiHealth": "Check API Health",
    "home.clickToCheck": "Click the button to run a health check against /health.",
    "home.contactingBackend": "Contacting backend…",
    "home.healthy": "Healthy",
    "home.degraded": "Degraded",
    "home.environment": "Environment",
    "home.database": "Database",
    "home.uptime": "Uptime",
    "home.timestamp": "Timestamp",
    "home.unreachable": "Unreachable",
    "home.makeSureBackend": "Make sure the backend is running on {arg0}.",
    "home.unknownError": "Unknown error occurred",
    "projectStatus.backToHome": "Back to home",
    "projectStatus.title": "Project Status",
    "projectStatus.subtitle": "lets-chat — a modern, secure team collaboration platform.",
    "projectStatus.activeDevelopment": "Active development",
    "projectStatus.inProgressNote": "This project is actively in development. Not all planned features are implemented yet.",
    "projectStatus.bestViewedAs": "Best viewed as",
    "projectStatus.portfolioDescription": "Portfolio piece / active development project demonstrating full-stack engineering, real-time systems, auth security, and production deployment practices.",
    "projectStatus.currentProductionStatus": "Current production status",
    "projectStatus.webDeployed": "Web deployed on Vercel",
    "projectStatus.apiDeployed": "API deployed on Render",
    "projectStatus.emailsDelivered": "Emails delivered via Resend",
    "projectStatus.databaseRunning": "Database running on PostgreSQL",
    "projectStatus.whatWorks": "What already works",
    "projectStatus.userRegistration": "User registration with email verification",
    "projectStatus.loginLogout": "Login, logout, and access/refresh token rotation",
    "projectStatus.passwordReset": "Password reset and authenticated password change",
    "projectStatus.profileManagement": "Profile management: display name, avatar, interface language, email change",
    "projectStatus.sessionManagement": "Session management: list active sessions and revoke all sessions",
    "projectStatus.workspacesChannels": "Workspaces and channels with auto-generated slugs",
    "projectStatus.realTimeMessaging": "Real-time messaging via Socket.io",
    "projectStatus.messageFeatures": "Message editing, deletion, replies, forwarding, and reactions",
    "projectStatus.directMessages": "Direct messages between users",
    "projectStatus.resendDelivery": "Resend email delivery for auth flows",
    "projectStatus.productionSmoke": "Post-deploy production smoke checks",
    "projectStatus.inProgressPlanned": "In progress / planned",
    "projectStatus.fileAttachments": "File attachments in messages",
    "projectStatus.messageSearch": "Message search",
    "projectStatus.slugUrls": "Slug-based public URLs",
    "projectStatus.e2eTests": "Expanded E2E test coverage",
    "projectStatus.uiPolish": "UI polish and accessibility improvements",
    "projectStatus.techStack": "Tech stack",
    "projectStatus.frontend": "Frontend",
    "projectStatus.backend": "Backend",
    "projectStatus.email": "Email",
    "projectStatus.storage": "Storage",
    "projectStatus.auth": "Auth",
    "projectStatus.deployment": "Deployment",
    "projectStatus.frontendValue": "Next.js 16, React 19, Tailwind CSS, TypeScript",
    "projectStatus.backendValue": "NestJS, Prisma, PostgreSQL, Socket.io",
    "projectStatus.emailValue": "Resend",
    "projectStatus.storageValue": "S3-compatible (MinIO)",
    "projectStatus.authValue": "JWT access + refresh tokens, sessionStorage",
    "projectStatus.deploymentValue": "Vercel (web), Render (API)",
    "projectStatus.productionLinks": "Production links",
    "projectStatus.appLinkLabel": "App:",
    "projectStatus.apiHealthLabel": "API health:",
    "projectStatus.apiDocsLabel": "API docs (Swagger):",
    "projectStatus.sourceLabel": "Source:",
    "profile.appInstall": "App install",
    "profile.appInstallDescription": "Add Lets Chat to your home screen for quick access.",
    "profile.installAppButton": "Install app",
    "profile.addToHomeScreen": "Add to home screen",
    "profile.appInstalled": "App is installed on this device.",
    "profile.pwaUnsupported": "This browser does not support PWA installation.",
    "profile.pwaManualInstructions": "Open the browser menu and choose \"Add to home screen\".",
    "profile.installingApp": "Installing…",
    "profile.installAppAccepted": "Installation started.",
    "profile.installAppDismissed": "Installation dismissed.",
    "contacts.title": "Contacts",
    "contacts.subtitle": "Find people and start chatting.",
    "contacts.searchPeople": "Search people",
    "contacts.searchPlaceholder": "Search by username or email…",
    "contacts.addContact": "Add contact",
    "contacts.removeContact": "Remove contact",
    "contacts.startChat": "Start chat",
    "contacts.noContacts": "No contacts yet.",
    "contacts.noContactsDescription": "Search for people and add them to your contacts.",
    "contacts.contactAdded": "Contact added.",
    "contacts.contactRemoved": "Contact removed.",
    "contacts.alreadyInContacts": "This user is already in your contacts.",
    "contacts.cannotAddYourself": "You cannot add yourself as a contact.",
    "contacts.searchQueryTooShort": "Search query must be at least 2 characters.",
    "contacts.searching": "Searching…",
    "contacts.noUsersFound": "No users found.",
    "contacts.failedLoadContacts": "Failed to load contacts",
    "contacts.failedAddContact": "Failed to add contact",
    "contacts.failedRemoveContact": "Failed to remove contact",
    "contacts.failedStartDm": "Failed to start chat",
    "contacts.email": "Email",
    "contacts.username": "Username",
    "sidebar.contacts": "Contacts",
    "groupInvites.createInviteLink": "Create invite link",
    "groupInvites.inviteLink": "Invite link",
    "groupInvites.copyInviteLink": "Copy link",
    "groupInvites.copied": "Copied!",
    "groupInvites.revokeInvite": "Revoke",
    "groupInvites.inviteRevoked": "Invite revoked.",
    "groupInvites.failedCreateInvite": "Failed to create invite link",
    "groupInvites.failedLoadInvites": "Failed to load invite links",
    "groupInvites.failedRevokeInvite": "Failed to revoke invite link",
    "groupInvites.inviteLinkDescription": "Anyone with this link can join the group as a member.",
    "groupInvites.inviteLinkCreated": "Invite link created. Copy and share it.",
    "groupInvites.noInvites": "No invite links yet.",
    "groupInvites.active": "Active",
    "groupInvites.expired": "Expired",
    "groupInvites.revoked": "Revoked",
    "groupInvites.uses": "uses",
    "groupInvite.title": "Group invite",
    "groupInvite.invitedToJoinGroup": "You have been invited to join a group",
    "groupInvite.acceptInvite": "Accept invite",
    "groupInvite.acceptingInvite": "Accepting invite…",
    "groupInvite.inviteAccepted": "Invite accepted",
    "groupInvite.invalidOrExpired": "This invite link is invalid or expired.",
    "groupInvite.signInToAccept": "Sign in to accept this invite.",
    "groupInvite.goToGroup": "Go to group",
    "groupInvite.goToLogin": "Go to login",
    "groupInvite.acceptFailed": "Could not accept invite",
    "groupInvite.loadingInvite": "Loading invite…",
    "safety.title": "Safety",
    "safety.blockedUsers": "Blocked users",
    "safety.blockedUsersDescription": "Users you have blocked cannot start new direct conversations or add you as a contact.",
    "safety.noBlockedUsers": "You haven't blocked anyone.",
    "safety.block": "Block",
    "safety.blocking": "Blocking…",
    "safety.unblock": "Unblock",
    "safety.unblocking": "Unblocking…",
    "safety.blockUser": "Block user",
    "safety.report": "Report",
    "safety.reportUser": "Report user",
    "safety.reportMessage": "Report message",
    "safety.reportReason": "Reason",
    "safety.reportDetails": "Details",
    "safety.reportDetailsPlaceholder": "Describe what happened…",
    "safety.submitReport": "Submit report",
    "safety.submittingReport": "Submitting…",
    "safety.reportSubmitted": "Report submitted. Thank you.",
    "safety.reportFailed": "Failed to submit report",
    "safety.blockFailed": "Failed to block user",
    "safety.unblockFailed": "Failed to unblock user",
    "safety.cannotBlockYourself": "You cannot block yourself.",
    "safety.reasonOptional": "Reason (optional)",
    "safety.reasonPlaceholder": "Why are you blocking this user?",
    "safety.confirmUnblock": "Unblock {arg0}? They will be able to message you again.",
    "safety.confirmBlock": "Block {arg0}? They will no longer be able to message you or add you as a contact.",
    "safety.actionBlocked": "This action is not allowed because of a safety or privacy restriction.",
    "direct.block": "Block user",
    "direct.report": "Report user",
    "contacts.block": "Block",
    "contacts.report": "Report",
    "contacts.contactRequestSent": "Contact request sent.",
    "contacts.requestReceived": "wants to add you as a contact",
    "contacts.acceptRequest": "Accept",
    "contacts.declineRequest": "Decline",
    "contacts.cancelRequest": "Cancel request",
    "contacts.noRequests": "No pending contact requests.",
    "contacts.requestsTitle": "Incoming contact requests",
    "contacts.doesNotAcceptContacts": "Doesn’t accept contacts",
    "contacts.sendRequest": "Send request",
    "contacts.failedLoadRequests": "Failed to load contact requests",
    "contacts.failedAcceptRequest": "Failed to accept request",
    "contacts.failedDeclineRequest": "Failed to decline request",
    "contacts.failedCancelRequest": "Failed to cancel request",
    "profile.contactPrivacy": "Contact privacy",
    "profile.contactPrivacyDescription": "Choose who can add you as a contact without a request.",
    "profile.contactPrivacyEveryone": "Everyone",
    "profile.contactPrivacyRequestsOnly": "Requests only",
    "profile.contactPrivacyNobody": "Nobody",
    "profile.contactPrivacySaved": "Contact privacy setting saved.",
    "profile.contactPrivacySaveFailed": "Failed to save contact privacy setting.",
    "groups.block": "Block",
    "groups.report": "Report",
  },
  uk: {
    "header.profile": "Профіль",
    "header.logout": "Вийти",
    "header.signIn": "Увійти",
    "header.createAccount": "Створити акаунт",
    "header.loading": "Завантаження…",
    "header.searchAllMessages": "Пошук по всіх повідомленнях",
    "header.openMenu": "Відкрити меню",
    "globalSearch.title": "Пошук по всіх повідомленнях",
    "globalSearch.placeholder": "Шукати в робочих просторах, каналах та особистих листуваннях…",
    "globalSearch.search": "Пошук",
    "globalSearch.loading": "Шукаємо…",
    "globalSearch.empty": "Повідомлень не знайдено.",
    "globalSearch.error": "Пошук не вдався",
    "globalSearch.loadMore": "Завантажити ще",
    "globalSearch.publicChannelLabel": "Публічний канал",
    "globalSearch.privateChannelLabel": "Приватний канал",
    "globalSearch.directLabel": "Особисте",
    "globalSearch.directConversation": "Особисте листування",
    "globalSearch.groupLabel": "Група",
    "globalSearch.scopeAll": "Усі",
    "globalSearch.scopeChannel": "Канали",
    "globalSearch.scopeDirect": "Особисті",
    "globalSearch.scopeGroup": "Групи",
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
    "profile.changePassword": "Змінити пароль",
    "profile.currentPassword": "Поточний пароль",
    "profile.newPassword": "Новий пароль",
    "profile.confirmNewPassword": "Підтвердіть новий пароль",
    "profile.passwordFieldsRequired": "Усі поля пароля обовʼязкові",
    "profile.passwordsDoNotMatch": "Нові паролі не збігаються",
    "profile.passwordChangeFailed": "Не вдалося змінити пароль",
    "profile.passwordChanged": "Пароль успішно змінено.",
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
    "auth.emailPlaceholder": "korystuvach@pryklad.ua",
    "auth.password": "Пароль",
    "auth.usernamePlaceholder": "ivan_petrenko",
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
    "auth.checkYourEmail": "Перевірте пошту, щоб підтвердити акаунт",
    "auth.verificationEmailSent": "Лист із підтвердженням надіслано на",
    "auth.verifyEmailTitle": "Підтвердження email",
    "auth.verifyingEmail": "Підтверджуємо email…",
    "auth.emailVerified": "Email успішно підтверджено",
    "auth.emailVerificationFailed": "Підтвердження не вдалося. Посилання могло застаріти.",
    "auth.emailVerificationMissingToken": "Недійсне або відсутнє посилання для підтвердження.",
    "auth.resendVerification": "Надіслати лист повторно",
    "auth.resendingVerification": "Надсилаємо…",
    "auth.resendVerificationSuccess": "Якщо email існує та не підтверджений, лист надіслано.",
    "auth.resendVerificationHint": "Не отримали листа? Можете надіслати повторно.",
    "auth.resendCooldown": "Повторне надсилання через {arg0} с",
    "auth.resendLimitReached": "Забагато спроб повторного надсилання. Зачекайте кілька хвилин і спробуйте ще раз.",
    "auth.spamFolderHint": "Перевірте папку «Спам», якщо лист не видно.",
    "auth.verificationExpiredOrInvalid": "Це посилання для підтвердження застаріло або недійсне.",
    "auth.emailNotVerifiedHint": "Ми надіслали посилання для підтвердження на {arg0}. Перевірте пошту.",
    "auth.emailNotVerified": "Будь ласка, підтвердьте email перед входом.",
    "auth.signInAfterVerification": "Тепер ви можете увійти з підтвердженим email.",
    "auth.backToSignIn": "Назад до входу",
    "auth.loading": "Завантаження…",
    "auth.tryDemo": "Спробувати демо",
    "auth.demoLoading": "Запуск демо…",
    "auth.demoUnavailable": "Демо зараз недоступне",
    "auth.passwordsDoNotMatch": "Паролі не збігаються",
    "auth.passwordMinLength": "Пароль має містити щонайменше 8 символів",
    "auth.confirmPassword": "Підтвердіть пароль",
    "auth.forgotPassword": "Забули пароль?",
    "auth.forgotPasswordTitle": "Скидання пароля",
    "auth.forgotPasswordSubtitle": "Введіть email і ми надішлемо посилання для скидання.",
    "auth.sendResetLink": "Надіслати посилання",
    "auth.resetLinkSent": "Якщо email існує, посилання для скидання надіслано.",
    "auth.resetPasswordTitle": "Новий пароль",
    "auth.newPassword": "Новий пароль",
    "auth.passwordResetSuccess": "Пароль успішно скинуто",
    "auth.passwordResetFailed": "Не вдалося скинути пароль",
    "auth.changeEmailTitle": "Змінити email",
    "auth.changeEmailSubtitle": "Введіть нову адресу email.",
    "auth.currentEmail": "Поточний email",
    "auth.newEmail": "Новий email",
    "auth.emailChangeRequested": "Перевірте нову пошту для підтвердження.",
    "auth.emailChangeLatestOnly": "Працює лише останнє підтвердження.",
    "auth.confirmEmailChangeTitle": "Підтвердження зміни email",
    "auth.emailChanged": "Email успішно змінено",
    "auth.emailChangeFailed": "Не вдалося змінити email",
    "auth.backToProfile": "Назад до профілю",
    "auth.requestChange": "Запитати зміну",
    "workspace.backToDashboard": "← Назад до панелі",
    "workspace.loading": "Завантажуємо робочий простір…",
    "workspace.createChannel": "Створити канал",
    "workspace.channelName": "Назва каналу",
    "workspace.channelDescription": "Опис (необовʼязково)",
    "workspace.publicChannel": "Публічний",
    "workspace.privateChannel": "Приватний",
    "workspace.channelType": "Тип каналу",
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
    "workspace.changeRole": "Змінити роль",
    "workspace.confirmChangeRole": "Змінити роль \"{arg0}\" на {arg1}?",
    "workspace.roleUpdated": "Роль оновлено",
    "workspace.errorUpdateRoleFailed": "Не вдалося оновити роль",
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
    "invite.loadingInvite": "Завантаження запрошення…",
    "invite.invitedToJoin": "Вас запросили приєднатися до",
    "invite.inviteExpires": "Термін дії запрошення",
    "invite.acceptInvite": "Прийняти запрошення",
    "invite.acceptingInvite": "Прийняття запрошення…",
    "invite.inviteAccepted": "Запрошення прийнято",
    "invite.invalidOrExpired": "Це посилання недійсне або термін його дії минув.",
    "invite.signInToAccept": "Увійдіть, щоб прийняти запрошення.",
    "invite.goToWorkspace": "Перейти до робочого простору",
    "invite.goToLogin": "Увійти",
    "invite.acceptFailed": "Не вдалося прийняти запрошення",
    "invite.goToDashboard": "На головну",
    "invite.expired": "Термін дії минув",
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
    "channel.loadOlderMessages": "Завантажити старіші повідомлення",
    "channel.loadingOlderMessages": "Завантажуємо старіші повідомлення…",
    "channel.errorLoadMessagesFailed": "Не вдалося завантажити старіші повідомлення",
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
    "channel.membersPanelInfo": "Ролі каналу визначають, хто може керувати каналом. Вони не збігаються з ролями робочого простору.",
    "channel.manageWorkspaceRoles": "Керувати ролями робочого простору",
    "channel.inviteAcceptanceNote": "Запрошені користувачі повинні прийняти запрошення, перш ніж з’явитися тут.",
    "channel.publicChannelNote": "Публічні канали видимі всім учасникам робочого простору. Запрошення додає користувача з правами каналу.",
    "channel.privateChannelNote": "Приватні канали — лише за запрошенням.",
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
    "channel.replyAttachmentIndicator": "Вкладення",
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
    "channel.attachFile": "Прикріпити файл",
    "channel.removeAttachment": "Видалити вкладення",
    "channel.errorTooManyAttachments": "Можна прикріпити до 10 файлів за раз або до 20 зображень.",
    "channel.errorInvalidAttachmentType": "Цей тип файлу не підтримується. Дозволені: зображення, PDF, Word, Excel, PowerPoint, архіви, відео та аудіо.",
    "channel.errorAttachmentTooLarge": "Файл перевищує 10 МБ",
    "channel.errorAttachmentTooLargeByCategory": "Файл завеликий. Максимум: відео — 100 МБ, документи/архіви/аудіо — 50 МБ, зображення — 25 МБ.",
    "channel.errorAttachmentsTotalTooLarge": "Загальний розмір вкладень не повинен перевищувати 150 МБ.",
    "channel.errorSomeAttachmentsInvalid": "Деякі файли недійсні та не додані",
    "channel.errorDownloadFailed": "Не вдалося завантажити файл",
    "channel.attachmentUploading": "Завантажуємо…",
    "channel.attachmentUploadFailed": "Завантаження не вдалося",
    "channel.retryUpload": "Повторити",
    "channel.attachmentReady": "Готово",
    "channel.attachmentUploaded": "Завантажено",
    "channel.attachmentLoading": "Завантаження…",
    "channel.errorAttachmentUploadFailed": "Не вдалося завантажити вкладення. Спробуйте ще раз.",
    "channel.dropFilesHere": "Перетягніть файл сюди для завантаження",
    "channel.lightboxTitle": "Перегляд зображення",
    "channel.lightboxClose": "Закрити перегляд",
    "channel.lightboxPrevious": "Попереднє зображення",
    "channel.lightboxNext": "Наступне зображення",
    "channel.lightboxDownload": "Завантажити",
    "channel.lightboxLoading": "Завантажуємо зображення…",
    "channel.lightboxImageFailed": "Не вдалося завантажити зображення",
    "channel.socketDisconnected": "Відʼєднано",
    "channel.socketConnecting": "Підключення",
    "channel.socketConnected": "Підключено",
    "channel.socketJoined": "Приєднано",
    "channel.socketError": "Помилка",
    "messageAuthor.unknownUser": "Невідомий користувач",
    "direct.title": "Особисті повідомлення",
    "direct.subtitle": "Спілкуйтеся безпосередньо з іншими користувачами.",
    "direct.newConversation": "Нова розмова",
    "direct.startChat": "Почати чат",
    "direct.startChatDescription": "Введіть імʼя користувача або email людини, якій хочете написати.",
    "direct.noConversationsDescription": "Почніть нову розмову, щоб написати повідомлення.",
    "direct.usernameOrEmail": "Імʼя користувача або email",
    "direct.noConversations": "Розмов ще немає.",
    "direct.loadingConversations": "Завантажуємо розмови…",
    "direct.failedLoadConversations": "Не вдалося завантажити розмови",
    "direct.failedStartConversation": "Не вдалося почати розмову",
    "direct.typeMessage": "Напишіть повідомлення…",
    "direct.send": "Надіслати",
    "direct.sending": "Надсилаємо…",
    "direct.loadingMessages": "Завантажуємо повідомлення…",
    "direct.loadOlderMessages": "Завантажити старіші повідомлення",
    "direct.loadingOlderMessages": "Завантажуємо старіші повідомлення…",
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
    "direct.replyAttachmentIndicator": "Вкладення",
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
    "groups.title": "Групи",
    "groups.subtitle": "Спілкуйтеся з кількома людьми у простих групах.",
    "groups.createGroup": "Створити групу",
    "groups.createGroupDescription": "Створіть нову групу та додайте учасників, щоб почати спілкування.",
    "groups.groupName": "Назва групи",
    "groups.groupNamePlaceholder": "Введіть назву групи",
    "groups.searchMembers": "Пошук учасників…",
    "groups.noMembersFound": "Учасників не знайдено.",
    "groups.selectedMembers": "Обрані учасники",
    "groups.members": "Учасники",
    "groups.memberCount": "{arg0} учасників",
    "groups.owner": "Власник",
    "groups.member": "Участник",
    "groups.leaveGroup": "Покинути групу",
    "groups.archiveGroup": "Архівувати групу",
    "groups.renameGroup": "Перейменувати групу",
    "groups.addMember": "Додати учасника",
    "groups.removeMember": "Вилучити",
    "groups.settings": "Налаштування",
    "groups.closeSettings": "Закрити налаштування",
    "groups.noGroups": "Груп ще немає.",
    "groups.noGroupsDescription": "Створіть групу, щоб спілкуватися з кількома людьми.",
    "groups.noMessages": "Повідомлень ще немає.",
    "groups.loadingGroups": "Завантажуємо групи…",
    "groups.loadingMessages": "Завантажуємо повідомлення…",
    "groups.loadOlderMessages": "Завантажити старіші повідомлення",
    "groups.loadingOlderMessages": "Завантажуємо старіші повідомлення…",
    "groups.failedLoadGroups": "Не вдалося завантажити групи",
    "groups.failedLoadMessages": "Не вдалося завантажити повідомлення",
    "groups.failedSendMessage": "Не вдалося надіслати повідомлення",
    "groups.failedCreateGroup": "Не вдалося створити групу",
    "groups.groupArchived": "Групу архівовано.",
    "groups.youRemoved": "Вас вилучено з групи.",
    "groups.leaveOwnerError": "Власник не може покинути групу. Натомість архівуйте її.",
    "groups.confirmArchive": "Архівувати цю групу? Вона буде прихована для всіх учасників.",
    "groups.confirmLeave": "Покинути цю групу?",
    "groups.confirmRemoveMember": "Вилучити цього учасника з групи?",
    "groups.backToGroups": "← Назад до груп",
    "groups.send": "Надіслати",
    "groups.sending": "Надсилаємо…",
    "groups.typeMessage": "Напишіть повідомлення…",
    "groups.reply": "Відповісти",
    "groups.replyingTo": "Відповідь на",
    "groups.cancelReply": "Скасувати відповідь",
    "groups.originalMessageMissing": "Оригінальне повідомлення недоступне",
    "groups.replyAttachmentIndicator": "Вкладення",
    "groups.failedRenameGroup": "Не вдалося перейменувати групу",
    "groups.failedAddMember": "Не вдалося додати учасника",
    "groups.failedRemoveMember": "Не вдалося вилучити учасника",
    "groups.failedLeaveGroup": "Не вдалося покинути групу",
    "groups.failedArchiveGroup": "Не вдалося архівувати групу",
    "groups.groupRenamed": "Групу перейменовано.",
    "groups.memberAdded": "Учасника додано.",
    "groups.memberRemoved": "Учасника вилучено.",
    "groups.leftGroup": "Ви покинули групу.",
    "sidebar.moveUp": "Перемістити вгору",
    "sidebar.moveDown": "Перемістити вниз",
    "sidebar.direct": "Особисті",
    "sidebar.directMessages": "Особисті повідомлення",
    "sidebar.groups": "Групи",
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
    "sidebar.workspace": "Робочий простір",
    "sidebar.signInToSeeWorkspaces": "Увійдіть, щоб бачити свої робочі простори",
    "sidebar.unread": "Непрочитані",
    "workspace.confirmArchiveChannelPrefix": "Архівувати канал",
    "workspace.confirmArchiveChannelBody": "Це приховає канал з робочого простору. Це може зробити лише власник каналу.",
    "workspace.confirmRestoreChannelPrefix": "Відновити канал",
    "workspace.delete": "Видалити",
    "workspace.deleting": "Видаляємо…",
    "workspace.confirmDeleteChannelPrefix": "Видалити канал",
    "workspace.confirmDeleteChannelBody": "Це назавжди видалить канал і його повідомлення. Це може зробити лише власник робочого простору.",
    "workspace.errorDeleteChannelFailed": "Не вдалося видалити канал",
    "workspace.dangerZone": "Небезпечна зона",
    "workspace.deleteWorkspace": "Видалити робочий простір",
    "workspace.deleteWorkspaceDescription": "Після видалення цей робочий простір, його канали, повідомлення та запрошення стануть недоступними для всіх. Це може зробити лише власник. Цю дію не можна скасувати.",
    "workspace.deleteWorkspaceConfirmPrefix": "Видалити робочий простір",
    "workspace.deleteWorkspaceConfirmBody": "Цю дію неможливо скасувати. Введіть назву робочого простору нижче для підтвердження.",
    "workspace.deleteWorkspaceInputPlaceholder": "Введіть назву робочого простору для підтвердження",
    "workspace.deletingWorkspace": "Видаляємо робочий простір…",
    "workspace.errorDeleteWorkspaceFailed": "Не вдалося видалити робочий простір",
    "workspace.confirmDeleteWorkspace": (name: string) => `Ви впевнені, що хочете назавжди видалити робочий простір "${name}"?`,
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
    "workspace.invites": "Запрошення",
    "workspace.createInviteLink": "Створити посилання для запрошення",
    "workspace.inviteByEmail": "Запросити за email або іменем користувача",
    "workspace.maxUses": "Макс. використань",
    "workspace.uses": "використань",
    "workspace.expires": "Термін дії",
    "workspace.copyInviteLink": "Копіювати посилання",
    "workspace.copied": "Скопійовано!",
    "workspace.revokeInvite": "Скасувати",
    "workspace.inviteRevoked": "Запрошення скасовано",
    "workspace.errorCreateInviteFailed": "Не вдалося створити запрошення",
    "workspace.errorLoadInvitesFailed": "Не вдалося завантажити запрошення",
    "workspace.errorRevokeInviteFailed": "Не вдалося скасувати запрошення",
    "workspace.noPermissionToManageInvites": "У вас немає прав для керування запрошеннями.",
    "workspace.inviteRole": "Роль",
    "workspace.publicInviteLink": "Публічне посилання",
    "workspace.targetedInvite": "Цільове запрошення",
    "workspace.inviteLinkCreated": "Посилання створено. Скопіюйте та поділіться ним.",
    "workspace.active": "Активні",
    "workspace.past": "Минулі",
    "workspace.noInvites": "Поки що немає запрошень.",
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
    "profile.sessions": "Сесії",
    "profile.revokeOtherSessions": "Відкликати всі інші сесії",
    "profile.revokeOthersConfirm": "Ви впевнені? Це завершить усі інші активні сесії. Поточна сесія залишиться активною.",
    "profile.revokeOthersSuccess": "Інші сесії відкликані.",
    "profile.revokeOthersFailed": "Не вдалося відкликати інші сесії",
    "profile.revokeSession": "Відкликати",
    "profile.revokingSession": "Відкликаємо…",
    "profile.revokeSessionSuccess": "Сесію відкликано",
    "profile.revokeSessionFailed": "Не вдалося відкликати сесію",
    "profile.revokeSessionConfirm": "Відкликати цю сесію? Її буде завершено під час наступного запиту.",
    "profile.currentSession": "Поточна сесія",
    "profile.revokeCurrentSessionDisabled": "Ви не можете відкликати поточну сесію тут. Натомість скористайтеся Виходом.",
    "profile.sessionNotFoundRefreshed": "Сесію вже відкликано або термін її дії закінчився. Список оновлено.",
    "profile.loadingSessions": "Завантажуємо сесії…",
    "profile.loadingSessionsFailed": "Не вдалося завантажити сесії",
    "profile.sessionActive": "Активна",
    "profile.sessionRevoked": "Відкликана",
    "profile.sessionExpired": "Протермінована",
    "profile.noSessions": "Сесій не знайдено",
    "profile.noInactiveSessions": "Немає відкликаних або протермінованих сесій",
    "profile.showInactiveSessions": "Показати відкликані та протерміновані сесії",
    "profile.sessionDevice": "Пристрій",
    "profile.ipLabel": "IP:",
    "profile.createdAt": "Створено",
    "profile.expiresAt": "Завершується",
    "profile.account": "Обліковий запис",
    "profile.security": "Безпека",
    "profile.languageSection": "Мова",
    "profile.showSessions": "Показати сесії",
    "profile.hideSessions": "Приховати сесії",
    "profile.activeSessionsCount": "Активні сесії: {arg0}",
    "profile.sessionsExplanation": "Сесії — це пристрої або браузери, де зараз виконано вхід у ваш акаунт. Ви можете залишатися авторизованими на кількох пристроях одночасно.",
    "profile.showPassword": "Показати пароль",
    "profile.hidePassword": "Приховати пароль",
    "profile.accountSettings": "Налаштування облікового запису",
    "profile.profileSettings": "Налаштування профілю",
    "profile.notifications": "Сповіщення",
    "profile.pushNotifications": "Push-сповіщення",
    "profile.pushNotificationsDescription": "Отримуйте сповіщення про нові особисті повідомлення та повідомлення в каналах, навіть коли додаток закритий.",
    "profile.pushNotificationsUnsupported": "Push-сповіщення не підтримуються цим браузером.",
    "profile.pushNotificationsBlocked": "Сповіщення заблоковані для цього сайту. Увімкніть їх у налаштуваннях браузера, щоб отримувати push-сповіщення.",
    "profile.pushNotificationsDisabled": "Push-сповіщення наразі вимкнені.",
    "profile.pushNotificationsEnabled": "Push-сповіщення увімкнені на цьому пристрої.",
    "profile.enableNotifications": "Увімкнути сповіщення",
    "profile.disableNotifications": "Вимкнути сповіщення",
    "profile.enablingNotifications": "Вмикаємо…",
    "profile.disablingNotifications": "Вимикаємо…",
    "profile.notificationsEnabled": "Push-сповіщення увімкнено.",
    "profile.notificationsDisabled": "Push-сповіщення вимкнено.",
    "profile.notificationPreferences": "Налаштування сповіщень",
    "profile.notificationPreferencesDescription": "Оберіть події, про які надсилати push-сповіщення.",
    "profile.pushNotificationsToggle": "Push-сповіщення",
    "profile.pushNotificationsToggleDescription": "Дозволити будь-які push-сповіщення на цьому пристрої.",
    "profile.mentionNotificationsToggle": "Згадування",
    "profile.mentionNotificationsToggleDescription": "Сповіщати, коли хтось згадує вас через @username.",
    "profile.directMessageNotificationsToggle": "Особисті повідомлення",
    "profile.directMessageNotificationsToggleDescription": "Сповіщати про нові особисті повідомлення.",
    "profile.groupMessageNotificationsToggle": "Повідомлення в групах",
    "profile.groupMessageNotificationsToggleDescription": "Сповіщати про нові повідомлення в групах.",
    "profile.channelMessageNotificationsToggle": "Повідомлення в каналах",
    "profile.channelMessageNotificationsToggleDescription": "Сповіщати про нові повідомлення в каналах.",
    "profile.loadingNotificationPreferences": "Завантаження налаштувань…",
    "api.timeoutError": "Сервер відповідає занадто довго. Можливо, він прокидається. Спробуйте ще раз за мить.",
    "api.coldStartHint": "Безкоштовні інстанси Render можуть прокидатися до хвилини.",
    "channel.searchMessages": "Шукати повідомлення",
    "channel.searchInThisChannel": "Шукати в цьому каналі",
    "channel.noMessagesFound": "Повідомлень не знайдено.",
    "channel.searchFailed": "Пошук не вдався",
    "channel.loadMoreResults": "Завантажити ще",
    "channel.searching": "Шукаємо…",
    "channel.typeSearchQuery": "Введіть запит для пошуку",
    "channel.jumpToMessage": "Перейти до повідомлення",
    "channel.searchAttachmentMessage": "Повідомлення з вкладенням",
    "channel.searchMessageNotLoaded": "Повідомлення зараз не завантажене в стрічці.",
    "channel.loadingContext": "Завантаження контексту повідомлення…",
    "channel.backToLatestMessages": "Назад до останніх повідомлень",
    "channel.contextLoadFailed": "Не вдалося завантажити контекст повідомлення.",
    "workspace.searchMessages": "Пошук повідомлень",
    "workspace.searchInWorkspace": "Шукати в робочому просторі…",
    "workspace.searchFailed": "Помилка пошуку",
    "workspace.searchQueryTooShort": "Запит має містити щонайменше 2 символи.",
    "workspace.noMessagesFound": "Повідомлень не знайдено.",
    "workspace.searching": "Шукаємо…",
    "channel.attachmentTypeImage": "Зображення",
    "channel.attachmentTypePdf": "PDF",
    "channel.attachmentTypeWord": "Word",
    "channel.attachmentTypeExcel": "Excel",
    "channel.attachmentTypePowerPoint": "PowerPoint",
    "channel.attachmentTypeArchive": "Архів",
    "channel.attachmentTypeVideo": "Відео",
    "channel.attachmentTypeAudio": "Аудіо",
    "channel.attachmentTypeFile": "Файл",
    "workspace.inviteStatusPending": "Очікує",
    "workspace.inviteStatusRevoked": "Скасовано",
    "workspace.inviteStatusExpired": "Термін дії минув",
    "workspace.inviteStatusAccepted": "Прийнято",
    "invite.title": "Запрошення",
    "errors.generic": "Щось пішло не так. Спробуйте ще раз.",
    "errors.validationFailed": "Перевірте введені дані та спробуйте ще раз.",
    "errors.unauthorized": "Увійдіть, щоб продовжити.",
    "errors.forbidden": "У вас немає дозволу на цю дію.",
    "errors.notFound": "Запитаний елемент не знайдено.",
    "errors.internalServerError": "Помилка сервера. Спробуйте пізніше.",
    "errors.networkError": "Помилка мережі. Перевірте з’єднання.",
    "errors.invalidCredentials": "Неправильний email або пароль.",
    "errors.emailNotVerified": "Будь ласка, підтвердьте email перед входом.",
    "errors.userNotFound": "Користувача не знайдено.",
    "errors.emailAlreadyExists": "Цей email уже зареєстрований.",
    "errors.usernameAlreadyTaken": "Це імʼя користувача вже зайняте.",
    "errors.workspaceNotFound": "Робочий простір не знайдено.",
    "errors.channelNotFound": "Канал не знайдено.",
    "errors.conversationNotFound": "Розмову не знайдено.",
    "errors.inviteExpiredOrInvalid": "Посилання недійсне або термін його дії минув.",
    "errors.currentPasswordIncorrect": "Поточний пароль невірний.",
    "errors.newPasswordMustDiffer": "Новий пароль має відрізнятися від поточного.",
    "errors.tooManyRequests": "Забагато запитів. Зачекайте трохи.",
    "errors.registrationUnavailable": "Реєстрація тимчасово недоступна. Спробуйте пізніше.",
    "home.description": "Безпечна платформа для командної співпраці. Бекенд-інфраструктура готова до роботи.",
    "home.title": "lets-chat — Сучасна версія",
    "home.projectStatus": "Статус проєкту",
    "home.backendStatus": "Статус бекенду",
    "home.verifyApi": "Перевірте доступність API",
    "home.checking": "Перевіряємо…",
    "home.checkApiHealth": "Перевірити стан API",
    "home.clickToCheck": "Натисніть кнопку, щоб запустити перевірку /health.",
    "home.contactingBackend": "Зв’язуємося з бекендом…",
    "home.healthy": "Працює",
    "home.degraded": "Працює з обмеженнями",
    "home.environment": "Середовище",
    "home.database": "База даних",
    "home.uptime": "Час роботи",
    "home.timestamp": "Мітка часу",
    "home.unreachable": "Недоступний",
    "home.makeSureBackend": "Переконайтеся, що бекенд запущено на {arg0}.",
    "home.unknownError": "Сталася невідома помилка",
    "projectStatus.backToHome": "Назад додому",
    "projectStatus.title": "Статус проєкту",
    "projectStatus.subtitle": "lets-chat — сучасна безпечна платформа для командної співпраці.",
    "projectStatus.activeDevelopment": "Активна розробка",
    "projectStatus.inProgressNote": "Проєкт активно розробляється. Не всі заплановані функції вже реалізовані.",
    "projectStatus.bestViewedAs": "Найкраще підходить як",
    "projectStatus.portfolioDescription": "Портфоліо / проєкт у активній розробці, що демонструє повноцінну інженерію, real-time системи, безпеку автентифікації та практики продакшен-деплою.",
    "projectStatus.currentProductionStatus": "Поточний продакшен-статус",
    "projectStatus.webDeployed": "Веб задеплоєно на Vercel",
    "projectStatus.apiDeployed": "API задеплоєно на Render",
    "projectStatus.emailsDelivered": "Листи надсилаються через Resend",
    "projectStatus.databaseRunning": "База даних працює на PostgreSQL",
    "projectStatus.whatWorks": "Що вже працює",
    "projectStatus.userRegistration": "Реєстрація користувачів із підтвердженням email",
    "projectStatus.loginLogout": "Вхід, вихід і ротація access/refresh токенів",
    "projectStatus.passwordReset": "Скидання пароля та зміна пароля після автентифікації",
    "projectStatus.profileManagement": "Керування профілем: відображуване ім’я, аватар, мова інтерфейсу, зміна email",
    "projectStatus.sessionManagement": "Керування сесіями: перегляд активних сесій і відкликання всіх сесій",
    "projectStatus.workspacesChannels": "Робочі простори та канали з автоматично згенерованими slug",
    "projectStatus.realTimeMessaging": "Обмін повідомленнями в реальному часі через Socket.io",
    "projectStatus.messageFeatures": "Редагування, видалення, відповіді, пересилання повідомлень і реакції",
    "projectStatus.directMessages": "Особисті повідомлення між користувачами",
    "projectStatus.resendDelivery": "Доставка листів через Resend для авторизаційних сценаріїв",
    "projectStatus.productionSmoke": "Постдеплойні smoke-перевірки продакшену",
    "projectStatus.inProgressPlanned": "У процесі / заплановано",
    "projectStatus.fileAttachments": "Файлові вкладення в повідомленнях",
    "projectStatus.messageSearch": "Пошук повідомлень",
    "projectStatus.slugUrls": "Публічні URL на основі slug",
    "projectStatus.e2eTests": "Розширене E2E-тестування",
    "projectStatus.uiPolish": "Полірування UI та покращення доступності",
    "projectStatus.techStack": "Технологічний стек",
    "projectStatus.frontend": "Фронтенд",
    "projectStatus.backend": "Бекенд",
    "projectStatus.email": "Email",
    "projectStatus.storage": "Сховище",
    "projectStatus.auth": "Авторизація",
    "projectStatus.deployment": "Деплой",
    "projectStatus.frontendValue": "Next.js 16, React 19, Tailwind CSS, TypeScript",
    "projectStatus.backendValue": "NestJS, Prisma, PostgreSQL, Socket.io",
    "projectStatus.emailValue": "Resend",
    "projectStatus.storageValue": "S3-сумісне (MinIO)",
    "projectStatus.authValue": "JWT access + refresh токени, sessionStorage",
    "projectStatus.deploymentValue": "Vercel (web), Render (API)",
    "projectStatus.productionLinks": "Продакшен-посилання",
    "projectStatus.appLinkLabel": "Застосунок:",
    "projectStatus.apiHealthLabel": "Стан API:",
    "projectStatus.apiDocsLabel": "Документація API (Swagger):",
    "projectStatus.sourceLabel": "Джерело:",
    "profile.appInstall": "Встановлення додатка",
    "profile.appInstallDescription": "Додайте Lets Chat на головний екран для швидкого доступу.",
    "profile.installAppButton": "Встановити додаток",
    "profile.addToHomeScreen": "Додати на головний екран",
    "profile.appInstalled": "Додаток встановлено на цьому пристрої.",
    "profile.pwaUnsupported": "Цей браузер не підтримує встановлення PWA.",
    "profile.pwaManualInstructions": "Відкрийте меню браузера та оберіть «Додати на головний екран».",
    "profile.installingApp": "Встановлюємо…",
    "profile.installAppAccepted": "Встановлення розпочато.",
    "profile.installAppDismissed": "Встановлення скасовано.",
    "contacts.title": "Контакти",
    "contacts.subtitle": "Знаходьте людей і починайте спілкування.",
    "contacts.searchPeople": "Пошук людей",
    "contacts.searchPlaceholder": "Шукати за іменем користувача або email…",
    "contacts.addContact": "Додати контакт",
    "contacts.removeContact": "Вилучити контакт",
    "contacts.startChat": "Почати чат",
    "contacts.noContacts": "Контактів ще немає.",
    "contacts.noContactsDescription": "Знайдіть людей і додайте їх до контактів.",
    "contacts.contactAdded": "Контакт додано.",
    "contacts.contactRemoved": "Контакт вилучено.",
    "contacts.alreadyInContacts": "Цей користувач уже є у ваших контактах.",
    "contacts.cannotAddYourself": "Ви не можете додати себе до контактів.",
    "contacts.searchQueryTooShort": "Запит має містити щонайменше 2 символи.",
    "contacts.searching": "Шукаємо…",
    "contacts.noUsersFound": "Користувачів не знайдено.",
    "contacts.failedLoadContacts": "Не вдалося завантажити контакти",
    "contacts.failedAddContact": "Не вдалося додати контакт",
    "contacts.failedRemoveContact": "Не вдалося вилучити контакт",
    "contacts.failedStartDm": "Не вдалося почати чат",
    "contacts.email": "Email",
    "contacts.username": "Імʼя користувача",
    "sidebar.contacts": "Контакти",
    "groupInvites.createInviteLink": "Створити посилання для запрошення",
    "groupInvites.inviteLink": "Посилання для запрошення",
    "groupInvites.copyInviteLink": "Копіювати посилання",
    "groupInvites.copied": "Скопійовано!",
    "groupInvites.revokeInvite": "Скасувати",
    "groupInvites.inviteRevoked": "Запрошення скасовано.",
    "groupInvites.failedCreateInvite": "Не вдалося створити посилання",
    "groupInvites.failedLoadInvites": "Не вдалося завантажити посилання",
    "groupInvites.failedRevokeInvite": "Не вдалося скасувати посилання",
    "groupInvites.inviteLinkDescription": "Будь-хто з цим посиланням може приєднатися до групи як учасник.",
    "groupInvites.inviteLinkCreated": "Посилання створено. Скопіюйте та поділіться ним.",
    "groupInvites.noInvites": "Посилання ще немає.",
    "groupInvites.active": "Активне",
    "groupInvites.expired": "Термін дії минув",
    "groupInvites.revoked": "Скасовано",
    "groupInvites.uses": "використань",
    "groupInvite.title": "Запрошення до групи",
    "groupInvite.invitedToJoinGroup": "Вас запросили приєднатися до групи",
    "groupInvite.acceptInvite": "Прийняти запрошення",
    "groupInvite.acceptingInvite": "Прийняття запрошення…",
    "groupInvite.inviteAccepted": "Запрошення прийнято",
    "groupInvite.invalidOrExpired": "Це посилання недійсне або термін його дії минув.",
    "groupInvite.signInToAccept": "Увійдіть, щоб прийняти запрошення.",
    "groupInvite.goToGroup": "Перейти до групи",
    "groupInvite.goToLogin": "Увійти",
    "groupInvite.acceptFailed": "Не вдалося прийняти запрошення",
    "groupInvite.loadingInvite": "Завантаження запрошення…",
    "safety.title": "Безпека",
    "safety.blockedUsers": "Заблоковані користувачі",
    "safety.blockedUsersDescription": "Користувачі, яких ви заблокували, не можуть розпочинати нові особисті розмови чи додавати вас до контактів.",
    "safety.noBlockedUsers": "Ви ще нікого не заблокували.",
    "safety.block": "Заблокувати",
    "safety.blocking": "Блокуємо…",
    "safety.unblock": "Розблокувати",
    "safety.unblocking": "Розблоковуємо…",
    "safety.blockUser": "Заблокувати користувача",
    "safety.report": "Поскаржитися",
    "safety.reportUser": "Поскаржитися на користувача",
    "safety.reportMessage": "Поскаржитися на повідомлення",
    "safety.reportReason": "Причина",
    "safety.reportDetails": "Деталі",
    "safety.reportDetailsPlaceholder": "Опишіть, що сталося…",
    "safety.submitReport": "Надіслати скаргу",
    "safety.submittingReport": "Надсилаємо…",
    "safety.reportSubmitted": "Скаргу надіслано. Дякуємо.",
    "safety.reportFailed": "Не вдалося надіслати скаргу",
    "safety.blockFailed": "Не вдалося заблокувати користувача",
    "safety.unblockFailed": "Не вдалося розблокувати користувача",
    "safety.cannotBlockYourself": "Ви не можете заблокувати себе.",
    "safety.reasonOptional": "Причина (необовʼязково)",
    "safety.reasonPlaceholder": "Чому ви блокуєте цього користувача?",
    "safety.confirmUnblock": "Розблокувати {arg0}? Вони знову зможуть писати вам.",
    "safety.confirmBlock": "Заблокувати {arg0}? Вони більше не зможуть писати вам або додавати вас до контактів.",
    "safety.actionBlocked": "Ця дія заборонена через обмеження безпеки чи конфіденційності.",
    "direct.block": "Заблокувати користувача",
    "direct.report": "Поскаржитися на користувача",
    "contacts.block": "Заблокувати",
    "contacts.report": "Поскаржитися",
    "contacts.contactRequestSent": "Запит на додавання контакту надіслано.",
    "contacts.requestReceived": "хоче додати вас до контактів",
    "contacts.acceptRequest": "Прийняти",
    "contacts.declineRequest": "Відхилити",
    "contacts.cancelRequest": "Скасувати запит",
    "contacts.noRequests": "Немає очікуючих запитів на контакт.",
    "contacts.requestsTitle": "Вхідні запити на контакт",
    "contacts.doesNotAcceptContacts": "Не приймає контакти",
    "contacts.sendRequest": "Надіслати запит",
    "contacts.failedLoadRequests": "Не вдалося завантажити запити на контакт",
    "contacts.failedAcceptRequest": "Не вдалося прийняти запит",
    "contacts.failedDeclineRequest": "Не вдалося відхилити запит",
    "contacts.failedCancelRequest": "Не вдалося скасувати запит",
    "profile.contactPrivacy": "Конфіденційність контактів",
    "profile.contactPrivacyDescription": "Оберіть, хто може додавати вас до контактів без запиту.",
    "profile.contactPrivacyEveryone": "Усі",
    "profile.contactPrivacyRequestsOnly": "Лише запити",
    "profile.contactPrivacyNobody": "Ніхто",
    "profile.contactPrivacySaved": "Налаштування конфіденційності контактів збережено.",
    "profile.contactPrivacySaveFailed": "Не вдалося зберегти налаштування конфіденційності контактів.",
    "groups.block": "Заблокувати",
    "groups.report": "Поскаржитися",
  },
  ru: {
    "header.profile": "Профиль",
    "header.logout": "Выйти",
    "header.signIn": "Войти",
    "header.createAccount": "Создать аккаунт",
    "header.loading": "Загрузка…",
    "header.searchAllMessages": "Поиск по всем сообщениям",
    "header.openMenu": "Открыть меню",
    "globalSearch.title": "Поиск по всем сообщениям",
    "globalSearch.placeholder": "Искать в рабочих пространствах, каналах и личных сообщениях…",
    "globalSearch.search": "Поиск",
    "globalSearch.loading": "Ищем…",
    "globalSearch.empty": "Сообщений не найдено.",
    "globalSearch.error": "Поиск не удался",
    "globalSearch.loadMore": "Загрузить ещё",
    "globalSearch.publicChannelLabel": "Публичный канал",
    "globalSearch.privateChannelLabel": "Приватный канал",
    "globalSearch.directLabel": "ЛС",
    "globalSearch.directConversation": "Личная переписка",
    "globalSearch.groupLabel": "Группа",
    "globalSearch.scopeAll": "Все",
    "globalSearch.scopeChannel": "Каналы",
    "globalSearch.scopeDirect": "Личные",
    "globalSearch.scopeGroup": "Группы",
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
    "profile.changePassword": "Изменить пароль",
    "profile.currentPassword": "Текущий пароль",
    "profile.newPassword": "Новый пароль",
    "profile.confirmNewPassword": "Подтвердите новый пароль",
    "profile.passwordFieldsRequired": "Все поля пароля обязательны",
    "profile.passwordsDoNotMatch": "Новые пароли не совпадают",
    "profile.passwordChangeFailed": "Не удалось изменить пароль",
    "profile.passwordChanged": "Пароль успешно изменён.",
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
    "auth.emailPlaceholder": "polzovatel@primer.ru",
    "auth.password": "Пароль",
    "auth.usernamePlaceholder": "ivan_ivanov",
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
    "auth.checkYourEmail": "Проверьте почту, чтобы подтвердить аккаунт",
    "auth.verificationEmailSent": "Письмо с подтверждением отправлено на",
    "auth.verifyEmailTitle": "Подтверждение email",
    "auth.verifyingEmail": "Подтверждаем email…",
    "auth.emailVerified": "Email успешно подтверждён",
    "auth.emailVerificationFailed": "Подтверждение не удалось. Ссылка могла устареть.",
    "auth.emailVerificationMissingToken": "Недействительная или отсутствующая ссылка для подтверждения.",
    "auth.resendVerification": "Отправить письмо повторно",
    "auth.resendingVerification": "Отправляем…",
    "auth.resendVerificationSuccess": "Если email существует и не подтверждён, письмо отправлено.",
    "auth.resendVerificationHint": "Не получили письмо? Можете отправить повторно.",
    "auth.resendCooldown": "Повторная отправка через {arg0} с",
    "auth.resendLimitReached": "Слишком много попыток повторной отправки. Подождите несколько минут и попробуйте снова.",
    "auth.spamFolderHint": "Проверьте папку «Спам», если письмо не видно.",
    "auth.verificationExpiredOrInvalid": "Эта ссылка для подтверждения устарела или недействительна.",
    "auth.emailNotVerifiedHint": "Мы отправили ссылку для подтверждения на {arg0}. Проверьте почту.",
    "auth.emailNotVerified": "Пожалуйста, подтвердите email перед входом.",
    "auth.signInAfterVerification": "Теперь вы можете войти с подтверждённым email.",
    "auth.backToSignIn": "Назад ко входу",
    "auth.loading": "Загрузка…",
    "auth.tryDemo": "Попробовать демо",
    "auth.demoLoading": "Запуск демо…",
    "auth.demoUnavailable": "Демо сейчас недоступно",
    "auth.passwordsDoNotMatch": "Пароли не совпадают",
    "auth.passwordMinLength": "Пароль должен содержать минимум 8 символов",
    "auth.confirmPassword": "Подтвердите пароль",
    "auth.forgotPassword": "Забыли пароль?",
    "auth.forgotPasswordTitle": "Сброс пароля",
    "auth.forgotPasswordSubtitle": "Введите email и мы отправим ссылку для сброса.",
    "auth.sendResetLink": "Отправить ссылку",
    "auth.resetLinkSent": "Если email существует, ссылка для сброса отправлена.",
    "auth.resetPasswordTitle": "Новый пароль",
    "auth.newPassword": "Новый пароль",
    "auth.passwordResetSuccess": "Пароль успешно сброшен",
    "auth.passwordResetFailed": "Не удалось сбросить пароль",
    "auth.changeEmailTitle": "Изменить email",
    "auth.changeEmailSubtitle": "Введите новый адрес email.",
    "auth.currentEmail": "Текущий email",
    "auth.newEmail": "Новый email",
    "auth.emailChangeRequested": "Проверьте новую почту для подтверждения.",
    "auth.emailChangeLatestOnly": "Работает только последнее подтверждение.",
    "auth.confirmEmailChangeTitle": "Подтверждение изменения email",
    "auth.emailChanged": "Email успешно изменён",
    "auth.emailChangeFailed": "Не удалось изменить email",
    "auth.backToProfile": "Назад к профилю",
    "auth.requestChange": "Запросить изменение",
    "workspace.backToDashboard": "← Назад к панели",
    "workspace.loading": "Загружаем рабочее пространство…",
    "workspace.createChannel": "Создать канал",
    "workspace.channelName": "Название канала",
    "workspace.channelDescription": "Описание (необязательно)",
    "workspace.publicChannel": "Публичный",
    "workspace.privateChannel": "Приватный",
    "workspace.channelType": "Тип канала",
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
    "workspace.changeRole": "Изменить роль",
    "workspace.confirmChangeRole": "Изменить роль \"{arg0}\" на {arg1}?",
    "workspace.roleUpdated": "Роль обновлена",
    "workspace.errorUpdateRoleFailed": "Не удалось обновить роль",
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
    "invite.loadingInvite": "Загрузка приглашения…",
    "invite.invitedToJoin": "Вас пригласили присоединиться к",
    "invite.inviteExpires": "Срок действия приглашения",
    "invite.acceptInvite": "Принять приглашение",
    "invite.acceptingInvite": "Принятие приглашения…",
    "invite.inviteAccepted": "Приглашение принято",
    "invite.invalidOrExpired": "Эта ссылка недействительна или срок её действия истёк.",
    "invite.signInToAccept": "Войдите, чтобы принять приглашение.",
    "invite.goToWorkspace": "Перейти в рабочее пространство",
    "invite.goToLogin": "Войти",
    "invite.acceptFailed": "Не удалось принять приглашение",
    "invite.goToDashboard": "На главную",
    "invite.expired": "Срок действия истёк",
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
    "channel.loadOlderMessages": "Загрузить старые сообщения",
    "channel.loadingOlderMessages": "Загружаем старые сообщения…",
    "channel.errorLoadMessagesFailed": "Не удалось загрузить старые сообщения",
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
    "channel.membersPanelInfo": "Роли канала определяют, кто может управлять каналом. Они отличаются от ролей рабочего пространства.",
    "channel.manageWorkspaceRoles": "Управлять ролями рабочего пространства",
    "channel.inviteAcceptanceNote": "Приглашённые пользователи должны принять приглашение, прежде чем появиться здесь.",
    "channel.publicChannelNote": "Публичные каналы видны всем участникам рабочего пространства. Приглашение добавляет пользователя с правами канала.",
    "channel.privateChannelNote": "Приватные каналы — только по приглашению.",
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
    "channel.replyAttachmentIndicator": "Вложение",
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
    "channel.attachFile": "Прикрепить файл",
    "channel.removeAttachment": "Удалить вложение",
    "channel.errorTooManyAttachments": "Можно прикрепить до 10 файлов за раз или до 20 изображений.",
    "channel.errorInvalidAttachmentType": "Этот тип файла не поддерживается. Разрешены: изображения, PDF, Word, Excel, PowerPoint, архивы, видео и аудио.",
    "channel.errorAttachmentTooLarge": "Файл превышает 10 МБ",
    "channel.errorAttachmentTooLargeByCategory": "Файл слишком большой. Максимум: видео — 100 МБ, документы/архивы/аудио — 50 МБ, изображения — 25 МБ.",
    "channel.errorAttachmentsTotalTooLarge": "Общий размер вложений не должен превышать 150 МБ.",
    "channel.errorSomeAttachmentsInvalid": "Некоторые файлы недействительны и не добавлены",
    "channel.errorDownloadFailed": "Не удалось скачать файл",
    "channel.attachmentUploading": "Загружаем…",
    "channel.attachmentUploadFailed": "Загрузка не удалась",
    "channel.retryUpload": "Повторить",
    "channel.attachmentReady": "Готово",
    "channel.attachmentUploaded": "Загружено",
    "channel.attachmentLoading": "Загрузка…",
    "channel.errorAttachmentUploadFailed": "Не удалось загрузить вложение. Попробуйте ещё раз.",
    "channel.dropFilesHere": "Перетащите файл сюда для загрузки",
    "channel.lightboxTitle": "Просмотр изображения",
    "channel.lightboxClose": "Закрыть просмотр",
    "channel.lightboxPrevious": "Предыдущее изображение",
    "channel.lightboxNext": "Следующее изображение",
    "channel.lightboxDownload": "Скачать",
    "channel.lightboxLoading": "Загружаем изображение…",
    "channel.lightboxImageFailed": "Не удалось загрузить изображение",
    "channel.socketDisconnected": "Отключено",
    "channel.socketConnecting": "Подключение",
    "channel.socketConnected": "Подключено",
    "channel.socketJoined": "Подключено к каналу",
    "channel.socketError": "Ошибка",
    "messageAuthor.unknownUser": "Неизвестный пользователь",
    "direct.title": "Личные сообщения",
    "direct.subtitle": "Общайтесь напрямую с другими пользователями.",
    "direct.newConversation": "Новый разговор",
    "direct.startChat": "Начать чат",
    "direct.startChatDescription": "Введите имя пользователя или email человека, которому хотите написать.",
    "direct.noConversationsDescription": "Начните новый разговор, чтобы написать сообщение.",
    "direct.usernameOrEmail": "Имя пользователя или email",
    "direct.noConversations": "Разговоров пока нет.",
    "direct.loadingConversations": "Загружаем разговоры…",
    "direct.failedLoadConversations": "Не удалось загрузить разговоры",
    "direct.failedStartConversation": "Не удалось начать разговор",
    "direct.typeMessage": "Напишите сообщение…",
    "direct.send": "Отправить",
    "direct.sending": "Отправляем…",
    "direct.loadingMessages": "Загружаем сообщения…",
    "direct.loadOlderMessages": "Загрузить старые сообщения",
    "direct.loadingOlderMessages": "Загружаем старые сообщения…",
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
    "direct.replyAttachmentIndicator": "Вложение",
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
    "groups.title": "Группы",
    "groups.subtitle": "Общайтесь с несколькими людьми в простых группах.",
    "groups.createGroup": "Создать группу",
    "groups.createGroupDescription": "Создайте новую группу и добавьте участников, чтобы начать общение.",
    "groups.groupName": "Название группы",
    "groups.groupNamePlaceholder": "Введите название группы",
    "groups.searchMembers": "Поиск участников…",
    "groups.noMembersFound": "Участники не найдены.",
    "groups.selectedMembers": "Выбранные участники",
    "groups.members": "Участники",
    "groups.memberCount": "{arg0} участников",
    "groups.owner": "Владелец",
    "groups.member": "Участник",
    "groups.leaveGroup": "Покинуть группу",
    "groups.archiveGroup": "Архивировать группу",
    "groups.renameGroup": "Переименовать группу",
    "groups.addMember": "Добавить участника",
    "groups.removeMember": "Удалить",
    "groups.settings": "Настройки",
    "groups.closeSettings": "Закрыть настройки",
    "groups.noGroups": "Групп пока нет.",
    "groups.noGroupsDescription": "Создайте группу, чтобы общаться с несколькими людьми.",
    "groups.noMessages": "Сообщений пока нет.",
    "groups.loadingGroups": "Загружаем группы…",
    "groups.loadingMessages": "Загружаем сообщения…",
    "groups.loadOlderMessages": "Загрузить старые сообщения",
    "groups.loadingOlderMessages": "Загружаем старые сообщения…",
    "groups.failedLoadGroups": "Не удалось загрузить группы",
    "groups.failedLoadMessages": "Не удалось загрузить сообщения",
    "groups.failedSendMessage": "Не удалось отправить сообщение",
    "groups.failedCreateGroup": "Не удалось создать группу",
    "groups.groupArchived": "Группа архивирована.",
    "groups.youRemoved": "Вас удалили из группы.",
    "groups.leaveOwnerError": "Владелец не может покинуть группу. Вместо этого архивируйте её.",
    "groups.confirmArchive": "Архивировать эту группу? Она будет скрыта для всех участников.",
    "groups.confirmLeave": "Покинуть эту группу?",
    "groups.confirmRemoveMember": "Удалить этого участника из группы?",
    "groups.backToGroups": "← Назад к группам",
    "groups.send": "Отправить",
    "groups.sending": "Отправляем…",
    "groups.typeMessage": "Напишите сообщение…",
    "groups.reply": "Ответить",
    "groups.replyingTo": "Ответ на",
    "groups.cancelReply": "Отменить ответ",
    "groups.originalMessageMissing": "Оригинальное сообщение недоступно",
    "groups.replyAttachmentIndicator": "Вложение",
    "groups.failedRenameGroup": "Не удалось переименовать группу",
    "groups.failedAddMember": "Не удалось добавить участника",
    "groups.failedRemoveMember": "Не удалось удалить участника",
    "groups.failedLeaveGroup": "Не удалось покинуть группу",
    "groups.failedArchiveGroup": "Не удалось архивировать группу",
    "groups.groupRenamed": "Группа переименована.",
    "groups.memberAdded": "Участник добавлен.",
    "groups.memberRemoved": "Участник удалён.",
    "groups.leftGroup": "Вы покинули группу.",
    "sidebar.moveUp": "Переместить вверх",
    "sidebar.moveDown": "Переместить вниз",
    "sidebar.direct": "Личные",
    "sidebar.directMessages": "Личные сообщения",
    "sidebar.groups": "Группы",
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
    "sidebar.workspace": "Рабочее пространство",
    "sidebar.signInToSeeWorkspaces": "Войдите, чтобы видеть свои рабочие пространства",
    "sidebar.unread": "Непрочитанные",
    "workspace.confirmArchiveChannelPrefix": "Архивировать канал",
    "workspace.confirmArchiveChannelBody": "Это скроет канал из рабочего пространства. Это может сделать только владелец канала.",
    "workspace.confirmRestoreChannelPrefix": "Восстановить канал",
    "workspace.delete": "Удалить",
    "workspace.deleting": "Удаляем…",
    "workspace.confirmDeleteChannelPrefix": "Удалить канал",
    "workspace.confirmDeleteChannelBody": "Это навсегда удалит канал и его сообщения. Это может сделать только владелец рабочего пространства.",
    "workspace.errorDeleteChannelFailed": "Не удалось удалить канал",
    "workspace.dangerZone": "Опасная зона",
    "workspace.deleteWorkspace": "Удалить рабочее пространство",
    "workspace.deleteWorkspaceDescription": "После удаления это рабочее пространство, его каналы, сообщения и приглашения станут недоступны для всех. Это может сделать только владелец. Это действие нельзя отменить.",
    "workspace.deleteWorkspaceConfirmPrefix": "Удалить рабочее пространство",
    "workspace.deleteWorkspaceConfirmBody": "Это действие нельзя отменить. Введите название рабочего пространства ниже для подтверждения.",
    "workspace.deleteWorkspaceInputPlaceholder": "Введите название рабочего пространства для подтверждения",
    "workspace.deletingWorkspace": "Удаляем рабочее пространство…",
    "workspace.errorDeleteWorkspaceFailed": "Не удалось удалить рабочее пространство",
    "workspace.confirmDeleteWorkspace": (name: string) => `Вы уверены, что хотите навсегда удалить рабочее пространство "${name}"?`,
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
    "workspace.invites": "Приглашения",
    "workspace.createInviteLink": "Создать ссылку для приглашения",
    "workspace.inviteByEmail": "Пригласить по email или имени пользователя",
    "workspace.maxUses": "Макс. использований",
    "workspace.uses": "использований",
    "workspace.expires": "Срок действия",
    "workspace.copyInviteLink": "Копировать ссылку",
    "workspace.copied": "Скопировано!",
    "workspace.revokeInvite": "Отозвать",
    "workspace.inviteRevoked": "Приглашение отозвано",
    "workspace.errorCreateInviteFailed": "Не удалось создать приглашение",
    "workspace.errorLoadInvitesFailed": "Не удалось загрузить приглашения",
    "workspace.errorRevokeInviteFailed": "Не удалось отозвать приглашение",
    "workspace.noPermissionToManageInvites": "У вас нет прав для управления приглашениями.",
    "workspace.inviteRole": "Роль",
    "workspace.publicInviteLink": "Публичная ссылка",
    "workspace.targetedInvite": "Целевое приглашение",
    "workspace.inviteLinkCreated": "Ссылка создана. Скопируйте и поделитесь ею.",
    "workspace.active": "Активные",
    "workspace.past": "Прошлые",
    "workspace.noInvites": "Приглашений пока нет.",
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
    "profile.sessions": "Сессии",
    "profile.revokeOtherSessions": "Отозвать все другие сессии",
    "profile.revokeOthersConfirm": "Вы уверены? Это завершит все другие активные сессии. Текущая сессия останется активной.",
    "profile.revokeOthersSuccess": "Другие сессии отозваны.",
    "profile.revokeOthersFailed": "Не удалось отозвать другие сессии",
    "profile.revokeSession": "Отозвать",
    "profile.revokingSession": "Отзываем…",
    "profile.revokeSessionSuccess": "Сессия отозвана",
    "profile.revokeSessionFailed": "Не удалось отозвать сессию",
    "profile.revokeSessionConfirm": "Отозвать эту сессию? Она будет завершена при следующем запросе.",
    "profile.currentSession": "Текущая сессия",
    "profile.revokeCurrentSessionDisabled": "Нельзя отозвать текущую сессию здесь. Вместо этого используйте Выход.",
    "profile.sessionNotFoundRefreshed": "Сессия уже отозвана или срок её действия истёк. Список обновлён.",
    "profile.loadingSessions": "Загружаем сессии…",
    "profile.loadingSessionsFailed": "Не удалось загрузить сессии",
    "profile.sessionActive": "Активна",
    "profile.sessionRevoked": "Отозвана",
    "profile.sessionExpired": "Истекла",
    "profile.noSessions": "Сессии не найдены",
    "profile.noInactiveSessions": "Нет отозванных или истёкших сессий",
    "profile.showInactiveSessions": "Показать отозванные и истёкшие сессии",
    "profile.sessionDevice": "Устройство",
    "profile.ipLabel": "IP:",
    "profile.createdAt": "Создана",
    "profile.expiresAt": "Истекает",
    "profile.account": "Аккаунт",
    "profile.security": "Безопасность",
    "profile.languageSection": "Язык",
    "profile.showSessions": "Показать сессии",
    "profile.hideSessions": "Скрыть сессии",
    "profile.activeSessionsCount": "Активные сессии: {arg0}",
    "profile.sessionsExplanation": "Сессии — это устройства или браузеры, где сейчас выполнен вход в ваш аккаунт. Вы можете оставаться авторизованными на нескольких устройствах одновременно.",
    "profile.showPassword": "Показать пароль",
    "profile.hidePassword": "Скрыть пароль",
    "profile.accountSettings": "Настройки аккаунта",
    "profile.profileSettings": "Настройки профиля",
    "profile.notifications": "Уведомления",
    "profile.pushNotifications": "Push-уведомления",
    "profile.pushNotificationsDescription": "Получайте уведомления о новых личных сообщениях и сообщениях в каналах, даже когда приложение закрыто.",
    "profile.pushNotificationsUnsupported": "Push-уведомления не поддерживаются этим браузером.",
    "profile.pushNotificationsBlocked": "Уведомления заблокированы для этого сайта. Включите их в настройках браузера, чтобы получать push-уведомления.",
    "profile.pushNotificationsDisabled": "Push-уведомления сейчас выключены.",
    "profile.pushNotificationsEnabled": "Push-уведомления включены на этом устройстве.",
    "profile.enableNotifications": "Включить уведомления",
    "profile.disableNotifications": "Выключить уведомления",
    "profile.enablingNotifications": "Включаем…",
    "profile.disablingNotifications": "Выключаем…",
    "profile.notificationsEnabled": "Push-уведомления включены.",
    "profile.notificationsDisabled": "Push-уведомления выключены.",
    "profile.notificationPreferences": "Настройки уведомлений",
    "profile.notificationPreferencesDescription": "Выберите события, о которых отправлять push-уведомления.",
    "profile.pushNotificationsToggle": "Push-уведомления",
    "profile.pushNotificationsToggleDescription": "Разрешить любые push-уведомления на этом устройстве.",
    "profile.mentionNotificationsToggle": "Упоминания",
    "profile.mentionNotificationsToggleDescription": "Уведомлять, когда кто-то упоминает вас через @username.",
    "profile.directMessageNotificationsToggle": "Личные сообщения",
    "profile.directMessageNotificationsToggleDescription": "Уведомлять о новых личных сообщениях.",
    "profile.groupMessageNotificationsToggle": "Сообщения в группах",
    "profile.groupMessageNotificationsToggleDescription": "Уведомлять о новых сообщениях в группах.",
    "profile.channelMessageNotificationsToggle": "Сообщения в каналах",
    "profile.channelMessageNotificationsToggleDescription": "Уведомлять о новых сообщениях в каналах.",
    "profile.loadingNotificationPreferences": "Загрузка настроек…",
    "api.timeoutError": "Сервер слишком долго отвечает. Возможно, он просыпается. Попробуйте ещё раз через минуту.",
    "api.coldStartHint": "Бесплатные инстансы Render могут просыпаться до минуты.",
    "channel.searchMessages": "Искать сообщения",
    "channel.searchInThisChannel": "Искать в этом канале",
    "channel.noMessagesFound": "Сообщения не найдены.",
    "channel.searchFailed": "Поиск не удался",
    "channel.loadMoreResults": "Загрузить ещё",
    "channel.searching": "Ищем…",
    "channel.typeSearchQuery": "Введите запрос для поиска",
    "channel.jumpToMessage": "Перейти к сообщению",
    "channel.searchAttachmentMessage": "Сообщение с вложением",
    "channel.searchMessageNotLoaded": "Сообщение сейчас не загружено в ленте.",
    "channel.loadingContext": "Загрузка контекста сообщения…",
    "channel.backToLatestMessages": "Назад к последним сообщениям",
    "channel.contextLoadFailed": "Не удалось загрузить контекст сообщения.",
    "workspace.searchMessages": "Поиск сообщений",
    "workspace.searchInWorkspace": "Искать в рабочем пространстве…",
    "workspace.searchFailed": "Ошибка поиска",
    "workspace.searchQueryTooShort": "Запрос должен содержать минимум 2 символа.",
    "workspace.noMessagesFound": "Сообщений не найдено.",
    "workspace.searching": "Ищем…",
    "channel.attachmentTypeImage": "Изображение",
    "channel.attachmentTypePdf": "PDF",
    "channel.attachmentTypeWord": "Word",
    "channel.attachmentTypeExcel": "Excel",
    "channel.attachmentTypePowerPoint": "PowerPoint",
    "channel.attachmentTypeArchive": "Архив",
    "channel.attachmentTypeVideo": "Видео",
    "channel.attachmentTypeAudio": "Аудио",
    "channel.attachmentTypeFile": "Файл",
    "workspace.inviteStatusPending": "Ожидает",
    "workspace.inviteStatusRevoked": "Отозвано",
    "workspace.inviteStatusExpired": "Срок действия истёк",
    "workspace.inviteStatusAccepted": "Принято",
    "invite.title": "Приглашение",
    "errors.generic": "Что-то пошло не так. Попробуйте ещё раз.",
    "errors.validationFailed": "Проверьте введённые данные и попробуйте ещё раз.",
    "errors.unauthorized": "Войдите, чтобы продолжить.",
    "errors.forbidden": "У вас нет прав на это действие.",
    "errors.notFound": "Запрашиваемый элемент не найден.",
    "errors.internalServerError": "Ошибка сервера. Попробуйте позже.",
    "errors.networkError": "Ошибка сети. Проверьте подключение.",
    "errors.invalidCredentials": "Неверный email или пароль.",
    "errors.emailNotVerified": "Пожалуйста, подтвердите email перед входом.",
    "errors.userNotFound": "Пользователь не найден.",
    "errors.emailAlreadyExists": "Этот email уже зарегистрирован.",
    "errors.usernameAlreadyTaken": "Это имя пользователя уже занято.",
    "errors.workspaceNotFound": "Рабочее пространство не найдено.",
    "errors.channelNotFound": "Канал не найден.",
    "errors.conversationNotFound": "Разговор не найден.",
    "errors.inviteExpiredOrInvalid": "Ссылка недействительна или срок её действия истёк.",
    "errors.currentPasswordIncorrect": "Текущий пароль неверен.",
    "errors.newPasswordMustDiffer": "Новый пароль должен отличаться от текущего.",
    "errors.tooManyRequests": "Слишком много запросов. Подождите немного.",
    "errors.registrationUnavailable": "Регистрация временно недоступна. Попробуйте позже.",
    "home.description": "Безопасная платформа для командного взаимодействия. Бэкенд-инфраструктура готова к работе.",
    "home.title": "lets-chat — Современная версия",
    "home.projectStatus": "Статус проекта",
    "home.backendStatus": "Статус бэкенда",
    "home.verifyApi": "Проверьте доступность API",
    "home.checking": "Проверяем…",
    "home.checkApiHealth": "Проверить состояние API",
    "home.clickToCheck": "Нажмите кнопку, чтобы запустить проверку /health.",
    "home.contactingBackend": "Связываемся с бэкендом…",
    "home.healthy": "Работает",
    "home.degraded": "Работает с ограничениями",
    "home.environment": "Среда",
    "home.database": "База данных",
    "home.uptime": "Время работы",
    "home.timestamp": "Метка времени",
    "home.unreachable": "Недоступен",
    "home.makeSureBackend": "Убедитесь, что бэкенд запущен на {arg0}.",
    "home.unknownError": "Произошла неизвестная ошибка",
    "projectStatus.backToHome": "Назад домой",
    "projectStatus.title": "Статус проекта",
    "projectStatus.subtitle": "lets-chat — современная безопасная платформа для командного взаимодействия.",
    "projectStatus.activeDevelopment": "Активная разработка",
    "projectStatus.inProgressNote": "Проект активно разрабатывается. Не все запланированные функции уже реализованы.",
    "projectStatus.bestViewedAs": "Лучше всего подходит как",
    "projectStatus.portfolioDescription": "Портфолио / проект в активной разработке, демонстрирующий full-stack инженерию, real-time системы, безопасность аутентификации и практики продакшен-деплоя.",
    "projectStatus.currentProductionStatus": "Текущий продакшен-статус",
    "projectStatus.webDeployed": "Веб развёрнут на Vercel",
    "projectStatus.apiDeployed": "API развёрнуто на Render",
    "projectStatus.emailsDelivered": "Письма отправляются через Resend",
    "projectStatus.databaseRunning": "База данных работает на PostgreSQL",
    "projectStatus.whatWorks": "Что уже работает",
    "projectStatus.userRegistration": "Регистрация пользователей с подтверждением email",
    "projectStatus.loginLogout": "Вход, выход и ротация access/refresh токенов",
    "projectStatus.passwordReset": "Сброс пароля и изменение пароля после аутентификации",
    "projectStatus.profileManagement": "Управление профилем: отображаемое имя, аватар, язык интерфейса, смена email",
    "projectStatus.sessionManagement": "Управление сессиями: просмотр активных сессий и отзыв всех сессий",
    "projectStatus.workspacesChannels": "Рабочие пространства и каналы с автоматически созданными slug",
    "projectStatus.realTimeMessaging": "Обмен сообщениями в реальном времени через Socket.io",
    "projectStatus.messageFeatures": "Редактирование, удаление, ответы, пересылка сообщений и реакции",
    "projectStatus.directMessages": "Личные сообщения между пользователями",
    "projectStatus.resendDelivery": "Доставка писем через Resend для авторизационных сценариев",
    "projectStatus.productionSmoke": "Постдеплойные smoke-проверки продакшена",
    "projectStatus.inProgressPlanned": "В процессе / запланировано",
    "projectStatus.fileAttachments": "Файловые вложения в сообщениях",
    "projectStatus.messageSearch": "Поиск сообщений",
    "projectStatus.slugUrls": "Публичные URL на основе slug",
    "projectStatus.e2eTests": "Расширенное E2E-тестирование",
    "projectStatus.uiPolish": "Полировка UI и улучшение доступности",
    "projectStatus.techStack": "Технологический стек",
    "projectStatus.frontend": "Фронтенд",
    "projectStatus.backend": "Бэкенд",
    "projectStatus.email": "Email",
    "projectStatus.storage": "Хранилище",
    "projectStatus.auth": "Авторизация",
    "projectStatus.deployment": "Деплой",
    "projectStatus.frontendValue": "Next.js 16, React 19, Tailwind CSS, TypeScript",
    "projectStatus.backendValue": "NestJS, Prisma, PostgreSQL, Socket.io",
    "projectStatus.emailValue": "Resend",
    "projectStatus.storageValue": "S3-совместимое (MinIO)",
    "projectStatus.authValue": "JWT access + refresh токены, sessionStorage",
    "projectStatus.deploymentValue": "Vercel (web), Render (API)",
    "projectStatus.productionLinks": "Продакшен-ссылки",
    "projectStatus.appLinkLabel": "Приложение:",
    "projectStatus.apiHealthLabel": "Состояние API:",
    "projectStatus.apiDocsLabel": "Документация API (Swagger):",
    "projectStatus.sourceLabel": "Источник:",
    "profile.appInstall": "Установка приложения",
    "profile.appInstallDescription": "Добавьте Lets Chat на главный экран для быстрого доступа.",
    "profile.installAppButton": "Установить приложение",
    "profile.addToHomeScreen": "Добавить на главный экран",
    "profile.appInstalled": "Приложение установлено на этом устройстве.",
    "profile.pwaUnsupported": "Этот браузер не поддерживает установку PWA.",
    "profile.pwaManualInstructions": "Откройте меню браузера и выберите «Добавить на главный экран».",
    "profile.installingApp": "Устанавливаем…",
    "profile.installAppAccepted": "Установка началась.",
    "profile.installAppDismissed": "Установка отменена.",
    "contacts.title": "Контакты",
    "contacts.subtitle": "Находите людей и начинайте общение.",
    "contacts.searchPeople": "Поиск людей",
    "contacts.searchPlaceholder": "Искать по имени пользователя или email…",
    "contacts.addContact": "Добавить контакт",
    "contacts.removeContact": "Удалить контакт",
    "contacts.startChat": "Начать чат",
    "contacts.noContacts": "Контактов пока нет.",
    "contacts.noContactsDescription": "Найдите людей и добавьте их в контакты.",
    "contacts.contactAdded": "Контакт добавлен.",
    "contacts.contactRemoved": "Контакт удалён.",
    "contacts.alreadyInContacts": "Этот пользователь уже есть в ваших контактах.",
    "contacts.cannotAddYourself": "Вы не можете добавить себя в контакты.",
    "contacts.searchQueryTooShort": "Запрос должен содержать минимум 2 символа.",
    "contacts.searching": "Ищем…",
    "contacts.noUsersFound": "Пользователи не найдены.",
    "contacts.failedLoadContacts": "Не удалось загрузить контакты",
    "contacts.failedAddContact": "Не удалось добавить контакт",
    "contacts.failedRemoveContact": "Не удалось удалить контакт",
    "contacts.failedStartDm": "Не удалось начать чат",
    "contacts.email": "Email",
    "contacts.username": "Имя пользователя",
    "sidebar.contacts": "Контакты",
    "groupInvites.createInviteLink": "Создать ссылку для приглашения",
    "groupInvites.inviteLink": "Ссылка для приглашения",
    "groupInvites.copyInviteLink": "Копировать ссылку",
    "groupInvites.copied": "Скопировано!",
    "groupInvites.revokeInvite": "Отозвать",
    "groupInvites.inviteRevoked": "Приглашение отозвано.",
    "groupInvites.failedCreateInvite": "Не удалось создать ссылку",
    "groupInvites.failedLoadInvites": "Не удалось загрузить ссылки",
    "groupInvites.failedRevokeInvite": "Не удалось отозвать ссылку",
    "groupInvites.inviteLinkDescription": "Любой, у кого есть эта ссылка, может присоединиться к группе как участник.",
    "groupInvites.inviteLinkCreated": "Ссылка создана. Скопируйте и поделитесь ею.",
    "groupInvites.noInvites": "Ссылок пока нет.",
    "groupInvites.active": "Активно",
    "groupInvites.expired": "Срок действия истёк",
    "groupInvites.revoked": "Отозвано",
    "groupInvites.uses": "использований",
    "groupInvite.title": "Приглашение в группу",
    "groupInvite.invitedToJoinGroup": "Вас пригласили присоединиться к группе",
    "groupInvite.acceptInvite": "Принять приглашение",
    "groupInvite.acceptingInvite": "Принятие приглашения…",
    "groupInvite.inviteAccepted": "Приглашение принято",
    "groupInvite.invalidOrExpired": "Эта ссылка недействительна или срок её действия истёк.",
    "groupInvite.signInToAccept": "Войдите, чтобы принять приглашение.",
    "groupInvite.goToGroup": "Перейти в группу",
    "groupInvite.goToLogin": "Войти",
    "groupInvite.acceptFailed": "Не удалось принять приглашение",
    "groupInvite.loadingInvite": "Загрузка приглашения…",
    "safety.title": "Безопасность",
    "safety.blockedUsers": "Заблокированные пользователи",
    "safety.blockedUsersDescription": "Пользователи, которых вы заблокировали, не могут начинать новые личные переписки или добавлять вас в контакты.",
    "safety.noBlockedUsers": "Вы ещё никого не заблокировали.",
    "safety.block": "Заблокировать",
    "safety.blocking": "Блокируем…",
    "safety.unblock": "Разблокировать",
    "safety.unblocking": "Разблокируем…",
    "safety.blockUser": "Заблокировать пользователя",
    "safety.report": "Пожаловаться",
    "safety.reportUser": "Пожаловаться на пользователя",
    "safety.reportMessage": "Пожаловаться на сообщение",
    "safety.reportReason": "Причина",
    "safety.reportDetails": "Подробности",
    "safety.reportDetailsPlaceholder": "Опишите, что произошло…",
    "safety.submitReport": "Отправить жалобу",
    "safety.submittingReport": "Отправляем…",
    "safety.reportSubmitted": "Жалоба отправлена. Спасибо.",
    "safety.reportFailed": "Не удалось отправить жалобу",
    "safety.blockFailed": "Не удалось заблокировать пользователя",
    "safety.unblockFailed": "Не удалось разблокировать пользователя",
    "safety.cannotBlockYourself": "Вы не можете заблокировать себя.",
    "safety.reasonOptional": "Причина (необязательно)",
    "safety.reasonPlaceholder": "Почему вы блокируете этого пользователя?",
    "safety.confirmUnblock": "Разблокировать {arg0}? Они снова смогут писать вам.",
    "safety.confirmBlock": "Заблокировать {arg0}? Они больше не смогут писать вам или добавлять вас в контакты.",
    "safety.actionBlocked": "Это действие запрещено из-за ограничений безопасности или конфиденциальности.",
    "direct.block": "Заблокировать пользователя",
    "direct.report": "Пожаловаться на пользователя",
    "contacts.block": "Заблокировать",
    "contacts.report": "Пожаловаться",
    "contacts.contactRequestSent": "Запрос на добавление в контакты отправлен.",
    "contacts.requestReceived": "хочет добавить вас в контакты",
    "contacts.acceptRequest": "Принять",
    "contacts.declineRequest": "Отклонить",
    "contacts.cancelRequest": "Отменить запрос",
    "contacts.noRequests": "Нет ожидающих запросов на контакт.",
    "contacts.requestsTitle": "Входящие запросы на контакт",
    "contacts.doesNotAcceptContacts": "Не принимает контакты",
    "contacts.sendRequest": "Отправить запрос",
    "contacts.failedLoadRequests": "Не удалось загрузить запросы на контакт",
    "contacts.failedAcceptRequest": "Не удалось принять запрос",
    "contacts.failedDeclineRequest": "Не удалось отклонить запрос",
    "contacts.failedCancelRequest": "Не удалось отменить запрос",
    "profile.contactPrivacy": "Конфиденциальность контактов",
    "profile.contactPrivacyDescription": "Выберите, кто может добавлять вас в контакты без запроса.",
    "profile.contactPrivacyEveryone": "Все",
    "profile.contactPrivacyRequestsOnly": "Только запросы",
    "profile.contactPrivacyNobody": "Никто",
    "profile.contactPrivacySaved": "Настройка конфиденциальности контактов сохранена.",
    "profile.contactPrivacySaveFailed": "Не удалось сохранить настройку конфиденциальности контактов.",
    "groups.block": "Заблокировать",
    "groups.report": "Пожаловаться",
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
