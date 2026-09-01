import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const errorResponse = exception.getResponse();
      const normalized =
        typeof errorResponse === 'string'
          ? { message: errorResponse }
          : (errorResponse as Record<string, unknown>);
      response.status(status).json({
        statusCode: status,
        code: normalized.code ?? 'HTTP_EXCEPTION',
        message: normalized.message ?? '요청을 처리할 수 없어요.',
        path: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: '서버 내부 오류가 발생했어요.',
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
