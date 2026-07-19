import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStakeholderRoleTypeDto } from './dto/create-stakeholder-role-type.dto';

@Injectable()
export class StakeholderRoleTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active role types only — inactive ones (a future "hide from picker" toggle) stay out of the list. */
  findAll() {
    return this.prisma.stakeholderRoleType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Upsert on `name` — the stakeholder form's combobox calls this for "Add
   * <name>", and two people typing the same new value at once (or someone
   * re-adding a name that's already there) should both land on one row
   * instead of racing a unique-constraint error.
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
