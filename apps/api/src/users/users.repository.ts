import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

interface CreateUserInput {
  email: string;
  username: string;
  passwordHash: string;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizeUsername(value: string): string {
    return value.trim().toLowerCase();
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: this.normalizeEmail(email) },
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findFirst({
      where: { username: this.normalizeUsername(username) },
    });
  }

  async createUser(input: CreateUserInput) {
    return this.prisma.user.create({
      data: {
        email: this.normalizeEmail(input.email),
        username: this.normalizeUsername(input.username),
        passwordHash: input.passwordHash,
      },
    });
  }
}
