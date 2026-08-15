import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from '../common/request-context';
import { isScoped, jobResearchScope } from '../common/scope';
import { AuthUser } from '../auth/auth.types';
import { CreateJobResearchDto } from './dto/create-job-research.dto';
import { UpdateJobResearchDto } from './dto/update-job-research.dto';
import { QueryJobResearchDto } from './dto/query-job-research.dto';

// client/consultant/jobTitle/jobRoleType/location are FK relations — every read
// needs this to get the resolved names back, since JobResearchEntity documents
// them as plain `string | null` rather than the nested objects Prisma would
// otherwise hand back.
//
// The client's `industryId` and the location's `ancestorIds` come along purely
// for the single-record scope check (a research row has no industry of its own,
// only via its Client) and are stripped back out in `toEntity` — never part of
// the API response. `jobOrder` is the conversion back-reference, reduced to a
// bare id.
const JOB_RESEARCH_INCLUDE = {
  client: { select: { companyName: true, industryId: true } },
  consultant: { select: { fullName: true } },
  jobTitle: { select: { name: true } },
  jobRoleType: { select: { name: true } },
  location: { select: { name: true, level: true, ancestorIds: true } },
  jobOrder: { select: { id: true } },
} satisfies Prisma.ClientJobResearchInclude;

type JobResearchWithRelations = {
  client: { companyName: string; industryId: string | null } | null;
  consultant: { fullName: string } | null;
  jobTitle: { name: string } | null;
  jobRoleType: { name: string } | null;
  location: { name: string; level: string; ancestorIds: string[] } | null;
  jobOrder: { id: string } | null;
};

function toEntity<T extends JobResearchWithRelations>(research: T) {
  const { client, consultant, jobTitle, jobRoleType, location, jobOrder, ...rest } = research;
  return {
    ...rest,
    companyName: client?.companyName ?? null,
    consultant: consultant?.fullName ?? null,
    jobTitle: jobTitle?.name ?? null,
    jobRoleType: jobRoleType?.name ?? null,
    location: location?.name ?? null,
    locationLevel: location?.level ?? null,
    jobOrderId: jobOrder?.id ?? null,
  };
}

@Injectable()
export class JobResearchService {
  constructor(
    // Soft-delete + audit aware client for normal reads/writes.
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    // Base (unfiltered) client — needed to see/erase soft-deleted rows (restore/purge).
    private readonly base: PrismaService,
  ) {}

