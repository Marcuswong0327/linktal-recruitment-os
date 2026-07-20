import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { UpdateInterviewDto } from './dto/update-interview.dto';
import { QueryInterviewsDto } from './dto/query-interviews.dto';

@Injectable()
export class InterviewsService {
  constructor(@Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  findAll(query: QueryInterviewsDto) {
    const where: Prisma.InterviewWhereInput = {};
    if (query.submissionId) where.submissionId = query.submissionId;

    return this.prisma.interview.findMany({ where, orderBy: { interviewDate: 'asc' } });
  }

  async findOne(id: string) {
    const interview = await this.prisma.interview.findUnique({ where: { id } });
    if (!interview) {
      throw new NotFoundException(`Interview ${id} not found`);
    }
    return interview;
  }

  create(dto: CreateInterviewDto) {
    // Prisma's DateTime fields require a full ISO-8601 datetime — a bare
    // "YYYY-MM-DD" (what an <input type="date"> sends) throws
    // "premature end of input" at the DB layer. `new Date(...)` parses either.
    return this.prisma.interview.create({
      data: { ...dto, interviewDate: new Date(dto.interviewDate) },
    });
  }

  async update(id: string, dto: UpdateInterviewDto) {
    await this.findOne(id);
    return this.prisma.interview.update({
      where: { id },
      data: { ...dto, interviewDate: dto.interviewDate ? new Date(dto.interviewDate) : undefined },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.interview.delete({ where: { id } });
  }
}
