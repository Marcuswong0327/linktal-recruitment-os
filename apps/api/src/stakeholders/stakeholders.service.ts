import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { CreateStakeholderDto } from './dto/create-stakeholder.dto';
import { UpdateStakeholderDto } from './dto/update-stakeholder.dto';
import { QueryStakeholdersDto } from './dto/query-stakeholders.dto';

@Injectable()
export class StakeholdersService {
  constructor(@Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  async findAll(query: QueryStakeholdersDto) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.StakeholderWhereInput = {};

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.jobTitle) {
      where.jobTitle = { contains: query.jobTitle, mode: Prisma.QueryMode.insensitive };
    }

    if (query.isDecisionMaker != null) {
      where.isDecisionMaker = query.isDecisionMaker;
    }

    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { mobile: { contains: q, mode: Prisma.QueryMode.insensitive } },
      ];
    }

    const orderBy: Prisma.StakeholderOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: 'desc' };

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [data, total] = await Promise.all([
      this.prisma.stakeholder.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stakeholder.count({ where }),
    ]);

    return { data, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const stakeholder = await this.prisma.stakeholder.findUnique({ where: { id } });
    if (!stakeholder) {
      throw new NotFoundException(`Stakeholder ${id} not found`);
    }
    return stakeholder;
  }

  async findByDisplayId(displayId: string) {
    const stakeholder = await this.prisma.stakeholder.findUnique({ where: { displayId } });
    if (!stakeholder) {
      throw new NotFoundException(`Stakeholder ${displayId} not found`);
    }
    return stakeholder;
  }

  create(dto: CreateStakeholderDto) {
    // displayId is assigned by the DB (Stakeholder_displayId_seq default).
    return this.prisma.stakeholder.create({ data: dto });
  }

  async update(id: string, dto: UpdateStakeholderDto) {
    await this.findOne(id);
    return this.prisma.stakeholder.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.stakeholder.delete({ where: { id } });
  }
}
