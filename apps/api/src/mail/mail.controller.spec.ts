import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';

describe('MailController', () => {
  let controller: MailController;
  let mailService: jest.Mocked<MailService>;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MailController],
      providers: [
        {
          provide: MailService,
          useValue: {
            previewTemplate: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(MailController);
    mailService = moduleRef.get(MailService);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  describe('preview', () => {
    const mockRes = () => {
      const res: Record<string, jest.Mock> = {
        setHeader: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
      return res as unknown as import('express').Response;
    };

    it('returns HTML for verify preview in non-production', () => {
      process.env.NODE_ENV = 'development';
      mailService.previewTemplate.mockReturnValue({
        subject: 'Verify your email address for Lets Chat',
        text: 'text',
        html: '<html>Verify Email Address</html>',
      });

      const res = mockRes();
      controller.preview('verify', res);

      expect(mailService.previewTemplate).toHaveBeenCalledWith('verify');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
      expect(res.send).toHaveBeenCalledWith(
        '<html>Verify Email Address</html>',
      );
    });

    it('returns HTML for reset preview in non-production', () => {
      process.env.NODE_ENV = 'development';
      mailService.previewTemplate.mockReturnValue({
        subject: 'Reset your Lets Chat password',
        text: 'text',
        html: '<html>Reset Password</html>',
      });

      const res = mockRes();
      controller.preview('reset', res);

      expect(mailService.previewTemplate).toHaveBeenCalledWith('reset');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
      expect(res.send).toHaveBeenCalledWith('<html>Reset Password</html>');
    });

    it('returns HTML for email-change preview in non-production', () => {
      process.env.NODE_ENV = 'development';
      mailService.previewTemplate.mockReturnValue({
        subject: 'Confirm your email change for Lets Chat',
        text: 'text',
        html: '<html>Confirm Email Change</html>',
      });

      const res = mockRes();
      controller.preview('email-change', res);

      expect(mailService.previewTemplate).toHaveBeenCalledWith('email-change');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
      expect(res.send).toHaveBeenCalledWith(
        '<html>Confirm Email Change</html>',
      );
    });

    it('throws BadRequestException for unknown type', () => {
      process.env.NODE_ENV = 'development';

      expect(() => controller.preview('unknown', mockRes())).toThrow(
        BadRequestException,
      );
      expect(mailService.previewTemplate).not.toHaveBeenCalled();
    });

    it('throws NotFoundException in production', () => {
      process.env.NODE_ENV = 'production';

      expect(() => controller.preview('verify', mockRes())).toThrow(
        NotFoundException,
      );
      expect(mailService.previewTemplate).not.toHaveBeenCalled();
    });
  });
});
