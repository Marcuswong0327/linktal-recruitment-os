import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubmissionStatus } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import {
  assertConsultantIndustryMatchForJobOrder,
  assertInScope,
  consultantHasIndustry,
  isScoped,
  jobOrderScope,
} from '../common/scope';
import { redactConsultantField } from '../common/redact-consultant-field';
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
  // industryId is fetched purely for the scope check below (a Job Order has
  // no industry of its own, only via its Client) — stripped back out in
  // `toEntity`, never part of the API response.
  client: { select: { industryId: true } },
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
  client: { industryId: string } | null;
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
  const { submissions, client: _client, jobTitle, jobRoleType, location, ...rest } = jobOrder;
  return {
    ...rest,
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

    if (isScoped(user)) {
      // Consultants only ever see their own book of job orders — enforced
      // here, not just hidden in the UI, so a crafted `consultantIds` query
      // param can't be used to browse someone else's. Overrides whatever the
      // caller passed; there's no "view others" mode for this role. Every
      // other role (manager/finance/researcher/admin) sees the full list.
      where.consultantId = user.consultantId;
    } else if (query.consultantIds?.length) {
      where.consultantId = { in: query.consultantIds };
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
      data: data.map((jo) => redactConsultantField(toEntity(jo), user)),
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string, user: AuthUser) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { id },
      include: JOB_ORDER_INCLUDE,
    });
    if (!jobOrder) {
      throw new NotFoundException(`Job order ${id} not found`);
    }
    // A Job Order has no industry of its own — it inherits its Client's.
    // `consultantId` short-circuits both arms: an assigned job order is always
    // its owner's to open (see ownedBy in common/scope.ts).
    assertInScope(user, {
      consultantId: jobOrder.consultantId,
      industryId: jobOrder.client?.industryId ?? null,
      locationAncestorIds: jobOrder.location?.ancestorIds ?? [],
    });
    return redactConsultantField(toEntity(jobOrder), user);
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

  async create(dto: CreateJobOrderDto) {
    // Industry-first: a consultant can only be assigned if they hold the
    // industry of this job order's client — resolved via the client, since
    // JobOrder has none of its own.
    if (dto.consultantId) {
      await assertConsultantIndustryMatchForJobOrder(this.prisma, dto.consultantId, dto.clientId);
    }
    // displayId is assigned by the DB (JobOrder_displayId_seq default). A
    // brand-new job order has no submissions yet, but still runs through
    // toEntity so the response shape (pipelineSubmissions: []) matches every
    // other endpoint instead of omitting the field.
    const jobOrder = await this.prisma.jobOrder.create({
      data: { ...dto },
      include: JOB_ORDER_INCLUDE,
    });
    return toEntity(jobOrder);
  }

  async update(id: string, dto: UpdateJobOrderDto, user: AuthUser) {
    const existing = await this.findOne(id, user);

    // Industry-first: only validated when a consultant is explicitly being
    // set/changed here — re-linking to a different client never blocks on
    // this by itself (that's what the auto-clear below is for instead of
    // erroring).
    if ('consultantId' in dto && dto.consultantId) {
      const effectiveClientId = 'clientId' in dto && dto.clientId ? dto.clientId : existing.clientId;
      await assertConsultantIndustryMatchForJobOrder(this.prisma, dto.consultantId, effectiveClientId);
    }

    let jobOrder = await this.prisma.jobOrder.update({
      where: { id },
      data: { ...dto },
      include: JOB_ORDER_INCLUDE,
    });

    // Bidirectional auto-clear: re-linked to a different client without an
    // explicit consultant change in the same request — silently unassign if
    // the existing consultant no longer matches the new client's industry.
    if ('clientId' in dto && dto.clientId && !('consultantId' in dto) && existing.consultantId) {
      const client = await this.prisma.client.findUnique({
        where: { id: dto.clientId },
        select: { industryId: true },
      });
      if (!(await consultantHasIndustry(this.prisma, existing.consultantId, client?.industryId ?? null))) {
        await this.prisma.jobOrder.update({ where: { id }, data: { consultantId: null } });
        jobOrder = await this.prisma.jobOrder.findUniqueOrThrow({ where: { id }, include: JOB_ORDER_INCLUDE });
      }
    }

    return redactConsultantField(toEntity(jobOrder), user);
  }

  /**
   * Soft-deletes the job order and cascades to its submissions + their
   * placements (children first). Sequential soft-deletes on the extended
   * client (each audited); recoverable via a restore if a step fails.
   */
  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    const submissions = await this.prisma.candidateSubmission.findMany({
      where: { jobOrderId: id },
      select: { id: true },
    });
    const submissionIds = submissions.map((s) => s.id);
    if (submissionIds.length > 0) {
      await this.prisma.placement.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await this.prisma.candidateSubmission.deleteMany({ where: { jobOrderId: id } });
    }
    return this.prisma.jobOrder.delete({ where: { id } });
  }
}
