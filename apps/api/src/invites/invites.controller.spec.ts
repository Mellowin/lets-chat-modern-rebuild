import { ParseUUIDPipe, BadRequestException } from '@nestjs/common';

describe('InvitesController workspaceId param', () => {
  it('should reject invalid workspaceId UUID', async () => {
    const pipe = new ParseUUIDPipe();
    await expect(
      pipe.transform('not-a-uuid', { type: 'param', metatype: String }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
