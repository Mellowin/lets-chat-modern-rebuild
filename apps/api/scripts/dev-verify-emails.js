// Development helper only. Do not use in production.

const { PrismaClient } = require('@lets-chat/database');

function validateEmail(email) {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) {
    throw new Error(`Invalid email: "${email}"`);
  }
  return trimmed;
}

async function main() {
  const emails = process.argv.slice(2);

  if (emails.length === 0) {
    console.error(
      'Usage: node apps/api/scripts/dev-verify-emails.js email1@example.com [email2@example.com ...]',
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      'Error: DATABASE_URL environment variable is not set.\n' +
        'Example: set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/letschat?schema=public',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    for (const rawEmail of emails) {
      const email = validateEmail(rawEmail);
      const user = await prisma.user.findFirst({ where: { email } });

      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: new Date() },
        });
        console.log('Verified existing:', email);
      } else {
        await prisma.user.create({
          data: {
            email,
            username: email.split('@')[0],
            passwordHash: 'dev-hash-not-used',
            emailVerifiedAt: new Date(),
          },
        });
        console.log('Created and verified:', email);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
