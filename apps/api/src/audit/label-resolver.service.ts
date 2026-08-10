import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LABEL_SPEC } from './audit-schema.map';

/** model name -> the set of ids of that model that need a label. */
export type LabelRequest = Map<string, Set<string>>;

export interface ResolvedLabel {
  label: string;
  /** True when the target row is soft-deleted — "Sarah Chen (deleted)" reads differently from "Sarah Chen" in an audit trail. Only meaningful for soft-deletable targets. */
  deleted: boolean;
}

/** `${model}:${id}` -> resolved label. Never contains an entry for an id that couldn't be found (hard-purged, or an unrecognized model) — callers treat a miss as "show the raw id". */
export type LabelMap = ReadonlyMap<string, ResolvedLabel>;

type LabelDelegate = {
  findMany: (args: {
    where: { id: { in: string[] } };
    select: Record<string, boolean>;
  }) => Promise<Array<Record<string, unknown>>>;
};

// A page maxes at 100 rows (QueryAuditLogsDto's pageSize cap) — a
// CREATE-heavy page could in principle carry hundreds of ids for one
// target model. Cap the IN list rather than issue a pathological query;
// the excess just falls back to showing its raw id, same as a miss.
const MAX_IDS_PER_MODEL = 500;

/**
 * Resolves ids to human labels in bulk — one query per distinct *target
 * model* across everything requested, all in parallel. Used for both the
 * row's own entityType/entityId (what AuditService's old inline ENTITY_LABEL
 * loop did, sequentially) and every foreign-key-shaped value found inside a
 * diff (new). Shared across both because a page of Candidate edits often
 * needs the same Consultant/Industry rows for both purposes at once.
 */
@Injectable()
export class LabelResolverService {
  // The base (unextended) client, deliberately — the soft-delete extension
  // rewrites reads to filter `deletedAt: null`, which would make a
  // soft-deleted target silently unresolvable (indistinguishable from a
  // hard-purged one). An audit trail must still be able to say "Sarah Chen
  // (deleted)" about a candidate that was legitimately archived.
  constructor(private readonly prisma: PrismaService) {}

  async resolve(request: LabelRequest): Promise<LabelMap> {
    const entries = [...request].filter(([model, ids]) => LABEL_SPEC[model] && ids.size > 0);
    const results = await Promise.all(entries.map(([model, ids]) => this.resolveModel(model, [...ids])));
    const map = new Map<string, ResolvedLabel>();
    for (const rows of results) {
      for (const [key, value] of rows) map.set(key, value);
    }
    return map;
  }

  private async resolveModel(model: string, ids: string[]): Promise<(readonly [string, ResolvedLabel])[]> {
    const spec = LABEL_SPEC[model];
    const capped = ids.slice(0, MAX_IDS_PER_MODEL);
    const select: Record<string, boolean> = { id: true };
    for (const field of spec.fields) select[field] = true;
    if (spec.softDeletable) select.deletedAt = true;

    const delegateKey = model.charAt(0).toLowerCase() + model.slice(1);
    const delegate = (this.prisma as unknown as Record<string, LabelDelegate>)[delegateKey];

    // Never throws — a resolution failure (unexpected delegate shape, a
    // transient DB error) degrades to "these ids stay unresolved", not a
    // broken activity log page.
    const rows = await delegate.findMany({ where: { id: { in: capped } }, select }).catch(() => []);

    return rows.map((row) => {
      const label =
        spec.fields
          .map((f) => row[f])
          .filter((v) => v != null && v !== '')
          .join(' · ') || String(row.id);
      const deleted = spec.softDeletable ? row.deletedAt != null : false;
      return [`${model}:${row.id as string}`, { label, deleted }] as const;
    });
  }
}
