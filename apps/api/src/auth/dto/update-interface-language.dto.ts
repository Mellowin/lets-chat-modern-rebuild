import { IsIn, IsString } from 'class-validator';

export class UpdateInterfaceLanguageDto {
  @IsString()
  @IsIn(['en', 'uk', 'ru'])
  interfaceLanguage: 'en' | 'uk' | 'ru';
}
