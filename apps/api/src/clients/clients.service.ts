import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientStatusFilter, QueryClientsDto } from './dto/query-clients.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryClientsDto) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.ClientWhereInput = {};

    if (query.status !== ClientStatusFilter.ALL) {
      where.status = query.status as unknown as Prisma.ClientWhereInput['status'];
    }

    // contains/insensitive text filters
    const contains = (value?: string) =>
      value ? { contains: value, mode: Prisma.QueryMode.insensitive } : undefined;
    where.industry = contains(query.industry);
    where.country = contains(query.country);
    where.city = contains(query.city);

    if (query.consultantId !== undefined) {
      // '' is the frontend's "Unassigned" sentinel — maps to a null FK, not a no-op.
      where.consultantId = query.consultantId === '' ? null : query.consultantId;
    }

    if (query.tobSigned != null) {
      where.tobSigned = query.tobSigned;
    }

    if (q) {
      where.OR = [
        { companyName: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { website: { contains: q, mode: Prisma.QueryMode.insensitive } },
      ];
    }

    const orderBy: Prisma.ClientOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: 'desc' };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.count({ where }),
    ]);

    return { data, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    return client;
  }

  async findByDisplayId(displayId: string) {
    const client = await this.prisma.client.findUnique({ where: { displayId } });
    if (!client) {
      throw new NotFoundException(`Client ${displayId} not found`);
    }
    return client;
  }

  create(dto: CreateClientDto) {
    // displayId is assigned by the DB (Client_displayId_seq default).
    return this.prisma.client.create({ data: dto });
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.client.delete({ where: { id } });
  }
}
