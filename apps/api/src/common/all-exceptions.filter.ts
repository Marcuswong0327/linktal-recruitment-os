import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ErrorResponse } from './error-response.entity';

// HTTP status -> stable machine code. The frontend branches on `code`, never on
// the numeric status or the human message.
const STATUS_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
};

const codeForStatus = (status: number) =>
  STATUS_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR');

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message, details } = this.normalize(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponse = {
      statusCode: status,
      code,
      message,
      details,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details: string[] | null;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      // HttpException payloads are either a string or an object. Nest's built-in
      // exceptions (and ValidationPipe) use { statusCode, message, error }.
      if (typeof res === 'string') {
        return { status, code: codeForStatus(status), message: res, details: null };
      }

      const obj = res as Record<string, unknown>;
      const rawMessage = obj.message;
      const details = Array.isArray(rawMessage) ? (rawMessage as string[]) : null;
      const message = Array.isArray(rawMessage)
        ? 'Validation failed'
        : ((rawMessage as string) ?? exception.message);

      return {
        status,
        // Allow a thrown payload to override the code: throw new
        // NotFoundException({ code: 'CANDIDATE_NOT_FOUND', message }).
        code: (obj.code as string) ?? codeForStatus(status),
        message,
        details,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.normalizePrisma(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: null,
    };
  }

  private normalizePrisma(exception: Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002': // unique constraint violation
        return {
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'A record with these values already exists',
          details: null,
        };
      case 'P2025': // record not found
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'Record not found',
          details: null,
        };
      case 'P2003': // foreign key constraint violation — e.g. deleting a still-referenced row
        return {
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'This record is still referenced by other data and cannot be deleted',
          details: null,
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          details: null,
        };
    }
  }
}
