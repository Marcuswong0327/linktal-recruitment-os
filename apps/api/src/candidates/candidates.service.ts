import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { CandidateStatusFilter, QueryCandidatesDto } from './dto/query-candidates.dto';

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

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

    const [data, total] = await this.prisma.$transaction([
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
    return this.prisma.candidate.create({ data: this.toPrismaData(dto) });
  }

  async update(id: string, dto: UpdateCandidateDto) {
    await this.findOne(id);
    return this.prisma.candidate.update({ where: { id }, data: this.toPrismaData(dto) });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.candidate.delete({ where: { id } });
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
