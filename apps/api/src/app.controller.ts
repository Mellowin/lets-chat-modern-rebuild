import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return { status: 'ok', service: 'Lets Chat API' };
  }

  @Get('version')
  getVersion() {
    return {
      status: 'ok',
      service: 'Lets Chat API',
      commit:
        process.env.RENDER_GIT_COMMIT ?? process.env.GITHUB_SHA ?? 'unknown',
      branch:
        process.env.RENDER_GIT_BRANCH ??
        process.env.GITHUB_REF_NAME ??
        'unknown',
      nodeEnv: process.env.NODE_ENV ?? 'unknown',
    };
  }
}
