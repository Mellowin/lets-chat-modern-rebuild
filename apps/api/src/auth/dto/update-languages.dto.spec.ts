import { validate } from 'class-validator';
import { UpdateLanguagesDto } from './update-languages.dto';

describe('UpdateLanguagesDto', () => {
  it('accepts empty array', async () => {
    const dto = new UpdateLanguagesDto();
    dto.languages = [];

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts up to 5 languages', async () => {
    const dto = new UpdateLanguagesDto();
    dto.languages = ['English', 'Ukrainian', 'Spanish', 'German', 'French'];

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects more than 5 languages', async () => {
    const dto = new UpdateLanguagesDto();
    dto.languages = [
      'English',
      'Ukrainian',
      'Spanish',
      'German',
      'French',
      'Italian',
    ];

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('arrayMaxSize');
  });

  it('rejects non-string item', async () => {
    const dto = new UpdateLanguagesDto();
    Object.assign(dto, { languages: ['English', 123] });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isString');
  });

  it('rejects language longer than 32 chars', async () => {
    const dto = new UpdateLanguagesDto();
    dto.languages = ['English', 'a'.repeat(33)];

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('documents current behavior: empty strings are DTO-valid before controller normalization', async () => {
    const dto = new UpdateLanguagesDto();
    dto.languages = ['English', ''];

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
