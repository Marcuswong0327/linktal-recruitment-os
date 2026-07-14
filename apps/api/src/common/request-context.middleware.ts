import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from './request-context';

/**
 * Opens an AsyncLocalStorage scope for each request. Calling `next()` inside
 * `run()` keeps the whole downstream chain (guards → handler → Prisma calls)
 * within the same context, so AuthGuard can stamp the actor and the Prisma
 * audit extension can read it back. Registered globally in AppModule.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    RequestContext.run({ requestId: randomUUID() }, () => next());
  }
}
