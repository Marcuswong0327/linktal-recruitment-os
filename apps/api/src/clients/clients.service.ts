import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { RequestContext } from '../common/request-context';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientStatusFilter, QueryClientsDto } from './dto/query-clients.dto';

@Injectable()
export class ClientsService {
  constructor(
    // Soft-delete + audit aware client for normal reads/writes.
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    // Base (unfiltered) client — needed to see/erase soft-deleted rows (restore/purge).
    private readonly base: PrismaService,
  ) {}

  async findAll(query: QueryClientsDto) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.ClientWhereInput = {};

    if (query.status !== ClientStatusFilter.ALL) {
      where.status = query.status as unknown as Prisma.ClientWhereInput['status'];
    }

    // contains/insensitive text filters
    const contains = (value?: string) =>
      value ? { contains: value, mode: Prisma.QueryMode.insensitive } : undefined;
    where.industry = contains(query.industry);
    where.country = contains(query.country);
    where.city = contains(query.city);

    if (query.consultantId !== undefined) {
      // '' is the frontend's "Unassigned" sentinel — maps to a null FK, not a no-op.
      where.consultantId = query.consultantId === '' ? null : query.consultantId;
    }

    if (query.tobSigned != null) {
      where.tobSigned = query.tobSigned;
    }

    if (q) {
      where.OR = [
        { companyName: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { website: { contains: q, mode: Prisma.QueryMode.insensitive } },
      ];
    }

    const orderBy: Prisma.ClientOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: 'desc' };

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.count({ where }),
    ]);

    return { data, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    return client;
  }

  async findByDisplayId(displayId: string) {
    const client = await this.prisma.client.findUnique({ where: { displayId } });
    if (!client) {
      throw new NotFoundException(`Client ${displayId} not found`);
    }
    return client;
  }

  create(dto: CreateClientDto) {
    // displayId is assigned by the DB (Client_displayId_seq default).
    return this.prisma.client.create({ data: dto });
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  /**
   * Soft-deletes the client and cascades to its stakeholders, job research,
   * job orders, and the submissions/placements under those job orders.
   * Sequential soft-deletes on the extended client (each audited); children
   * first, parent last, so a partial failure stays recoverable via `restore`.
   */
  async remove(id: string) {
    await this.findOne(id);

    const jobOrders = await this.prisma.jobOrder.findMany({
      where: { clientId: id },
      select: { id: true },
    });
    const jobOrderIds = jobOrders.map((j) => j.id);
    if (jobOrderIds.length > 0) {
      const submissions = await this.prisma.candidateSubmission.findMany({
        where: { jobOrderId: { in: jobOrderIds } },
        select: { id: true },
      });
      const submissionIds = submissions.map((s) => s.id);
      if (submissionIds.length > 0) {
        await this.prisma.placement.deleteMany({ where: { submissionId: { in: submissionIds } } });
        await this.prisma.candidateSubmission.deleteMany({
          where: { jobOrderId: { in: jobOrderIds } },
        });
      }
      await this.prisma.jobOrder.deleteMany({ where: { clientId: id } });
    }
    await this.prisma.stakeholder.deleteMany({ where: { clientId: id } });
    await this.prisma.clientJobResearch.deleteMany({ where: { clientId: id } });

    return this.prisma.client.delete({ where: { id } });
  }

  /** Restores a soft-deleted client (audited as RESTORE). Children are not
   * auto-restored — recover them explicitly if needed. */
  async restore(id: string) {
    const existing = await this.base.client.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    if (!existing.deletedAt) {
      throw new BadRequestException(`Client ${id} is not deleted`);
    }
    return this.prisma.client.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
  }

  /**
   * Permanently deletes the client + all its children via the base client
   * (bypasses the soft-delete rewrite; cascades through the FK). Admin-only —
   * for genuine erasure. Writes a HARD_DELETE audit row first.
   */
  async purge(id: string) {
    const existing = await this.base.client.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    await this.base.auditLog.create({
      data: {
        actorId: RequestContext.getActorId() ?? null,
        action: 'HARD_DELETE',
        entityType: 'Client',
        entityId: id,
        metadata: { requestId: RequestContext.getRequestId() },
      },
    });
    return this.base.client.delete({ where: { id } });
  }
}
