import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { RequestContext } from '../common/request-context';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { CandidateStatusFilter, QueryCandidatesDto } from './dto/query-candidates.dto';

@Injectable()
export class CandidatesService {
  constructor(
    // Soft-delete + audit aware client for normal reads/writes.
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    // Base (unfiltered) client — needed to see/erase soft-deleted rows (restore/purge).
    private readonly base: PrismaService,
  ) {}

  async findAll(query: QueryCandidatesDto) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.CandidateWhereInput = {};

    if (query.status !== CandidateStatusFilter.ALL) {
      where.status = query.status as unknown as Prisma.CandidateWhereInput['status'];
    }

    // contains/insensitive text filters
    const contains = (value?: string) =>
      value ? { contains: value, mode: Prisma.QueryMode.insensitive } : undefined;
    where.industry = contains(query.industry);
    where.roleType = contains(query.roleType);
    where.country = contains(query.country);
    where.city = contains(query.city);
    where.currentCompany = contains(query.currentCompany);
    where.currentPosition = contains(query.currentPosition);

    if (query.yearsExperienceMin != null || query.yearsExperienceMax != null) {
      where.yearsExperience = {
        ...(query.yearsExperienceMin != null ? { gte: query.yearsExperienceMin } : {}),
        ...(query.yearsExperienceMax != null ? { lte: query.yearsExperienceMax } : {}),
      };
    }

    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { currentCompany: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
      ];
    }

    const orderBy: Prisma.CandidateOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: 'desc' };

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [data, total] = await Promise.all([
      this.prisma.candidate.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.candidate.count({ where }),
    ]);

    return { data, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { id } });
    if (!candidate) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    return candidate;
  }

  async findByDisplayId(displayId: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { displayId } });
    if (!candidate) {
      throw new NotFoundException(`Candidate ${displayId} not found`);
    }
    return candidate;
  }

  create(dto: CreateCandidateDto) {
    // displayId is assigned by the DB (Candidate_displayId_seq default).
    return this.prisma.candidate.create({ data: this.toPrismaData(dto) });
  }

  async update(id: string, dto: UpdateCandidateDto) {
    await this.findOne(id);
    return this.prisma.candidate.update({ where: { id }, data: this.toPrismaData(dto) });
  }

  /**
   * Soft-deletes the candidate and cascades to its submissions + their
   * placements. Runs as sequential soft-deletes on the extended client (each
   * op is audited); not wrapped in an interactive transaction because the
   * audit extension writes outside it. A partial failure is recoverable via
   * `restore` — children are removed before the parent.
   */
  async remove(id: string) {
    await this.findOne(id);
    const submissions = await this.prisma.candidateSubmission.findMany({
      where: { candidateId: id },
      select: { id: true },
    });
    const submissionIds = submissions.map((s) => s.id);
    if (submissionIds.length > 0) {
      await this.prisma.placement.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await this.prisma.candidateSubmission.deleteMany({ where: { candidateId: id } });
    }
    return this.prisma.candidate.delete({ where: { id } });
  }

  /** Restores a soft-deleted candidate (audited as RESTORE). Does not un-delete
   * its children — the FE recovers those explicitly if needed. */
  async restore(id: string) {
    const existing = await this.base.candidate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    if (!existing.deletedAt) {
      throw new BadRequestException(`Candidate ${id} is not deleted`);
    }
    return this.prisma.candidate.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
  }

  /**
   * Permanently deletes the candidate + its screening/submission/placement
   * history via the base client (bypasses the soft-delete rewrite). Admin-only
   * — for genuine erasure (e.g. a data-removal request). Writes a HARD_DELETE
   * audit row before the row is gone.
   */
  async purge(id: string) {
    const existing = await this.base.candidate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    await this.base.auditLog.create({
      data: {
        actorId: RequestContext.getActorId() ?? null,
        action: 'HARD_DELETE',
        entityType: 'Candidate',
        entityId: id,
        metadata: { requestId: RequestContext.getRequestId() },
      },
    });
    return this.base.candidate.delete({ where: { id } });
  }

  /**
   * Split the JSON columns out of the DTO. Class instances don't structurally
   * satisfy Prisma's `InputJsonValue` (no index signature), so they're cast
   * explicitly while the scalar fields keep their compile-time checks.
   */
  private toPrismaData<T extends CreateCandidateDto | UpdateCandidateDto>(dto: T) {
    const { workHistory, specializations, ...rest } = dto;
    return {
      ...rest,
      ...(workHistory !== undefined
        ? { workHistory: workHistory as unknown as Prisma.InputJsonValue }
        : {}),
      ...(specializations !== undefined
        ? { specializations: specializations as unknown as Prisma.InputJsonValue }
        : {}),
    };
  }
}
