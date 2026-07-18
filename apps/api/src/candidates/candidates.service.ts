import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { RequestContext } from '../common/request-context';
import { AuthUser } from '../auth/auth.types';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { CandidateStatusFilter, QueryCandidatesDto } from './dto/query-candidates.dto';
import { CreateCandidateContactHistoryDto } from './dto/create-candidate-contact-history.dto';
import { AddCandidateNoteDto, CandidateNoteDto, UpdateCandidateNoteDto } from './dto/candidate-note.dto';

// lastContactedAt is a plain scalar column (see schema.prisma) — denormalized
// for sorting, same reasoning as Client/Stakeholder.lastContactedAt. The rest
// of the "latest contact" detail (type/notes/who) isn't sorted or filtered
// on, so it's resolved live via the top-1 contact history row instead of
// also being denormalized — display-only, cheap per row.
const CANDIDATE_INCLUDE = {
  contactHistory: {
    orderBy: { contactedAt: 'desc' },
    take: 1,
    select: { contactType: true, notes: true, contactedBy: { select: { fullName: true } } },
  },
} satisfies Prisma.CandidateInclude;

type CandidateWithRelations = {
  contactHistory: { contactType: string; notes: string | null; contactedBy: { fullName: string } | null }[];
};

function toEntity<T extends CandidateWithRelations>(candidate: T) {
  const { contactHistory, ...rest } = candidate;
  const latest = contactHistory[0];
  return {
    ...rest,
    lastContactType: latest?.contactType ?? null,
    lastContactNotes: latest?.notes ?? null,
    lastContactedBy: latest?.contactedBy?.fullName ?? null,
  };
}

@Injectable()
export class CandidatesService {
  constructor(
    // Soft-delete + audit aware client for normal reads/writes.
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    // Base (unfiltered) client — needed to see/erase soft-deleted rows (restore/purge).
    private readonly base: PrismaService,
  ) {}

  async findAll(query: QueryCandidatesDto) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.CandidateWhereInput = {};

    if (query.status !== CandidateStatusFilter.ALL) {
      where.status = query.status as unknown as Prisma.CandidateWhereInput['status'];
    }

    // contains/insensitive text filters
    const contains = (value?: string) =>
      value ? { contains: value, mode: Prisma.QueryMode.insensitive } : undefined;
    where.industry = contains(query.industry);
    where.roleType = contains(query.roleType);
    where.country = contains(query.country);
    where.city = contains(query.city);
    where.currentCompany = contains(query.currentCompany);
    where.currentPosition = contains(query.currentPosition);

