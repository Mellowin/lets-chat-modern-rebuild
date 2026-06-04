import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMessageDto } from './update-message.dto';

describe('UpdateMessageDto', () => {
  async function validateDto(obj: Record<string, unknown>) {
    const dto = plainToInstance(UpdateMessageDto, obj);
    return validate(dto);
  }

  it('accepts valid content', async () => {
    const errors = await validateDto({ content: 'Updated content' });
    expect(errors).toHaveLength(0);
  });

  it('rejects empty content', async () => {
    const errors = await validateDto({ content: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('content');
  });

  it('rejects whitespace-only content after trim', async () => {
    const errors = await validateDto({ content: '   ' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('content');
  });

  it('rejects content longer than 4000 characters', async () => {
    const errors = await validateDto({ content: 'a'.repeat(4001) });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('content');
  });

  it('accepts content at exactly 4000 characters', async () => {
    const errors = await validateDto({ content: 'a'.repeat(4000) });
    expect(errors).toHaveLength(0);
  });

  it('rejects missing content', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('content');
  });
});
