import { Prisma, PrismaClient } from '@prisma/client';
import { RequestContext } from '../common/request-context';

/**
 * A single Prisma Client extension that gives the app soft delete + an audit
 * trail, driven by two model allow-lists:
 *
 *  - SOFT_DELETE_MODELS: reads hide `deletedAt != null` rows, and `delete`/
 *    `deleteMany` are rewritten to stamp `deletedAt`/`deletedById` instead of
 *    physically removing the row.
 *  - AUDITED_MODELS: every write emits an `AuditLog` row (with a before→after
 *    diff for single-row updates), attributed to the current RequestContext
 *    actor.
 *
 * The extension closes over the *base* (unextended) client so its own helper
 * queries — the soft-delete rewrite, the before-image fetch, and the audit
 * insert — don't re-enter the extension (no recursion, no double logging).
 */

const SOFT_DELETE_MODELS = new Set([
  'Client',
  'Stakeholder',
  'ClientJobResearch',
  'Candidate',
  'JobOrder',
  'CandidateSubmission',
  'Placement',
  'Interview',
  'Tob',
]);

// Soft-delete set plus the RBAC/identity tables (hard-deleted, but still audited).
// ConsultantIndustry and JobOrderConsultant are both written as individual
// top-level create/delete calls (never a nested relation write), so this
// interception layer actually sees and diffs each row — see
// ConsultantsService.setIndustries and JobOrdersService.setConsultants.
export const AUDITED_MODELS = new Set([
  ...SOFT_DELETE_MODELS,
  'Consultant',
  'Role',
  'Permission',
  'ConsultantIndustry',
  'JobOrderConsultant',
  // Append-only contact-history logs — no delete endpoint on either, so
  // neither belongs in SOFT_DELETE_MODELS, but every create/update still
  // needs a paper trail like every other notes-bearing entity already has.
  'CandidateContactHistory',
  'StakeholderContactHistory',
]);

/**
 * What soft-deleting a row on the left also soft-deletes, and the FK that
 * points back at it. Applied here — inside the interception layer — rather
 * than as per-service code, so cascading is a property of "this row got
 * soft-deleted" regardless of which path did it: the API, a script, the
 * importer, or a raw Prisma call. Previously this cascade only existed inside
 * ClientsService.remove/CandidatesService.remove/JobOrdersService.remove, so
 * any other path (Path B in docs/scope-explained.md §9) orphaned children.
 *
 * Walked recursively, so Client → JobOrder → CandidateSubmission → Placement
 * all cascade off a single Client delete. Interview is deliberately absent —
 * no cascade path reaches it today (docs/scope-explained.md §10, gap #3).
 */
const CASCADE_MAP: Record<string, { model: string; fk: string }[]> = {
  Client: [
    { model: 'JobOrder', fk: 'clientId' },
    { model: 'Stakeholder', fk: 'clientId' },
    { model: 'ClientJobResearch', fk: 'clientId' },
    { model: 'Tob', fk: 'clientId' },
  ],
  JobOrder: [{ model: 'CandidateSubmission', fk: 'jobOrderId' }],
  Candidate: [{ model: 'CandidateSubmission', fk: 'candidateId' }],
  CandidateSubmission: [{ model: 'Placement', fk: 'submissionId' }],
};

const READ_MANY_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

// Only these operations are audited — reads must never produce audit rows.
const WRITE_OPS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

type AnyArgs = Record<string, any>;

/** "Candidate" → base.candidate delegate. */
function delegateFor(base: PrismaClient, model: string): any {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (base as any)[key];
}

/** JSON-safe scalar (Date → ISO, Decimal/bigint → string). Exported for tests. */
export function toJson(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object') {
    const name = (v as { constructor?: { name?: string } }).constructor?.name;
    if (name === 'Decimal') return String(v);
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return String(v);
    }
  }
  return v;
}

