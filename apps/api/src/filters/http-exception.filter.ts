import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
  timestamp: string;
  path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const requestId = (req.id as string) || 'unknown';
    const path = req.url;
    const timestamp = new Date().toISOString();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Internal server error';
    let details: unknown | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object' && response !== null) {
        const resp = response as Record<string, unknown>;
        message = (resp.message as string) || message;
        code = (resp.error as string)?.replace(/\s+/g, '_').toUpperCase() || code;

        if (statusCode === HttpStatus.BAD_REQUEST && Array.isArray(resp.message)) {
          code = 'VALIDATION_ERROR';
          message = 'Validation failed';
          details = resp.message;
        }
      }
    } else {
      console.error(
        `[Unhandled Exception] requestId=${requestId} path=${path}`,
        exception,
      );
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      code,
      message,
      ...(details !== undefined && { details }),
      requestId,
      timestamp,
      path,
    };

    res.status(statusCode).json(errorResponse);
  }
}
