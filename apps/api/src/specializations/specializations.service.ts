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
   * Upsert on `name` — the company form's combobox calls this for "Add
   * <name>", and two people typing the same new value at once (or someone
   * re-adding a name that's already there) should both land on one row
   * instead of racing a unique-constraint error.
   */
  create(dto: CreateSpecializationDto) {
    const name = dto.name.trim();
    return this.prisma.specialization.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }
}
