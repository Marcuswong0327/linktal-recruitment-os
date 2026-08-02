import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecializationDto } from './dto/create-specialization.dto';

@Injectable()
export class SpecializationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active specializations only — inactive ones (a future "hide from picker" toggle) stay out of the list. */
  findAll() {
    return this.prisma.specialization.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
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
