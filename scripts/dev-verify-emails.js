const { PrismaClient } = require('../node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:postgres@localhost:5432/letschat?schema=public',
    },
  },
});

async function main() {
  const args = process.argv.slice(2);
  const emails = args.length > 0 ? args : ['mellowin1987@gmail.com', 'osanamyan@ukr.net'];

  for (const email of emails) {
    const user = await prisma.user.findFirst({ where: { email } });
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
      console.log('✓ Verified:', email);
    } else {
      await prisma.user.create({
        data: {
          email,
          username: email.split('@')[0],
          passwordHash: 'dev-hash-not-used',
          emailVerifiedAt: new Date(),
        },
      });
      console.log('✓ Created and verified:', email);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
