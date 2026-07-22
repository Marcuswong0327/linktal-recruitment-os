import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubmissionStatus } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import {
  assertConsultantIndustryMatchForJobOrder,
  assertInJobScope,
  consultantHasIndustry,
  industryScopeViaClient,
} from '../common/industry-scope';
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
const PIPELINE_SUBMISSIONS_INCLUDE = {
  // industryId is fetched alongside the pipeline purely for the job-scope
  // check below (a Job Order has no industry of its own, only via its
  // Client) — stripped back out in `toEntity`, never part of the API response.
  client: { select: { industryId: true } },
  submissions: {
    where: { deletedAt: null },
    select: {
      id: true,
      status: true,
      candidateId: true,
      submittedAt: true,
      candidate: { select: { fullName: true } },
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

type JobOrderWithPipeline = {
  client: { industryId: string | null } | null;
  submissions: {
    id: string;
    status: SubmissionStatus;
    candidateId: string;
    submittedAt: Date;
    candidate: { fullName: string } | null;
    placement: { baseSalary: number | null; feeValue: number | null; startDate: Date | null } | null;
    interviews: { interviewDate: Date }[];
  }[];
};

function toEntity<T extends JobOrderWithPipeline>(jobOrder: T) {
  const { submissions, client: _client, ...rest } = jobOrder;
  return {
    ...rest,
    pipelineSubmissions: submissions.map((s) => ({
      submissionId: s.id,
      candidateId: s.candidateId,
      candidateName: s.candidate?.fullName ?? 'Unknown candidate',
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

    if (user.roleName === 'consultant') {
      // Consultants only ever see their own book of job orders — enforced
      // here, not just hidden in the UI, so a crafted `consultantIds` query
      // param can't be used to browse someone else's. Overrides whatever the
      // caller passed; there's no "view others" mode for this role. Every
      // other role (manager/finance/researcher/admin) sees the full list.
      where.consultantId = user.consultantId;
    } else if (query.consultantIds?.length) {
      where.consultantId = { in: query.consultantIds };
    }

    // contains/insensitive text filters
    const contains = (value?: string) =>
      value ? { contains: value, mode: Prisma.QueryMode.insensitive } : undefined;
    where.city = contains(query.city);
    where.suburb = contains(query.suburb);
    where.department = contains(query.department);

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

    if (q) {
      and.push({
        OR: [
          { jobTitle: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { description: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }

    if (user.roleName === 'consultant') {
      and.push(industryScopeViaClient(user.industryIds));
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
        include: PIPELINE_SUBMISSIONS_INCLUDE,
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
      include: PIPELINE_SUBMISSIONS_INCLUDE,
    });
    if (!jobOrder) {
      throw new NotFoundException(`Job order ${id} not found`);
    }
    assertInJobScope(user, jobOrder.client?.industryId ?? null);
    return redactConsultantField(toEntity(jobOrder), user);
  }

  async findByDisplayId(displayId: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { displayId },
      include: PIPELINE_SUBMISSIONS_INCLUDE,
    });
    if (!jobOrder) {
      throw new NotFoundException(`Job order ${displayId} not found`);
    }
    return toEntity(jobOrder);
  }

  async create(dto: CreateJobOrderDto) {
    // Industry-first: a consultant can only be assigned once the job
    // order's client already has an industry tagged, and only if they hold
    // that industry — resolved via the client since JobOrder has none of
    // its own.
    if (dto.consultantId) {
      await assertConsultantIndustryMatchForJobOrder(this.prisma, dto.consultantId, dto.clientId);
    }
    // displayId is assigned by the DB (JobOrder_displayId_seq default). A
    // brand-new job order has no submissions yet, but still runs through
    // toEntity so the response shape (pipelineSubmissions: []) matches every
    // other endpoint instead of omitting the field.
    const jobOrder = await this.prisma.jobOrder.create({
      data: dto,
      include: PIPELINE_SUBMISSIONS_INCLUDE,
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
      data: dto,
      include: PIPELINE_SUBMISSIONS_INCLUDE,
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
        jobOrder = await this.prisma.jobOrder.findUniqueOrThrow({ where: { id }, include: PIPELINE_SUBMISSIONS_INCLUDE });
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
