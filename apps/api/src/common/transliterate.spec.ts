import { transliterate, slugify } from './transliterate';

describe('transliterate', () => {
  it('transliterates Russian letters', () => {
    expect(transliterate('Моя Команда')).toBe('moya komanda');
  });

  it('transliterates Ukrainian letters', () => {
    expect(transliterate('Ілля')).toBe('illya');
  });

  it('passes through Latin characters', () => {
    expect(transliterate('hello')).toBe('hello');
  });
});

describe('slugify', () => {
  it('converts "Моя Команда" to "moya-komanda"', () => {
    expect(slugify('Моя Команда')).toBe('moya-komanda');
  });

  it('returns empty string for "!!!"', () => {
    expect(slugify('!!!')).toBe('');
  });

  it('collapses repeated spaces to one hyphen', () => {
    expect(slugify('hello    world')).toBe('hello-world');
  });

  it('trims and lowercases input', () => {
    expect(slugify('  HELLO WORLD  ')).toBe('hello-world');
  });

  it('removes non-alphanumeric characters', () => {
    expect(slugify('test@#$%name')).toBe('testname');
  });
});
