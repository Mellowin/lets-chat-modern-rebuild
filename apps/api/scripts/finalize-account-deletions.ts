import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AccountDeletionFinalizerService } from '../src/auth/account-deletion-finalizer.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const finalizer = app.get(AccountDeletionFinalizerService);
  const result = await finalizer.run();

  // eslint-disable-next-line no-console
  console.log(
    `Account deletion finalization complete: ${JSON.stringify(result)}`,
  );

  await app.close();
  process.exit(0);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Account deletion finalization failed:', error);
  process.exit(1);
});
