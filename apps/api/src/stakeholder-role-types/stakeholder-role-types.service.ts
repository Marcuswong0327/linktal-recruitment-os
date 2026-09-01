import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { rankedNameSearch } from '../common/ranked-name-search';
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
    // Prefix matches first (see rankedNameSearch) — typing "Tools" should
    // surface "Tools Manufacturing" above a mid-word match on an earlier
    // letter, which plain alphabetical ordering never does.
    return rankedNameSearch(query.q, query.take, (match, take) =>
      this.prisma.stakeholderRoleType.findMany({
        where: { isActive: true, ...match },
        orderBy: { name: 'asc' },
        take,
      }),
    );
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