// Prisma's own nested-write shapes for relations are always a keyed wrapper
// object (`{ create: [...] }`, `{ connect: { id } }`) — never a bare array,
// and always containing one of these operation keys. Anything else that
// reaches here as an object/array is a literal value being written directly
// to a scalar/Json field (e.g. `data.notes = [...]` for a JSONB timeline).
const RELATION_OP_KEYS = new Set([
  'create',
  'createMany',
  'connect',
  'connectOrCreate',
  'disconnect',
  'delete',
  'deleteMany',
  'update',
  'updateMany',
  'upsert',
]);

/** Unwrap Prisma's atomic write forms (`{ set: x }`) to the plain value. */
function resolveWriteValue(raw: unknown): { value: unknown; isScalar: boolean } {
  if (Array.isArray(raw)) {
    // A bare array is always a literal JSON value (e.g. a note timeline),
    // never a relation nested-write — those are always wrapped in an object.
    return { value: raw, isScalar: true };
  }
  if (raw !== null && typeof raw === 'object') {
    const keys = Object.keys(raw as AnyArgs);
    if (keys.includes('set')) return { value: (raw as AnyArgs).set, isScalar: true };
    if (keys.some((k) => RELATION_OP_KEYS.has(k))) {
      return { value: raw, isScalar: false }; // relation nested-write — skip in diff
    }
    // No relation-op keys recognized — a plain object literal written
    // directly to a Json field, not a nested-write wrapper.
    return { value: raw, isScalar: true };
  }
  return { value: raw, isScalar: true };
}

/** Field-level before→after diff over the scalar keys in an update payload. Exported for tests. */
export function computeChanges(before: AnyArgs | null, data: AnyArgs | undefined) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, raw] of Object.entries(data ?? {})) {
    const { value: to, isScalar } = resolveWriteValue(raw);
    if (!isScalar) continue;
    const from = before ? before[key] : undefined;
    const fromJ = toJson(from);
    const toJ = toJson(to);
    if (JSON.stringify(fromJ) !== JSON.stringify(toJ)) changes[key] = { from: fromJ, to: toJ };
  }
  return changes;
}

function newDeletedAt(data: AnyArgs | undefined): unknown {
  if (!data || !('deletedAt' in data)) return undefined;
  return resolveWriteValue(data.deletedAt).value;
}

/** Derive the semantic action for a single-row write from its data + before-image. Exported for tests. */
export function deriveAction(
  model: string,
  operation: string,
  before: AnyArgs | null,
  data: AnyArgs | undefined,
): string {
  if (operation === 'create' || operation === 'createMany' || operation === 'upsert') {
    return 'CREATE';
  }
  if (operation === 'delete' || operation === 'deleteMany') return 'HARD_DELETE';

  const setsDeletedAt = data != null && 'deletedAt' in data;
  const nextDeletedAt = newDeletedAt(data);
  const wasDeleted = before ? before.deletedAt != null : false;
  if (setsDeletedAt && nextDeletedAt != null && !wasDeleted) return 'SOFT_DELETE';
  if (setsDeletedAt && nextDeletedAt == null && wasDeleted) return 'RESTORE';

  if (model === 'Consultant' && data && 'isActive' in data) {
    if (resolveWriteValue(data.isActive).value === false) return 'DEACTIVATE';
  }
  return 'UPDATE';
}

function baseMetadata(extra?: AnyArgs) {
  const requestId = RequestContext.getRequestId();
  // Every audit row this extension writes comes from a live app request —
  // scripts that write historical/imported data (e.g. import-workbook.ts) use
  // the base, unextended PrismaClient and never reach this code at all, so
  // there's nothing to disambiguate here today. This just makes that
  // explicit/self-describing rather than implicit, for whenever a second
  // write channel (a real import UI, a scheduled job) is added later.
  return { source: 'app', ...(requestId ? { requestId } : {}), ...extra };
}

