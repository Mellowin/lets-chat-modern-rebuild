import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { MailService } from './mail.service';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Get('preview/:type')
  preview(@Param('type') type: string, @Res() res: Response): void {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }

    if (!['verify', 'reset', 'email-change'].includes(type)) {
      throw new BadRequestException('Unknown preview type');
    }

    const template = this.mailService.previewTemplate(type);
    res.setHeader('Content-Type', 'text/html');
    res.send(template.html);
  }
}