    if (query.yearsExperienceMin != null || query.yearsExperienceMax != null) {
      where.yearsExperience = {
        ...(query.yearsExperienceMin != null ? { gte: query.yearsExperienceMin } : {}),
        ...(query.yearsExperienceMax != null ? { lte: query.yearsExperienceMax } : {}),
      };
    }

    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { currentCompany: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
      ];
    }

    const orderBy: Prisma.CandidateOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: 'desc' };

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [data, total] = await Promise.all([
      this.prisma.candidate.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: CANDIDATE_INCLUDE,
      }),
      this.prisma.candidate.count({ where }),
    ]);

    return { data: data.map(toEntity), total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: CANDIDATE_INCLUDE,
    });
    if (!candidate) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    return toEntity(candidate);
  }

  async findByDisplayId(displayId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { displayId },
      include: CANDIDATE_INCLUDE,
    });
    if (!candidate) {
      throw new NotFoundException(`Candidate ${displayId} not found`);
    }
    return toEntity(candidate);
  }

  async create(dto: CreateCandidateDto) {
    // displayId is assigned by the DB (Candidate_displayId_seq default).
    const candidate = await this.prisma.candidate.create({
      data: this.toPrismaData(dto),
      include: CANDIDATE_INCLUDE,
    });
    return toEntity(candidate);
  }

  async update(id: string, dto: UpdateCandidateDto) {
    await this.findOne(id);
    const candidate = await this.prisma.candidate.update({
      where: { id },
      data: this.toPrismaData(dto),
      include: CANDIDATE_INCLUDE,
    });
    return toEntity(candidate);
  }

  /**
   * Soft-deletes the candidate and cascades to its submissions + their
   * placements. Runs as sequential soft-deletes on the extended client (each
   * op is audited); not wrapped in an interactive transaction because the
   * audit extension writes outside it. A partial failure is recoverable via
   * `restore` — children are removed before the parent.
   */
  async remove(id: string) {
    await this.findOne(id);
    const submissions = await this.prisma.candidateSubmission.findMany({
      where: { candidateId: id },
      select: { id: true },
    });
    const submissionIds = submissions.map((s) => s.id);
    if (submissionIds.length > 0) {
      await this.prisma.placement.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await this.prisma.candidateSubmission.deleteMany({ where: { candidateId: id } });
    }
    return this.prisma.candidate.delete({ where: { id } });
  }

  /** Restores a soft-deleted candidate (audited as RESTORE). Does not un-delete
   * its children — the FE recovers those explicitly if needed. */
  async restore(id: string) {
    const existing = await this.base.candidate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    if (!existing.deletedAt) {
      throw new BadRequestException(`Candidate ${id} is not deleted`);
    }
    const candidate = await this.prisma.candidate.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
      include: CANDIDATE_INCLUDE,
    });
    return toEntity(candidate);
  }

  /**
   * Permanently deletes the candidate + its screening/submission/placement
   * history via the base client (bypasses the soft-delete rewrite). Admin-only
   * — for genuine erasure (e.g. a data-removal request). Writes a HARD_DELETE
   * audit row before the row is gone.
   */
  async purge(id: string) {
    const existing = await this.base.candidate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    await this.base.auditLog.create({
      data: {
        actorId: RequestContext.getActorId() ?? null,
        action: 'HARD_DELETE',
        entityType: 'Candidate',
        entityId: id,
        metadata: { requestId: RequestContext.getRequestId() },
      },
    });
    return this.base.candidate.delete({ where: { id } });
  }

  /**
   * Logs a contact and bumps the denormalized lastContactedAt — but only if
   * this contact is newer than what's already stored (a backdated log entry
   * shouldn't clobber a more recent one). contactedById always comes from
   * the caller's own session (never the request body) — a contact can only
   * ever be attributed to whoever is actually submitting it.
   */
  async addContactHistory(id: string, dto: CreateCandidateContactHistoryDto, consultantId: string) {
    const candidate = await this.base.candidate.findUnique({
      where: { id },
      select: { lastContactedAt: true },
    });
    if (!candidate) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    const contactedAt = dto.contactedAt ? new Date(dto.contactedAt) : new Date();

    const created = await this.prisma.candidateContactHistory.create({
      data: {
        candidateId: id,
        contactType: dto.contactType,
        notes: dto.notes,
        contactedAt,
        contactedById: consultantId,
      },
    });

    if (!candidate.lastContactedAt || contactedAt > candidate.lastContactedAt) {
      await this.prisma.candidate.update({ where: { id }, data: { lastContactedAt: contactedAt } });
    }

    return created;
  }

  private getNotes(candidate: { notes: unknown }): CandidateNoteDto[] {
    return Array.isArray(candidate.notes) ? (candidate.notes as unknown as CandidateNoteDto[]) : [];
  }

  private async saveNotes(id: string, notes: CandidateNoteDto[]) {
    const candidate = await this.prisma.candidate.update({
      where: { id },
      data: { notes: notes as unknown as Prisma.InputJsonValue },
      include: CANDIDATE_INCLUDE,
    });
    return toEntity(candidate);
  }

  /** Only the note's own author, or an admin, may edit/delete it. */
  private assertCanModifyNote(note: CandidateNoteDto, user: AuthUser) {
    if (note.by !== user.consultantId && user.roleName !== 'admin') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: "Only the note's author or an admin can modify it.",
      });
    }
  }

  private findNoteOrThrow(notes: CandidateNoteDto[], noteId: string) {
    const index = notes.findIndex((n) => n.id === noteId);
    if (index === -1) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }
    return index;
  }

  /** A note's own last-modified marker — its `editedAt`, or `timestamp` if never edited. */
  private noteVersion(note: CandidateNoteDto): string {
    return note.editedAt ?? note.timestamp;
  }

  /**
   * Optimistic concurrency check: rejects the request if the note changed
   * since the caller last read it (detected by comparing `noteVersion`), so a
   * second edit/delete can't silently clobber one that landed moments before
   * it. Skipped when the caller doesn't pass `expectedVersion` at all.
   */
  private assertNotStale(note: CandidateNoteDto, expectedVersion: string | undefined) {
    if (expectedVersion !== undefined && this.noteVersion(note) !== expectedVersion) {
      throw new ConflictException({
        code: 'NOTE_CONFLICT',
        message: 'This note was changed by someone else. Reload and try again.',
      });
    }
  }

  /** Appends one entry to the candidate's note timeline (never overwrites prior entries). */
  async addNote(id: string, dto: AddCandidateNoteDto, consultantId: string) {
    const candidate = await this.findOne(id);
    const next: CandidateNoteDto[] = [
      ...this.getNotes(candidate),
      {
        id: randomUUID(),
        content: dto.content,
        timestamp: new Date().toISOString(),
        by: consultantId,
        editedAt: null,
        editedBy: null,
      },
    ];
    return this.saveNotes(id, next);
  }

  /** Edits one note's content in place; restricted to its author or an admin. */
  async updateNote(id: string, noteId: string, dto: UpdateCandidateNoteDto, user: AuthUser) {
    const candidate = await this.findOne(id);
    const notes = this.getNotes(candidate);
    const index = this.findNoteOrThrow(notes, noteId);
    this.assertCanModifyNote(notes[index], user);
    this.assertNotStale(notes[index], dto.expectedVersion);

    const next = [...notes];
    next[index] = {
      ...next[index],
      content: dto.content,
      editedAt: new Date().toISOString(),
      editedBy: user.consultantId,
    };
    return this.saveNotes(id, next);
  }

  /** Removes one note from the timeline; restricted to its author or an admin. */
  async deleteNote(id: string, noteId: string, user: AuthUser, expectedVersion?: string) {
    const candidate = await this.findOne(id);
    const notes = this.getNotes(candidate);
    const index = this.findNoteOrThrow(notes, noteId);
    this.assertCanModifyNote(notes[index], user);
    this.assertNotStale(notes[index], expectedVersion);

    const next = notes.filter((n) => n.id !== noteId);
    return this.saveNotes(id, next);
  }

  /**
   * Split the JSON columns out of the DTO. Class instances don't structurally
   * satisfy Prisma's `InputJsonValue` (no index signature), so they're cast
   * explicitly while the scalar fields keep their compile-time checks.
   */
  private toPrismaData<T extends CreateCandidateDto | UpdateCandidateDto>(dto: T) {
    const { workHistory, specializations, ...rest } = dto;
    return {
      ...rest,
      ...(workHistory !== undefined
        ? { workHistory: workHistory as unknown as Prisma.InputJsonValue }
        : {}),
      ...(specializations !== undefined
        ? { specializations: specializations as unknown as Prisma.InputJsonValue }
        : {}),
    };
  }
}
