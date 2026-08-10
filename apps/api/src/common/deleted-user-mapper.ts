import type { User } from '@lets-chat/database';

export type SafeUser = Pick<
  User,
  | 'id'
  | 'username'
  | 'displayName'
  | 'avatarUrl'
  | 'interfaceLanguage'
  | 'role'
  | 'contactPrivacySetting'
  | 'createdAt'
> & {
  isDeleted: boolean;
};

export const DELETED_USER_DISPLAY_NAME = 'Deleted user';

export function isDeletedUser(user: {
  status?: string;
  deletedAt?: Date | null;
}): boolean {
  return (
    user.status === 'PENDING_DELETION' ||
    user.status === 'ANONYMIZED' ||
    user.deletedAt != null
  );
}

export function mapUserToSafeUser(user: User | null): SafeUser | null {
  if (!user) return null;

  if (isDeletedUser(user)) {
    return {
      id: user.id,
      username: '',
      displayName: DELETED_USER_DISPLAY_NAME,
      avatarUrl: null,
      interfaceLanguage: 'en',
      role: 'USER',
      contactPrivacySetting: 'REQUESTS_ONLY',
      createdAt: user.createdAt,
      isDeleted: true,
    };
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    interfaceLanguage: user.interfaceLanguage,
    role: user.role,
    contactPrivacySetting: user.contactPrivacySetting,
    createdAt: user.createdAt,
    isDeleted: false,
  };
}
