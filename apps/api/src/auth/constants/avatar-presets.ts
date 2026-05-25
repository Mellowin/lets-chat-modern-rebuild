export const ALLOWED_AVATAR_PRESETS = [
  '/avatars/avatar-1.svg',
  '/avatars/avatar-2.svg',
  '/avatars/avatar-3.svg',
  '/avatars/avatar-4.svg',
  '/avatars/avatar-5.svg',
  '/avatars/avatar-6.svg',
] as const;

export type AllowedAvatarPreset = (typeof ALLOWED_AVATAR_PRESETS)[number];
