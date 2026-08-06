import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { QuerySpecializationsDto } from './dto/query-specializations.dto';

@Injectable()
export class SpecializationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Active specializations only — inactive ones (a future "hide from
   * picker" toggle) stay out of the list. `q`/`take` are both optional and
   * unset by default — existing callers (the candidate and consultant
   * specialization editors) ask for no params and get the full 775+ row
   * catalog, same as before this DTO existed. A search-driven picker opts
   * into the capped/filtered form explicitly.
   */
  findAll(query: QuerySpecializationsDto = {}) {
    const where: Prisma.SpecializationWhereInput = { isActive: true };
    if (query.q) {
      where.name = { contains: query.q, mode: Prisma.QueryMode.insensitive };
    }
    return this.prisma.specialization.findMany({
      where,
      orderBy: { name: 'asc' },
      take: query.take,
    });
  }

  async findOne(id: string) {
    const specialization = await this.prisma.specialization.findUnique({ where: { id } });
    if (!specialization) {
      throw new NotFoundException(`Specialization ${id} not found`);
    }
    return specialization;
  }

  /**
   * Upsert on (industry, name) — `name` is unique *per industry*, not
   * globally, since the same specialization name can plausibly exist under two
   * industries. Two people typing the same new value at once (or re-adding an
   * existing one) both land on the same row instead of racing the unique
   * constraint.
   *
   * `parentId` is optional: passing one files this under a category ("Food"),
   * omitting it creates a top-level category. `ancestorIds` is maintained by
   * the backfill (scripts/backfill-ancestors.ts) rather than written here.
   */
  create(dto: CreateSpecializationDto) {
    const name = dto.name.trim();
    return this.prisma.specialization.upsert({
      where: { industryId_name: { industryId: dto.industryId, name } },
      create: { name, industryId: dto.industryId, parentId: dto.parentId ?? null },
      update: {},
    });
  }
}
