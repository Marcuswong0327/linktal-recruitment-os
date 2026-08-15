import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from './request-context';

/**
 * One summary AuditLog row per export action — not one row per exported
 * record, which could mean thousands of rows for an unbounded filtered
 * export. Uses the `'(bulk)'` sentinel entityId already established for bulk
 * writes (see prisma.extensions.ts's `writeAudit`) — the audit presenter
 * already knows to skip per-record label resolution for it. Called manually
 * (not via the Prisma extension's AUDITED_MODELS interception) because an
 * export is a read, not a row write — there's nothing for that layer to hook.
 */
export async function logExport(
  base: PrismaService,
  entityType: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await base.auditLog.create({
    data: {
      actorId: RequestContext.getActorId() ?? null,
      action: 'EXPORT',
      entityType,
      entityId: '(bulk)',
      metadata: { requestId: RequestContext.getRequestId(), ...metadata },
    },
  });
}