/**
 * How many affected row ids a bulk audit entry records before it stops being
 * a useful record and starts being a payload. The `count` beside them is
 * always the true total, so a capped list is still honest — it just stops
 * short of putting 5,000 cuids in a metadata column.
 */
export const BULK_ID_CAP = 100;

async function writeAudit(
  base: PrismaClient,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    changes?: unknown;
    metadata?: AnyArgs;
  },
): Promise<void> {
  await base.auditLog.create({
    data: {
      actorId: RequestContext.getActorId() ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      changes: (entry.changes ?? undefined) as Prisma.InputJsonValue | undefined,
      metadata: baseMetadata(entry.metadata) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Soft-deletes every row under `parentIds` per `CASCADE_MAP`, recursing into
 * grandchildren. Writes its own bulk SOFT_DELETE audit entry per child model
 * (`metadata.cascade: true`), separate from the parent's own audit entry, so
 * each cascaded row's trail says *why* it went — not just that it did.
 */
async function cascadeSoftDelete(base: PrismaClient, model: string, parentIds: string[]): Promise<void> {
  const children = CASCADE_MAP[model];
  if (!children || parentIds.length === 0) return;

  for (const { model: childModel, fk } of children) {
    const del = delegateFor(base, childModel);
    const rows: { id: string }[] = await del.findMany({
      where: { [fk]: { in: parentIds }, deletedAt: null },
      select: { id: true },
    });
    if (rows.length === 0) continue;

    const childIds = rows.map((r) => r.id);
    const stamp = { deletedAt: new Date(), deletedById: RequestContext.getActorId() ?? null };
    await del.updateMany({ where: { id: { in: childIds } }, data: stamp });
    await writeAudit(base, {
      action: 'SOFT_DELETE',
      entityType: childModel,
      entityId: '(bulk)',
      changes: { deletedAt: { from: null, to: toJson(stamp.deletedAt) } },
      metadata: {
        cascadedFrom: { model, ids: parentIds },
        count: childIds.length,
        ids: childIds.slice(0, BULK_ID_CAP),
      },
    });

    await cascadeSoftDelete(base, childModel, childIds);
  }
}

export function createDbExtension(base: PrismaClient) {
  return Prisma.defineExtension({
    name: 'soft-delete-audit',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const isSoftDelete = SOFT_DELETE_MODELS.has(model);
          const isAudited = AUDITED_MODELS.has(model);
          const a = (args ?? {}) as AnyArgs;

          // ---- 1. Reads on soft-delete models: hide deleted rows ----------
          if (isSoftDelete && READ_MANY_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), deletedAt: null };
            return query(a);
          }
          if (isSoftDelete && (operation === 'findUnique' || operation === 'findUniqueOrThrow')) {
            // findUnique's where can't carry deletedAt — run it as a filtered
            // findFirst on the base client so deleted rows read as "not found".
            const del = delegateFor(base, model);
            const findArgs = {
              where: { ...(a.where ?? {}), deletedAt: null },
              ...(a.select ? { select: a.select } : {}),
              ...(a.include ? { include: a.include } : {}),
            };
            return operation === 'findUniqueOrThrow'
              ? del.findFirstOrThrow(findArgs)
              : del.findFirst(findArgs);
          }

          // ---- 2. delete/deleteMany on soft-delete models → soft delete ---
          if (isSoftDelete && operation === 'delete') {
            const del = delegateFor(base, model);
            const stamp = { deletedAt: new Date(), deletedById: RequestContext.getActorId() ?? null };
            const updated = await del.update({ where: a.where, data: stamp });
            await writeAudit(base, {
              action: 'SOFT_DELETE',
              entityType: model,
              entityId: updated.id,
              changes: { deletedAt: { from: null, to: toJson(stamp.deletedAt) } },
            });
            await cascadeSoftDelete(base, model, [updated.id]);
            return updated;
          }
          if (isSoftDelete && operation === 'deleteMany') {
            const del = delegateFor(base, model);
            // Ids are needed up front (updateMany doesn't return the rows it
            // touched) so the cascade below knows exactly which parents to
            // walk from.
            const targetRows: { id: string }[] = await del.findMany({
              where: { ...(a.where ?? {}), deletedAt: null },
              select: { id: true },
            });
            const targetIds = targetRows.map((r) => r.id);
            const stamp = { deletedAt: new Date(), deletedById: RequestContext.getActorId() ?? null };
            const result = await del.updateMany({
              where: { id: { in: targetIds } },
              data: stamp,
            });
            // A deleteMany that matched nothing changed nothing, so there is
            // no event to record — writing the row anyway put entries in the
            // log reading "Archived … 0 records", which asserts something
            // happened when it didn't. cascadeSoftDelete already skips empty
            // batches for exactly this reason (`if (rows.length === 0)
            // continue`); this branch was the one place that didn't.
            if (result.count > 0) {
              await writeAudit(base, {
                action: 'SOFT_DELETE',
                entityType: model,
                entityId: '(bulk)',
                changes: { deletedAt: { from: null, to: toJson(stamp.deletedAt) } },
                // The ids, not just how many. Without them a bulk entry can
                // only say "3 stakeholders were archived" and leaves *which
                // three* to be reconstructed from whatever fingerprint the
                // data happens to still carry — which is not something an
                // audit trail should be relying on. They cost nothing here:
                // updateMany needed them anyway.
                metadata: {
                  cascade: true,
                  count: result.count,
                  ids: targetIds.slice(0, BULK_ID_CAP),
                  where: toJson(a.where ?? null),
                },
              });
            }
            await cascadeSoftDelete(base, model, targetIds);
            return result;
          }

          // ---- 3. Other writes on audited models: run, then audit --------
          // Gate on WRITE_OPS so reads (findMany/count/etc.) on audited-but-
          // not-soft-deleted models (Consultant/Role/Permission) pass straight
          // through instead of being logged as bogus UPDATE rows.
          if (isAudited && WRITE_OPS.has(operation)) {
            // Bulk writes: one aggregate entry (no per-row before-image).
            if (operation === 'updateMany' || operation === 'createMany') {
              const result = await query(a);
              const action =
                operation === 'createMany'
                  ? 'CREATE'
                  : 'deletedAt' in (a.data ?? {})
                    ? newDeletedAt(a.data) != null
                      ? 'SOFT_DELETE'
                      : 'RESTORE'
                    : 'UPDATE';
              await writeAudit(base, {
                action,
                entityType: model,
                entityId: '(bulk)',
                changes: toJson(a.data ?? null),
                metadata: {
                  cascade: true,
                  count: (result as { count?: number })?.count,
                  where: toJson(a.where ?? null),
                },
              });
              return result;
            }

            // Single-row writes: capture before-image for a real diff.
            let before: AnyArgs | null = null;
            if ((operation === 'update' || operation === 'delete') && a.where) {
              before = await delegateFor(base, model)
                .findUnique({ where: a.where })
                .catch(() => null);
            }
            const result = (await query(a)) as AnyArgs;
            const action = deriveAction(model, operation, before, a.data);
            const changes =
              operation === 'create'
                ? toJson(result)
                : operation === 'delete'
                  ? toJson(before)
                  : computeChanges(before, a.data);
            await writeAudit(base, {
              action,
              entityType: model,
              entityId: (result?.id ?? before?.id ?? '(unknown)') as string,
              changes,
            });
            return result;
          }

          return query(a);
        },
      },
    },
  });
}

/** Applies the soft-delete + audit extension to a base client. */
export function extendPrismaClient(base: PrismaClient) {
  return base.$extends(createDbExtension(base));
}

/** The extended client type injected across the app (see EXTENDED_PRISMA). */
export type ExtendedPrismaClient = ReturnType<typeof extendPrismaClient>;
