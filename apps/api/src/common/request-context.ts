import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request store carried through the whole request via AsyncLocalStorage.
 * `actorId` is the acting Consultant's id (set by AuthGuard once the request is
 * authenticated); it stays undefined on @Public() routes and system tasks.
 */
export interface RequestStore {
  actorId?: string;
  requestId?: string;
}

// Module-level singleton (not a Nest provider) so the Prisma client extension —
// a plain function, outside Nest's DI — can read the current actor too.
const als = new AsyncLocalStorage<RequestStore>();

export const RequestContext = {
  /** Runs `cb` with a fresh store bound for the lifetime of the request. */
  run<T>(store: RequestStore, cb: () => T): T {
    return als.run(store, cb);
  },

  /** Stamps the authenticated actor onto the active store (no-op if none). */
  setActor(actorId: string | null | undefined): void {
    const store = als.getStore();
    if (store) store.actorId = actorId ?? undefined;
  },

  /** The acting Consultant id, or undefined for unauthenticated/system writes. */
  getActorId(): string | undefined {
    return als.getStore()?.actorId;
  },

  /** The current request's correlation id, if any. */
  getRequestId(): string | undefined {
    return als.getStore()?.requestId;
  },
};
