import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, compare } from 'bcryptjs';

@Injectable()
export class PasswordService {
  constructor(private readonly config: ConfigService) {}

  async hashPassword(password: string): Promise<string> {
    const rounds = this.config.get<number>('BCRYPT_SALT_ROUNDS', 12);
    return hash(password, rounds);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return compare(password, hash);
  }
}
