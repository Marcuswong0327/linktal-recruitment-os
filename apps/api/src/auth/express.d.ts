import { AuthUser } from './auth.types';

// Attach the authenticated principal to Express' Request (set by AuthGuard).
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