  async findAll(query: QueryJobResearchDto, user: AuthUser) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.ClientJobResearchWhereInput = {};

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.clientIds?.length) {
      where.clientId = { in: query.clientIds };
    }

    // Unlike Client and JobOrder, there is deliberately **no own-book filter**
    // here. Research is market intelligence, not an assignment: a researcher
    // logs the ads and the consultants who cover that patch act on them.
    // Restricting a consultant to rows they personally researched would hide
    // exactly the leads the research step exists to hand them. `consultantId`
    // still counts as the ownership arm inside `jobResearchScope`, so a row
    // someone logged themselves is always theirs — it just isn't the only
    // thing they see.
    if (query.consultantIds?.length) {
      where.consultantId = { in: query.consultantIds };
    }

    if (query.jobTitleIds?.length) {
      where.jobTitleId = { in: query.jobTitleIds };
    }

    if (query.jobRoleTypeIds?.length) {
      where.jobRoleTypeId = { in: query.jobRoleTypeIds };
    }

    if (query.statuses?.length) {
      where.status = { in: query.statuses };
    }

    if (query.isContacted != null) {
      where.isContacted = query.isContacted;
    }

    // The conversion column: has this ad since become a brief? JobOrder holds
    // the FK, so it's an existence test on the back-reference.
    if (query.hasJobOrder != null) {
      where.jobOrder = query.hasJobOrder ? { isNot: null } : { is: null };
    }

    // Built as an AND-ed list rather than assigning `where.OR` directly — the
    // free-text search below needs its own `OR`, which a second top-level
    // assignment would silently clobber instead of combining with.
    const and: Prisma.ClientJobResearchWhereInput[] = [];

    // Location is a node in the tree — selecting a state matches every ad
    // beneath it, via the denormalized ancestor path.
    if (query.locationIds?.length) {
      and.push({ location: { ancestorIds: { hasSome: query.locationIds } } });
    }
    if (query.location) {
      and.push({
        location: { name: { contains: query.location, mode: Prisma.QueryMode.insensitive } },
      });
    }

    if (q) {
      and.push({
        OR: [
          { jobTitle: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
          { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { notes: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { contactEmailFromAd: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }

    if (isScoped(user)) {
      and.push(jobResearchScope(user));
    }

    if (and.length > 0) {
      where.AND = and;
    }

    // postedDate and lastContactedAt are null on plenty of rows (an ad with no
    // visible date, an advertiser never approached) — "nulls: last" keeps those
    // at the bottom regardless of direction, rather than Postgres's default of
    // nulls first on desc.
    const nullableSorts: string[] = ['postedDate', 'lastContactedAt'];
    const orderBy: Prisma.ClientJobResearchOrderByWithRelationInput = !sortBy
      ? { researchedAt: 'desc' }
      : nullableSorts.includes(sortBy)
        ? { [sortBy]: { sort: sortOrder, nulls: 'last' } }
        : { [sortBy]: sortOrder };

    // Parallel, not $transaction: these two reads don't need one consistent DB
    // snapshot, and running them concurrently roughly halves the round trips
    // to Neon.
    const [data, total] = await Promise.all([
      this.prisma.clientJobResearch.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: JOB_RESEARCH_INCLUDE,
      }),
      this.prisma.clientJobResearch.count({ where }),
    ]);

    return { data: data.map(toEntity), total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  /**
   * Single-record access is unguarded by scope — scope only ever filters
   * `findAll`. `user` is accepted for signature symmetry with the other
   * services but unused here now.
   */
  async findOne(id: string, _user: AuthUser) {
    const research = await this.prisma.clientJobResearch.findUnique({
      where: { id },
      include: JOB_RESEARCH_INCLUDE,
    });
    if (!research) {
      throw new NotFoundException(`Job research ${id} not found`);
    }
    return toEntity(research);
  }

  async findByDisplayId(displayId: string) {
    const research = await this.prisma.clientJobResearch.findUnique({
      where: { displayId },
      include: JOB_RESEARCH_INCLUDE,
    });
    if (!research) {
      throw new NotFoundException(`Job research ${displayId} not found`);
    }
    return toEntity(research);
  }

  /**
   * Dates arrive as ISO strings over the wire but the columns are `DateTime` —
   * converted here rather than by a DTO transform, so the DTO keeps validating
   * the string form (`@IsDateString`) and the error message stays readable.
   */
  private toPrismaData<T extends CreateJobResearchDto | UpdateJobResearchDto>(dto: T) {
    const { postedDate, researchedAt, ...rest } = dto;
    return {
      ...rest,
      ...(postedDate !== undefined ? { postedDate: new Date(postedDate) } : {}),
      ...(researchedAt !== undefined ? { researchedAt: new Date(researchedAt) } : {}),
    };
  }

  async create(dto: CreateJobResearchDto) {
    // displayId is assigned by the DB (ClientJobResearch_displayId_seq default),
    // and researchedAt defaults to now() when the caller doesn't set one.
    const research = await this.prisma.clientJobResearch.create({
      data: this.toPrismaData(dto),
      include: JOB_RESEARCH_INCLUDE,
    });
    return toEntity(research);
  }

  async update(id: string, dto: UpdateJobResearchDto, user: AuthUser) {
    await this.findOne(id, user);
    const research = await this.prisma.clientJobResearch.update({
      where: { id },
      data: this.toPrismaData(dto),
      include: JOB_RESEARCH_INCLUDE,
    });
    return toEntity(research);
  }

  /**
   * Records that the advertiser has been approached. `lastContactedById` always
   * comes from the caller's own session, never the request body — an approach
   * can only ever be attributed to whoever is actually logging it.
   *
   * Backdating won't clobber a more recent approach someone else already
   * logged, same rule as StakeholderContactHistory: the flag still flips, but
   * the "when/who" only moves forward.
   */
  async markContacted(id: string, contactedAt: string | undefined, user: AuthUser) {
    const existing = await this.findOne(id, user);
    const when = contactedAt ? new Date(contactedAt) : new Date();
    const isNewer = !existing.lastContactedAt || when > existing.lastContactedAt;

    const research = await this.prisma.clientJobResearch.update({
      where: { id },
      data: {
        isContacted: true,
        ...(isNewer ? { lastContactedAt: when, lastContactedById: user.consultantId } : {}),
      },
      include: JOB_RESEARCH_INCLUDE,
    });
    return toEntity(research);
  }

  /**
   * Soft-deletes the research row (audited). Nothing cascades: a JobOrder that
   * cited this row keeps its own record — the brief outlives the ad it came
   * from, and the link simply goes stale.
   */
  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.clientJobResearch.delete({ where: { id } });
  }

  /** Restores a soft-deleted research row (audited as RESTORE). */
  async restore(id: string) {
    const existing = await this.base.clientJobResearch.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Job research ${id} not found`);
    }
    if (!existing.deletedAt) {
      throw new BadRequestException(`Job research ${id} is not deleted`);
    }
    const research = await this.prisma.clientJobResearch.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
      include: JOB_RESEARCH_INCLUDE,
    });
    return toEntity(research);
  }

  /**
   * Permanently deletes the row via the base client (bypasses the soft-delete
   * rewrite). Admin-only — for genuine erasure. Writes a HARD_DELETE audit row
   * first, since the row itself is about to stop existing.
   */
  async purge(id: string) {
    const existing = await this.base.clientJobResearch.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Job research ${id} not found`);
    }
    await this.base.auditLog.create({
      data: {
        actorId: RequestContext.getActorId() ?? null,
        action: 'HARD_DELETE',
        entityType: 'ClientJobResearch',
        entityId: id,
        metadata: { requestId: RequestContext.getRequestId() },
      },
    });
    return this.base.clientJobResearch.delete({ where: { id } });
  }
}
