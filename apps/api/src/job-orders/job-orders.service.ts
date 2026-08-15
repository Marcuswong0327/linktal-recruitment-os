import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubmissionStatus } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { isScoped, jobOrderScope } from '../common/scope';
import { AuthUser } from '../auth/auth.types';
import { CreateJobOrderDto } from './dto/create-job-order.dto';
import { UpdateJobOrderDto } from './dto/update-job-order.dto';
import { QueryJobOrdersDto } from './dto/query-job-orders.dto';

// Feeds the Job Orders sheet's Submissions/Interviewing/Placed pipeline
// columns (and the dedicated page's pipeline popover). `deletedAt: null` is
// explicit here (not left to the extended client's soft-delete middleware,
// which intercepts top-level CandidateSubmission calls, not this nested
// include) — a removed submission must not reappear in a pipeline cell.
//
// jobTitle (the client's brief) and jobRoleType (the consultant's
// classification) are both catalog relations now, as is location — all three
// resolved to plain strings in `toEntity`, since JobOrderEntity documents them
// that way rather than as the nested objects Prisma would otherwise return.
// Writes take the catalog ids directly: unlike Stakeholder, a job order never
// grows the JobTitle catalog on the way past — new titles go through
// /job-titles first.
const JOB_ORDER_INCLUDE = {
  // companyName/displayId are the client's *label*: a job order response
  // otherwise carried only a raw `clientId`, so nothing downstream could name
  // or link the company a role belongs to. industryId rides along purely for
  // the scope check below (a Job Order has no industry of its own, only via
  // its Client) and is stripped back out in `toEntity`.
  client: { select: { industryId: true, companyName: true, displayId: true } },
  // Who's working this job order — see JobOrderConsultant in schema.prisma.
  // Several consultants can be on the same job order concurrently.
  consultants: { select: { consultantId: true, consultant: { select: { fullName: true } } } },
  jobTitle: { select: { name: true } },
  jobRoleType: { select: { name: true } },
  // `ancestorIds` comes along on the location purely for the single-record
  // scope check, and is stripped back out the same way.
  location: { select: { name: true, level: true, ancestorIds: true } },
  submissions: {
    where: { deletedAt: null },
    select: {
      id: true,
      status: true,
      candidateId: true,
      submittedAt: true,
      candidate: { select: { firstName: true, lastName: true } },
      placement: { select: { baseSalary: true, feeValue: true, startDate: true } },
      interviews: {
        where: { deletedAt: null },
        orderBy: { interviewDate: 'desc' },
        take: 1,
        select: { interviewDate: true },
      },
    },
  },
} satisfies Prisma.JobOrderInclude;

type JobOrderWithRelations = {
  client: { industryId: string; companyName: string; displayId: string } | null;
  consultants: { consultantId: string; consultant: { fullName: string } }[];
  jobTitle: { name: string } | null;
  jobRoleType: { name: string } | null;
  location: { name: string; level: string; ancestorIds: string[] } | null;
  submissions: {
    id: string;
    status: SubmissionStatus;
    candidateId: string;
    submittedAt: Date;
    candidate: { firstName: string | null; lastName: string | null } | null;
    placement: { baseSalary: number | null; feeValue: number | null; startDate: Date | null } | null;
    interviews: { interviewDate: Date }[];
  }[];
};

/** A candidate is stored as first/last name, either of which may be missing. */
function displayName(candidate: { firstName: string | null; lastName: string | null } | null): string {
  const name = [candidate?.firstName, candidate?.lastName].filter(Boolean).join(' ');
  return name || 'Unknown candidate';
}

