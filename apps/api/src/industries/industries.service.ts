import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIndustryDto } from './dto/create-industry.dto';

@Injectable()
export class IndustriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active industries only — inactive ones (a future "hide from picker" toggle) stay out of the list. */
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
   * instead of racing a unique-constraint error.
   */
  create(dto: CreateIndustryDto) {
    const name = dto.name.trim();
    return this.prisma.industry.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }
}
