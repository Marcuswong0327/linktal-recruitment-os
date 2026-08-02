import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStakeholderRoleTypeDto } from './dto/create-stakeholder-role-type.dto';
import { QueryStakeholderRoleTypesDto } from './dto/query-stakeholder-role-types.dto';

@Injectable()
export class StakeholderRoleTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Active rows only — inactive ones (a future "hide from picker" toggle) stay
   * out of the list. Capped and name-filtered because this catalog grows with
   * use: the combobox asks for a page matching what's been typed, not the
   * whole table.
   */
  findAll(query: QueryStakeholderRoleTypesDto) {
    const where: Prisma.StakeholderRoleTypeWhereInput = { isActive: true };
    if (query.q) {
      where.name = { contains: query.q, mode: Prisma.QueryMode.insensitive };
    }
    return this.prisma.stakeholderRoleType.findMany({
      where,
      orderBy: { name: 'asc' },
      take: query.take,
    });
  }

  /**
   * Upsert on `name` — the form's combobox calls this for "Add <name>", and
   * two people typing the same new value at once (or someone re-adding a name
   * that's already there) should both land on one row instead of racing a
   * unique-constraint error. Trimmed so " Manager" and "Manager" don't become
   * two rows.
   */
  create(dto: CreateStakeholderRoleTypeDto) {
    const name = dto.name.trim();
    return this.prisma.stakeholderRoleType.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }
}
