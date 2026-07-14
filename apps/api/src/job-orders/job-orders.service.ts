import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { CreateJobOrderDto } from './dto/create-job-order.dto';
import { UpdateJobOrderDto } from './dto/update-job-order.dto';
import { JobOrderStatusFilter, QueryJobOrdersDto } from './dto/query-job-orders.dto';

@Injectable()
export class JobOrdersService {
  constructor(@Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  async findAll(query: QueryJobOrdersDto) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.JobOrderWhereInput = {};

    if (query.status !== JobOrderStatusFilter.ALL) {
      where.status = query.status as unknown as Prisma.JobOrderWhereInput['status'];
    }

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.consultantId) {
      where.consultantId = query.consultantId;
    }

    // contains/insensitive text filters
    const contains = (value?: string) =>
      value ? { contains: value, mode: Prisma.QueryMode.insensitive } : undefined;
    where.jobType = contains(query.jobType);
    where.location = contains(query.location);
    where.department = contains(query.department);

    if (query.priorityLevel != null) {
      where.priorityLevel = query.priorityLevel;
    }

    // Salary overlap: a job's [salaryMin, salaryMax] band intersects the queried bounds.
    if (query.salaryMin != null) {
      where.salaryMax = { gte: query.salaryMin };
    }
    if (query.salaryMax != null) {
      where.salaryMin = { lte: query.salaryMax };
    }

    if (q) {
      where.OR = [
        { jobTitle: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { description: { contains: q, mode: Prisma.QueryMode.insensitive } },
      ];
    }

    const orderBy: Prisma.JobOrderOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: 'desc' };

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [data, total] = await Promise.all([
      this.prisma.jobOrder.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.jobOrder.count({ where }),
    ]);

    return { data, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({ where: { id } });
    if (!jobOrder) {
      throw new NotFoundException(`Job order ${id} not found`);
    }
    return jobOrder;
  }

  async findByDisplayId(displayId: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({ where: { displayId } });
    if (!jobOrder) {
      throw new NotFoundException(`Job order ${displayId} not found`);
    }
    return jobOrder;
  }

  create(dto: CreateJobOrderDto) {
    // displayId is assigned by the DB (JobOrder_displayId_seq default).
    return this.prisma.jobOrder.create({ data: dto });
  }

  async update(id: string, dto: UpdateJobOrderDto) {
    await this.findOne(id);
    return this.prisma.jobOrder.update({ where: { id }, data: dto });
  }

  /**
   * Soft-deletes the job order and cascades to its submissions + their
   * placements (children first). Sequential soft-deletes on the extended
   * client (each audited); recoverable via a restore if a step fails.
   */
  async remove(id: string) {
    await this.findOne(id);
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
