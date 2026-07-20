import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCandidateSavedSearchDto } from './dto/create-candidate-saved-search.dto';

@Injectable()
export class CandidateSavedSearchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Own saved searches only — this is personal state, not a shared catalog. */
  findAllForConsultant(consultantId: string) {
    return this.prisma.candidateSavedSearch.findMany({
      where: { consultantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(consultantId: string, dto: CreateCandidateSavedSearchDto) {
    return this.prisma.candidateSavedSearch.create({
      data: {
        name: dto.name,
        consultantId,
        filters: dto.filters as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * 404s on a missing id and on one owned by someone else alike — a saved
   * search's existence isn't something another consultant should be able to
   * probe for by id.
   */
  async remove(id: string, consultantId: string) {
    const existing = await this.prisma.candidateSavedSearch.findUnique({ where: { id } });
    if (!existing || existing.consultantId !== consultantId) {
      throw new NotFoundException(`Saved search ${id} not found`);
    }
    return this.prisma.candidateSavedSearch.delete({ where: { id } });
  }
}