function toEntity<T extends JobOrderWithRelations>(jobOrder: T) {
  const { submissions, client, consultants, jobTitle, jobRoleType, location, ...rest } = jobOrder;
  return {
    ...rest,
    // `clientId` (on ...rest) is what you PATCH; these two are what you show
    // and link. industryId is intentionally not re-exported — it's a scope
    // input, not part of the job order's public shape.
    clientName: client?.companyName ?? null,
    clientDisplayId: client?.displayId ?? null,
    consultants: consultants.map((c) => ({ id: c.consultantId, name: c.consultant.fullName })),
    jobTitle: jobTitle?.name ?? null,
    jobRoleType: jobRoleType?.name ?? null,
    location: location?.name ?? null,
    locationLevel: location?.level ?? null,
    pipelineSubmissions: submissions.map((s) => ({
      submissionId: s.id,
      candidateId: s.candidateId,
      candidateName: displayName(s.candidate),
      status: s.status,
      submittedAt: s.submittedAt,
      latestInterviewDate: s.interviews[0]?.interviewDate ?? null,
      placementBaseSalary: s.placement?.baseSalary ?? null,
      placementFeeValue: s.placement?.feeValue ?? null,
      placementStartDate: s.placement?.startDate ?? null,
    })),
  };
}

@Injectable()
export class JobOrdersService {
  constructor(@Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  async findAll(query: QueryJobOrdersDto, user: AuthUser) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.JobOrderWhereInput = {};

    if (query.statuses?.length) {
      where.status = { in: query.statuses };
    }

    if (query.qualities?.length) {
      where.quality = { in: query.qualities };
    }

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.jobTitleIds?.length) {
      where.jobTitleId = { in: query.jobTitleIds };
    }

    if (query.jobRoleTypeIds?.length) {
      where.jobRoleTypeId = { in: query.jobRoleTypeIds };
    }

    if (query.consultantIds?.length) {
      // Safe to honour for a consultant too: `jobOrderScope` is AND-ed on
      // below, so filtering *by* another consultant can only narrow what this
      // caller was already allowed to see, never widen it.
      where.consultants = { some: { consultantId: { in: query.consultantIds } } };
    }

    if (query.priorityLevels?.length) {
      where.priorityLevel = { in: query.priorityLevels };
    }

    // Salary overlap: a job's [salaryMin, salaryMax] band intersects the queried bounds.
    if (query.salaryMin != null) {
      where.salaryMax = { gte: query.salaryMin };
    }
    if (query.salaryMax != null) {
      where.salaryMin = { lte: query.salaryMax };
    }

    // Built as an AND-ed list rather than a second top-level `where.OR` —
    // the free-text search below needs its own `OR`, which a plain
    // assignment would otherwise clobber instead of combining with.
    const and: Prisma.JobOrderWhereInput[] = [];

    // Location is a node in the tree now — the old city/suburb columns are
    // gone. Selecting a state matches every job order beneath it, via the
    // denormalized ancestor path.
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
          { description: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }

    if (isScoped(user)) {
      and.push(jobOrderScope(user));
    }

    if (and.length > 0) {
      where.AND = and;
    }

