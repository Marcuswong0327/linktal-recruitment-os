import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { QuerySpecializationsDto } from './dto/query-specializations.dto';
import { UpdateSpecializationDto } from './dto/update-specialization.dto';

@Injectable()
export class SpecializationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Active specializations only — inactive ones (the "hide from picker"
   * toggle — see `deactivate`) stay out of the list. `q`/`take` are both
   * optional and unset by default — existing callers (the candidate and
   * consultant specialization editors) ask for no params and get the full
   * 775+ row catalog, same as before this DTO existed. A search-driven
   * picker opts into the capped/filtered form explicitly.
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
   * constraint. Reactivates on conflict too, so re-adding a name that was
   * previously deactivated brings it back instead of leaving it hidden from
   * `findAll` forever.
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
      update: { isActive: true },
    });
  }

  /**
   * Renames only — `industryId`/`parentId` aren't editable here (see
   * UpdateSpecializationDto). `id` not found surfaces as Prisma P2025,
   * normalized to 404 by the global filter.
   */
  update(id: string, dto: UpdateSpecializationDto) {
    return this.prisma.specialization.update({
      where: { id },
      data: { name: dto.name?.trim() },
    });
  }

  /**
   * No hard delete: referenced by Client/Candidate/ConsultantSpecialization
   * grants and by its own children's `parentId`/`ancestorIds`, so removing
   * the row would fail on the FK or strand references. This flips `isActive`
   * instead, which only hides it from `findAll`'s picker — existing
   * references, including any child specializations, are untouched. Re-adding
   * the same name via `create` undoes it.
   */
  deactivate(id: string) {
    return this.prisma.specialization.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
