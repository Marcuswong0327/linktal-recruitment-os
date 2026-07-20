import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { CreatePlacementDto } from './dto/create-placement.dto';
import { UpdatePlacementDto } from './dto/update-placement.dto';
import { QueryPlacementsDto } from './dto/query-placements.dto';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Fee Calculation (CLAUDE.md's confirmed decisions):
 *   Base Salary * (1 + Super%) = Total Package
 *   Total Package * Fee% = Placement Fee            (feeType PERCENTAGE)
 *   ... or a directly-entered flat amount            (feeType FLAT)
 */
// Money math in plain floating point drifts (e.g. 100000 * 1.10 = 110000.00000000001) —
// round to the cent so stored/returned amounts are exact.
const toCents = (value: number) => Math.round(value * 100) / 100;

function calcFee(input: {
  baseSalary?: number;
  superPercentage: number;
  feeType: 'PERCENTAGE' | 'FLAT';
  feePercentage?: number;
  feeValue?: number;
}) {
  const totalPackage =
    input.baseSalary != null ? toCents(input.baseSalary * (1 + input.superPercentage / 100)) : null;
  const feeValue =
    input.feeType === 'PERCENTAGE' && totalPackage != null && input.feePercentage != null
      ? toCents(totalPackage * (input.feePercentage / 100))
      : (input.feeValue ?? null);
  return { totalPackage, feeValue };
}

@Injectable()
export class PlacementsService {
  constructor(@Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  findAll(query: QueryPlacementsDto) {
    const where: Prisma.PlacementWhereInput = {};
    if (query.submissionId) where.submissionId = query.submissionId;
    if (query.jobOrderId) where.submission = { jobOrderId: query.jobOrderId };

    return this.prisma.placement.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const placement = await this.prisma.placement.findUnique({ where: { id } });
    if (!placement) {
      throw new NotFoundException(`Placement ${id} not found`);
    }
    return placement;
  }

  /**
   * Creates the Placement, then applies the auto-updates CLAUDE.md documents
   * as tied to "Placement created": the candidate is marked Placed, the job
   * order's filled count goes up (and the job order itself flips to Placed
   * once every opening is filled), and — if this is the client's first ever
   * placement — the client flips to Traded. Steps run sequentially (not in a
   * DB transaction, matching this codebase's existing cascade pattern in
   * JobOrdersService.remove) so a failure partway leaves the already-applied
   * steps in place rather than silently rolling back real business records.
   */
  async create(dto: CreatePlacementDto) {
    const submission = await this.prisma.candidateSubmission.findUnique({
      where: { id: dto.submissionId },
      include: { jobOrder: { include: { client: true } } },
    });
    if (!submission) {
      throw new NotFoundException(`Submission ${dto.submissionId} not found`);
    }

    const existing = await this.prisma.placement.findUnique({ where: { submissionId: dto.submissionId } });
    if (existing) {
      throw new ConflictException({
        code: 'ALREADY_PLACED',
        message: 'This submission already has a placement.',
      });
    }

    const superPercentage = dto.superPercentage ?? 12;
    const feeType = dto.feeType ?? 'PERCENTAGE';
    const { totalPackage, feeValue } = calcFee({
      baseSalary: dto.baseSalary,
      superPercentage,
      feeType,
      feePercentage: dto.feePercentage,
      feeValue: dto.feeValue,
    });
    const guaranteeEndDate = dto.startDate
      ? new Date(new Date(dto.startDate).getTime() + submission.jobOrder.client.guaranteePeriod * MS_PER_DAY)
      : null;

    const placement = await this.prisma.placement.create({
      data: {
        submissionId: dto.submissionId,
        baseSalary: dto.baseSalary,
        superPercentage,
        totalPackage,
        feeType,
        feePercentage: dto.feePercentage,
        feeValue,
        // Same fix as InterviewsService.create: Prisma's DateTime fields need
        // a full ISO-8601 datetime, not the bare "YYYY-MM-DD" an
        // <input type="date"> sends.
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        guaranteeEndDate,
        accountsNotified: dto.accountsNotified ?? false,
        notes: dto.notes,
      },
    });

    await this.prisma.candidateSubmission.update({
      where: { id: dto.submissionId },
      data: { status: 'PLACED' },
    });

    await this.prisma.candidate.update({
      where: { id: submission.candidateId },
      data: { status: 'PLACED' },
    });

    const jobOrder = submission.jobOrder;
    const filledCount = jobOrder.filledCount + 1;
    await this.prisma.jobOrder.update({
      where: { id: jobOrder.id },
      data: {
        filledCount,
        status: filledCount >= jobOrder.openings ? 'PLACED' : undefined,
      },
    });

    const priorPlacementForClient = await this.prisma.placement.findFirst({
      where: {
        id: { not: placement.id },
        submission: { jobOrder: { clientId: jobOrder.clientId } },
      },
    });
    if (!priorPlacementForClient) {
      await this.prisma.client.update({
        where: { id: jobOrder.clientId },
        data: { status: 'TRADED' },
      });
    }

    return placement;
  }

  async update(id: string, dto: UpdatePlacementDto) {
    const current = await this.findOne(id);

    const superPercentage = dto.superPercentage ?? current.superPercentage;
    const feeType = dto.feeType ?? current.feeType;
    const baseSalary = dto.baseSalary ?? current.baseSalary ?? undefined;
    const feePercentage = dto.feePercentage ?? current.feePercentage ?? undefined;
    const { totalPackage, feeValue } = calcFee({
      baseSalary,
      superPercentage,
      feeType,
      feePercentage,
      feeValue: dto.feeValue ?? current.feeValue ?? undefined,
    });

    let guaranteeEndDate = current.guaranteeEndDate;
    if (dto.startDate) {
      const submission = await this.prisma.candidateSubmission.findUnique({
        where: { id: current.submissionId },
        include: { jobOrder: { include: { client: true } } },
      });
      guaranteeEndDate = new Date(
        new Date(dto.startDate).getTime() + (submission?.jobOrder.client.guaranteePeriod ?? 90) * MS_PER_DAY,
      );
    }

    return this.prisma.placement.update({
      where: { id },
      data: {
        baseSalary: dto.baseSalary,
        superPercentage: dto.superPercentage,
        totalPackage,
        feeType: dto.feeType,
        feePercentage: dto.feePercentage,
        feeValue,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        guaranteeEndDate,
        accountsNotified: dto.accountsNotified,
        status: dto.status,
        notes: dto.notes,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.placement.delete({ where: { id } });
  }
}