    // Default: Active first. JobOrderStatus is declared ACTIVE/PLACED/CLOSED/
    // ON_HOLD (see schema.prisma), and Postgres native enums sort by
    // declaration order — so `status asc` already puts Active first, same
    // trick used for Client.quality. Received-date is the secondary sort so
    // same-status rows still land in a stable, useful order.
    const orderBy: Prisma.JobOrderOrderByWithRelationInput[] = sortBy
      ? [{ [sortBy]: sortOrder }]
      : [{ status: 'asc' }, { receivedAt: 'desc' }];

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [data, total] = await Promise.all([
      this.prisma.jobOrder.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: JOB_ORDER_INCLUDE,
      }),
      this.prisma.jobOrder.count({ where }),
    ]);

    return {
      data: data.map((jo) => toEntity(jo)),
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  /**
   * Single-record access is unguarded by scope — scope only ever filters
   * `findAll`. `user` is accepted for signature symmetry with the other
   * services but unused here now.
   */
  async findOne(id: string, _user: AuthUser) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { id },
      include: JOB_ORDER_INCLUDE,
    });
    if (!jobOrder) {
      throw new NotFoundException(`Job order ${id} not found`);
    }
    return toEntity(jobOrder);
  }

  async findByDisplayId(displayId: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { displayId },
      include: JOB_ORDER_INCLUDE,
    });
    if (!jobOrder) {
      throw new NotFoundException(`Job order ${displayId} not found`);
    }
    return toEntity(jobOrder);
  }

  async create(dto: CreateJobOrderDto, _user: AuthUser) {
    const { consultantIds, ...rest } = dto;
    // displayId is assigned by the DB (JobOrder_displayId_seq default). A
    // brand-new job order has no submissions yet, but still runs through
    // toEntity so the response shape (pipelineSubmissions: []) matches every
    // other endpoint instead of omitting the field.
    const jobOrder = await this.prisma.jobOrder.create({
      data: {
        ...rest,
        ...(consultantIds && consultantIds.length > 0
          ? { consultants: { create: consultantIds.map((consultantId) => ({ consultantId })) } }
          : {}),
      },
      include: JOB_ORDER_INCLUDE,
    });
    return toEntity(jobOrder);
  }

  async update(id: string, dto: UpdateJobOrderDto, user: AuthUser) {
    await this.findOne(id, user);

    const jobOrder = await this.prisma.jobOrder.update({
      where: { id },
      data: { ...dto },
      include: JOB_ORDER_INCLUDE,
    });

    return toEntity(jobOrder);
  }

  /**
   * Full-set-replace of who's working this job order — mirrors
   * ConsultantsService.setIndustries's diff shape (removals first, then
   * additions, each as its own top-level create/delete call so the audit
   * extension sees and diffs every row, never a nested relation write).
   *
   * Deliberately no scope-mismatch guard: adding a consultant here on purpose
   * is the one way to reach an otherwise out-of-scope Client/Candidate — see
   * the SCOPING note above Consultant in schema.prisma. Several consultants
   * can be on the same job order at once.
   */
  async setConsultants(id: string, consultantIds: string[], actor: AuthUser) {
    const jobOrder = await this.prisma.jobOrder.findUnique({ where: { id }, select: { id: true } });
    if (!jobOrder) {
      throw new NotFoundException(`Job order ${id} not found`);
    }

    const uniqueIds = Array.from(new Set(consultantIds));
    if (uniqueIds.length > 0) {
      const consultants = await this.prisma.consultant.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, isActive: true },
      });
      const found = new Map(consultants.map((c) => [c.id, c.isActive]));
      const missing = uniqueIds.filter((v) => !found.has(v));
      if (missing.length > 0) {
        throw new BadRequestException({
          code: 'INVALID_CONSULTANT',
          message: `Unknown consultant id(s): ${missing.join(', ')}`,
        });
      }
      const inactive = uniqueIds.filter((v) => found.get(v) === false);
      if (inactive.length > 0) {
        throw new BadRequestException({
          code: 'INACTIVE_CONSULTANT',
          message: `Inactive consultant id(s): ${inactive.join(', ')}`,
        });
      }
    }

    const current = await this.prisma.jobOrderConsultant.findMany({
      where: { jobOrderId: id },
      select: { consultantId: true },
    });
    const currentIds = current.map((c) => c.consultantId);
    const currentSet = new Set(currentIds);
    const nextSet = new Set(uniqueIds);
    const toAdd = uniqueIds.filter((v) => !currentSet.has(v));
    const toRemove = currentIds.filter((v) => !nextSet.has(v));

    for (const consultantId of toRemove) {
      await this.prisma.jobOrderConsultant.delete({
        where: { jobOrderId_consultantId: { jobOrderId: id, consultantId } },
      });
    }
    for (const consultantId of toAdd) {
      await this.prisma.jobOrderConsultant.create({ data: { jobOrderId: id, consultantId } });
    }

    return this.findOne(id, actor);
  }

  /**
   * Soft-deletes the job order. Cascading to its submissions and their
   * placements is handled centrally by the Prisma extension's CASCADE_MAP —
   * see prisma.extensions.ts.
   */
  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.jobOrder.delete({ where: { id } });
  }
}
