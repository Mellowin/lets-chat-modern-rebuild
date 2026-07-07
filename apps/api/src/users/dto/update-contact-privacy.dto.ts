import { IsIn } from 'class-validator';

export class UpdateContactPrivacyDto {
  @IsIn(['EVERYONE', 'REQUESTS_ONLY', 'NOBODY'])
  contactPrivacySetting!: 'EVERYONE' | 'REQUESTS_ONLY' | 'NOBODY';
}
