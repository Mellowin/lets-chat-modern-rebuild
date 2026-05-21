import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAvatarDto } from './update-avatar.dto';

describe('UpdateAvatarDto', () => {
  async function validateDto(obj: Record<string, unknown>) {
    const dto = plainToInstance(UpdateAvatarDto, obj);
    return validate(dto);
  }

  it('accepts allowed preset /avatars/avatar-1.svg', async () => {
    const errors = await validateDto({ avatarUrl: '/avatars/avatar-1.svg' });
    expect(errors).toHaveLength(0);
  });

  it('accepts all 6 allowed presets', async () => {
    const presets = [
      '/avatars/avatar-1.svg',
      '/avatars/avatar-2.svg',
      '/avatars/avatar-3.svg',
      '/avatars/avatar-4.svg',
      '/avatars/avatar-5.svg',
      '/avatars/avatar-6.svg',
    ];

    for (const preset of presets) {
      const errors = await validateDto({ avatarUrl: preset });
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects external URL https://evil.com/avatar.svg', async () => {
    const errors = await validateDto({ avatarUrl: 'https://evil.com/avatar.svg' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('avatarUrl');
    expect(errors[0].constraints).toMatchObject({
      isIn: 'Invalid avatar preset',
    });
  });

  it('rejects arbitrary internal path /avatars/not-allowed.svg', async () => {
    const errors = await validateDto({ avatarUrl: '/avatars/not-allowed.svg' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('avatarUrl');
    expect(errors[0].constraints).toMatchObject({
      isIn: 'Invalid avatar preset',
    });
  });

  it('rejects non-string avatarUrl', async () => {
    const errors = await validateDto({ avatarUrl: 123 });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('avatarUrl');
  });

  it('rejects empty string', async () => {
    const errors = await validateDto({ avatarUrl: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('avatarUrl');
  });

  it('rejects missing avatarUrl', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('avatarUrl');
  });
});
