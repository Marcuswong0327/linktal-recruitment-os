import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.candidate.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { id } });
    if (!candidate) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    return candidate;
  }

  create(dto: CreateCandidateDto) {
    return this.prisma.candidate.create({ data: dto });
  }

  async update(id: string, dto: UpdateCandidateDto) {
    await this.findOne(id);
    return this.prisma.candidate.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.candidate.delete({ where: { id } });
  }
}
