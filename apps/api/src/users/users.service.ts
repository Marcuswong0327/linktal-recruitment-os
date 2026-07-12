import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';

const withRoleAndOpenJobOrderCount = {
  role: true,
  _count: { select: { jobOrders: { where: { status: 'ACTIVE' as const } } } },
} satisfies Prisma.ConsultantInclude;

type ConsultantRow = Prisma.ConsultantGetPayload<{ include: typeof withRoleAndOpenJobOrderCount }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryUsersDto) {
    const { page, pageSize, sortBy, sortOrder, q, isActive, role } = query;

    const where: Prisma.ConsultantWhereInput = {};
    if (isActive !== undefined) where.isActive = isActive;
    if (role) where.role = { name: role };
    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
      ];
    }

    const orderBy: Prisma.ConsultantOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder }
      : { fullName: 'asc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.consultant.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: withRoleAndOpenJobOrderCount,
      }),
      this.prisma.consultant.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toEntity(row)),
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  async update(id: string, dto: UpdateUserDto, currentConsultantId: string): Promise<UserEntity> {
    const existing = await this.prisma.consultant.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`User ${id} not found`);
    }

    // Prevent a lockout: nobody can deactivate or demote their own account
    // through this endpoint — someone else with user:update has to do it.
    if (id === currentConsultantId) {
      if (dto.isActive === false) {
        throw new BadRequestException({
          code: 'CANNOT_MODIFY_SELF',
          message: 'You cannot deactivate your own account.',
        });
      }
      if (dto.roleName && dto.roleName !== 'admin') {
        throw new BadRequestException({
          code: 'CANNOT_MODIFY_SELF',
          message: 'You cannot change your own role away from admin.',
        });
      }
    }

    const data: Prisma.ConsultantUpdateInput = {};
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.roleName) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.roleName } });
      if (!role) {
        throw new BadRequestException({ code: 'INVALID_ROLE', message: `Unknown role "${dto.roleName}"` });
      }
      data.role = { connect: { id: role.id } };
    }

    const updated = await this.prisma.consultant.update({
      where: { id },
      data,
      include: withRoleAndOpenJobOrderCount,
    });
    return this.toEntity(updated);
  }

  private toEntity(row: ConsultantRow): UserEntity {
    return {
      id: row.id,
      displayId: row.displayId,
      fullName: row.fullName,
      email: row.email,
      roleName: row.role?.name ?? null,
      isActive: row.isActive,
      openJobOrders: row._count.jobOrders,
      createdAt: row.createdAt,
    };
  }
}
