import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIndustryDto } from './dto/create-industry.dto';
import { UpdateIndustryDto } from './dto/update-industry.dto';

@Injectable()
export class IndustriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active industries only — inactive ones (the "hide from picker" toggle — see `deactivate`) stay out of the list. */
  findAll() {
    return this.prisma.industry.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Upsert on `name` — the company form's combobox calls this for "Add
   * <name>", and two people typing the same new value at once (or someone
   * re-adding a name that's already there) should both land on one row
   * instead of racing a unique-constraint error. Reactivates on conflict too,
   * so re-adding a name that was previously deactivated brings it back
   * instead of leaving it hidden from `findAll` forever.
   */
  create(dto: CreateIndustryDto) {
    const name = dto.name.trim();
    return this.prisma.industry.upsert({
      where: { name },
      create: { name },
      update: { isActive: true },
    });
  }

  /** Renames — `id` not found surfaces as Prisma P2025, normalized to 404 by the global filter. */
  update(id: string, dto: UpdateIndustryDto) {
    return this.prisma.industry.update({
      where: { id },
      data: { name: dto.name?.trim() },
    });
  }

  /**
   * No hard delete: `industryId` is required on Client/Candidate and read by
   * the scope resolver via ConsultantIndustry grants, so removing the row
   * would either fail on the FK or strand references. This flips `isActive`
   * instead, which only hides it from `findAll`'s picker — existing
   * references are untouched. Re-adding the same name via `create` undoes it.
   */
  deactivate(id: string) {
    return this.prisma.industry.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
