import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DemoService } from '../src/demo/demo.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const demoService = app.get(DemoService);
  const result = await demoService.cleanupOldDemoData();

  // eslint-disable-next-line no-console
  console.log(`Demo cleanup complete: ${JSON.stringify(result)}`);

  await app.close();
  process.exit(0);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Demo cleanup failed:', error);
  process.exit(1);
});
