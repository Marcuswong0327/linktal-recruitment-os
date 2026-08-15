import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from '../common/request-context';
import { isScoped, tobScope } from '../common/scope';
import { AuthUser } from '../auth/auth.types';
import { CreateTobDto } from './dto/create-tob.dto';
import { UpdateTobDto } from './dto/update-tob.dto';
import { QueryTobsDto } from './dto/query-tobs.dto';

// A TOB has no scope fields of its own — no industry, no location, no
// consultant. `companyName` and the representative's name are resolved to
// plain strings here, since TobEntity documents them as `string | null`
// rather than the nested objects Prisma would otherwise return.
const TOB_INCLUDE = {
  client: { select: { companyName: true } },
  linktalRepresentative: { select: { fullName: true } },
} satisfies Prisma.TobInclude;

type TobWithRelations = {
  client: { companyName: string } | null;
  linktalRepresentative: { fullName: string } | null;
};

function toEntity<T extends TobWithRelations>(tob: T) {
  const { client, linktalRepresentative, ...rest } = tob;
  return {
    ...rest,
    companyName: client?.companyName ?? null,
    linktalRepresentative: linktalRepresentative?.fullName ?? null,
  };
}

@Injectable()
export class TobsService {
  constructor(
    // Soft-delete + audit aware client for normal reads/writes.
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    // Base (unfiltered) client — needed to see/erase soft-deleted rows (restore/purge).
    private readonly base: PrismaService,
  ) {}

  async findAll(query: QueryTobsDto, user: AuthUser) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.TobWhereInput = {};

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.clientIds && query.clientIds.length > 0) {
      where.clientId = { in: query.clientIds };
    }

    if (query.linktalRepresentativeId) {
      where.linktalRepresentativeId = query.linktalRepresentativeId;
    }

    // Built as an AND-ed list rather than assigning `where.OR` directly — the
    // free-text search below needs its own `OR`, which a second top-level
    // assignment would silently clobber instead of combining with (same idiom
    // as ClientsService.findAll).
    const and: Prisma.TobWhereInput[] = [];

    if (q) {
      and.push({
        OR: [
          { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { fileName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { clientTobRepresentative: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { invoiceContactName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { invoiceContactEmail: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }

    if (isScoped(user)) {
      and.push(tobScope(user));
    }

    if (and.length > 0) {
      where.AND = and;
    }

    // guaranteePeriod is null on most historical rows — "nulls: last" keeps
    // those at the bottom regardless of sort direction, rather than Postgres's
    // default (nulls first on desc), which would put the rows carrying no term
    // at the very top of a "longest guarantee" sort.
    const orderBy: Prisma.TobOrderByWithRelationInput =
      sortBy === 'guaranteePeriod'
        ? { guaranteePeriod: { sort: sortOrder, nulls: 'last' } }
        : sortBy
          ? { [sortBy]: sortOrder }
          : { createdAt: 'desc' };

    // Parallel, not $transaction: these two reads don't need one consistent DB
    // snapshot, and running them concurrently roughly halves the round trips
    // to Neon.
    const [data, total] = await Promise.all([
      this.prisma.tob.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: TOB_INCLUDE,
      }),
      this.prisma.tob.count({ where }),
    ]);

    return { data: data.map(toEntity), total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  /**
   * Single-record access is unguarded by scope — scope only ever filters
   * `findAll`. `user` is accepted for signature symmetry with the other
   * services but unused here now.
   */
  async findOne(id: string, _user: AuthUser) {
    const tob = await this.prisma.tob.findUnique({ where: { id }, include: TOB_INCLUDE });
    if (!tob) {
      throw new NotFoundException(`Tob ${id} not found`);
    }
    return toEntity(tob);
  }

  async findByDisplayId(displayId: string) {
    const tob = await this.prisma.tob.findUnique({ where: { displayId }, include: TOB_INCLUDE });
    if (!tob) {
      throw new NotFoundException(`Tob ${displayId} not found`);
    }
    return toEntity(tob);
  }

  async create(dto: CreateTobDto, _user: AuthUser) {
    // displayId is assigned by the DB (Tob_displayId_seq default).
    const tob = await this.prisma.tob.create({ data: dto, include: TOB_INCLUDE });
    return toEntity(tob);
  }

  async update(id: string, dto: UpdateTobDto, user: AuthUser) {
    await this.findOne(id, user);
    // Re-parenting (dto.clientId) is allowed unguarded — a TOB filed against
    // the wrong company gets moved, it isn't deleted and retyped.
    const tob = await this.prisma.tob.update({ where: { id }, data: dto, include: TOB_INCLUDE });
    return toEntity(tob);
  }

  /**
   * Soft-deletes the TOB (audited). Nothing cascades — a TOB is a leaf; the
   * commercial terms on an existing Placement were copied at placement time
   * and don't reference it.
   */
  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.tob.delete({ where: { id } });
  }

  /** Restores a soft-deleted TOB (audited as RESTORE). */
  async restore(id: string) {
    const existing = await this.base.tob.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Tob ${id} not found`);
    }
    if (!existing.deletedAt) {
      throw new BadRequestException(`Tob ${id} is not deleted`);
    }
    const tob = await this.prisma.tob.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
      include: TOB_INCLUDE,
    });
    return toEntity(tob);
  }

  /**
   * Permanently deletes the TOB via the base client (bypasses the soft-delete
   * rewrite). Admin-only — for genuine erasure. Writes a HARD_DELETE audit row
   * first, since the row itself is about to stop existing.
   */
  async purge(id: string) {
    const existing = await this.base.tob.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Tob ${id} not found`);
    }
    await this.base.auditLog.create({
      data: {
        actorId: RequestContext.getActorId() ?? null,
        action: 'HARD_DELETE',
        entityType: 'Tob',
        entityId: id,
        metadata: { requestId: RequestContext.getRequestId() },
      },
    });
    return this.base.tob.delete({ where: { id } });
  }
}
