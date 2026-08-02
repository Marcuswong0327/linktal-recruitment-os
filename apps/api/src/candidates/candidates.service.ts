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
import {
  assertConsultantIndustryMatch,
  assertInScope,
  candidateScope,
  clearMismatchedCandidateAssignment,
  isScoped,
} from '../common/scope';
import { AuthUser } from '../auth/auth.types';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { QueryCandidatesDto } from './dto/query-candidates.dto';
import { CreateCandidateContactHistoryDto } from './dto/create-candidate-contact-history.dto';
import { AddCandidateNoteDto, CandidateNoteDto, UpdateCandidateNoteDto } from './dto/candidate-note.dto';

// lastContactedAt is a plain scalar column (see schema.prisma) — denormalized
// for sorting, same reasoning as Client/Stakeholder.lastContactedAt. The rest
// of the "latest contact" detail isn't sorted or filtered on, so it's resolved
// live from the top-1 contact history row — display-only, cheap per row.
//
// industry/jobRoleType/location are FK relations, flattened back onto the
// entity as plain strings in `toEntity` so the API shape stays flat.
// `ancestorIds` comes along on the location purely for the single-record scope
// check, and is stripped back out — never part of the response.
const CANDIDATE_INCLUDE = {
  contactHistory: {
    orderBy: { contactedAt: 'desc' },
    take: 1,
    select: {
      contactType: true,
      category: true,
      conversationSummary: true,
      outreachCampaignNotes: true,
      contactedBy: { select: { fullName: true } },
    },
  },
  industry: { select: { name: true } },
  jobRoleType: { select: { name: true } },
  location: { select: { name: true, level: true, ancestorIds: true } },
  // specializationId (the join row's own scalar) is kept alongside the resolved
  // name — the name is display-only, the id is what an editable multi-select
  // needs to preselect and diff against.
  specializations: { select: { specializationId: true, specialization: { select: { name: true } } } },
} satisfies Prisma.CandidateInclude;

type CandidateWithRelations = {
  contactHistory: {
    contactType: string | null;
    category: string | null;
    conversationSummary: string | null;
    outreachCampaignNotes: string | null;
    contactedBy: { fullName: string } | null;
  }[];
  industry: { name: string } | null;
  jobRoleType: { name: string } | null;
  location: { name: string; level: string; ancestorIds: string[] } | null;
  specializations: { specializationId: string; specialization: { name: string } }[];
};

function toEntity<T extends CandidateWithRelations>(candidate: T) {
  const { contactHistory, industry, jobRoleType, location, specializations, ...rest } = candidate;
  const latest = contactHistory[0];
  return {
    ...rest,
    industry: industry?.name ?? null,
    jobRoleType: jobRoleType?.name ?? null,
    location: location?.name ?? null,
    locationLevel: location?.level ?? null,
    specializations: specializations.map((s) => s.specialization.name),
    specializationIds: specializations.map((s) => s.specializationId),
    lastContactType: latest?.contactType ?? null,
    lastContactCategory: latest?.category ?? null,
    // The old single `notes` column is gone — screening and outreach notes are
    // separate fields now, distinguished by `category`.
    lastContactNotes: latest?.conversationSummary ?? latest?.outreachCampaignNotes ?? null,
    lastContactedBy: latest?.contactedBy?.fullName ?? null,
  };
}

/** contains/insensitive text filter — undefined when the value is empty, so it's omitted from `where` rather than matching everything. */
function contains(value?: string) {
  return value ? { contains: value, mode: Prisma.QueryMode.insensitive } : undefined;
}

@Injectable()
export class CandidatesService {
  constructor(
    // Soft-delete + audit aware client for normal reads/writes.
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    // Base (unfiltered) client — needed to see/erase soft-deleted rows (restore/purge).
    private readonly base: PrismaService,
  ) {}

  async findAll(query: QueryCandidatesDto, user: AuthUser) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    // Built as an AND-ed list of independent conditions rather than
    // assigning fields onto one `where` object, since a condition here needs
    // its own `OR` (the free-text q) — top-level `where.OR` assignments would
    // just clobber each other.
    const and: Prisma.CandidateWhereInput[] = [];

    if (query.statuses?.length) and.push({ status: { in: query.statuses } });
    if (query.industryIds?.length) and.push({ industryId: { in: query.industryIds } });
    if (query.jobRoleTypeIds?.length) and.push({ jobRoleTypeId: { in: query.jobRoleTypeIds } });
    if (query.specializationIds?.length) {
      and.push({ specializations: { some: { specializationId: { in: query.specializationIds } } } });
    }
    if (query.consultantIds?.length) and.push({ consultantId: { in: query.consultantIds } });
    if (isScoped(user)) and.push(candidateScope(user));
    if (query.submissionStatuses?.length) {
      and.push({ submissions: { some: { status: { in: query.submissionStatuses } } } });
    }
    if (query.placementStatuses?.length) {
      and.push({ submissions: { some: { placement: { status: { in: query.placementStatuses } } } } });
    }
    // Location is a node in the tree now: selecting a country matches every
    // candidate beneath it, via the denormalized ancestor path.
    if (query.locationIds?.length) {
      and.push({ location: { ancestorIds: { hasSome: query.locationIds } } });
    }
    if (query.location) {
      and.push({
        location: { name: { contains: query.location, mode: Prisma.QueryMode.insensitive } },
      });
    }
    const companyFilter = contains(query.currentCompany);
    if (companyFilter) and.push({ currentCompany: companyFilter });
    const roleFilter = contains(query.currentRole);
    if (roleFilter) and.push({ currentRole: roleFilter });

    if (query.lastContactedFrom || query.lastContactedTo) {
      and.push({
        lastContactedAt: {
          ...(query.lastContactedFrom ? { gte: new Date(query.lastContactedFrom) } : {}),
          ...(query.lastContactedTo ? { lte: new Date(query.lastContactedTo) } : {}),
        },
      });
    }

    // Quick search: scalar columns (backed by the trigram indexes added in
    // 20260719021500_candidate_search_trigram_indexes) plus the resolved names
    // of location, industry and job role type via relation. Specializations
    // are deliberately left out — substring matching inside a joined
    // many-to-many isn't worth the complexity for free-text search; they're
    // filter-only (specializationIds).
    if (q) {
      and.push({
        OR: [
          { firstName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { lastName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { currentCompany: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { currentRole: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { location: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
          { mobile: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { industry: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
          { jobRoleType: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
        ],
      });
    }

    const where: Prisma.CandidateWhereInput = and.length > 0 ? { AND: and } : {};

    // status sorts by Postgres's native enum ordinal (COLD < WARM < PLACED <
    // UNS, per the declaration order in schema.prisma) — no CASE expression
    // needed, `ORDER BY "status"` already gives the temperature order.
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

  async findOne(id: string, user: AuthUser) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: CANDIDATE_INCLUDE,
    });
    if (!candidate) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    // `consultantId` short-circuits the arms below — an assigned candidate is
    // always their owner's to open (see ownedBy in common/scope.ts).
    assertInScope(user, {
      consultantId: candidate.consultantId,
      industryId: candidate.industryId,
      locationAncestorIds: candidate.location?.ancestorIds ?? [],
    });
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
    // Industry-first: a consultant can only be assigned once the candidate
    // already has an industry tagged, and only if they hold that industry.
    if (dto.consultantId) {
      await assertConsultantIndustryMatch(this.prisma, dto.consultantId, dto.industryId ?? null);
    }
    // displayId is assigned by the DB (Candidate_displayId_seq default).
    const candidate = await this.prisma.candidate.create({
      data: {
        ...this.toPrismaData(dto),
        ...(dto.specializationIds !== undefined
          ? { specializations: { create: dto.specializationIds.map((specializationId) => ({ specializationId })) } }
          : {}),
      },
      include: CANDIDATE_INCLUDE,
    });
    return toEntity(candidate);
  }

  async update(id: string, dto: UpdateCandidateDto, user: AuthUser) {
    const existing = await this.findOne(id, user);

    // Industry-first: only validated when a consultant is explicitly being
    // set/changed here — an industry-only edit never blocks on this (that's
    // what the auto-clear below is for instead of erroring).
    if ('consultantId' in dto && dto.consultantId) {
      const effectiveIndustryId = 'industryId' in dto ? (dto.industryId ?? null) : existing.industryId;
      await assertConsultantIndustryMatch(this.prisma, dto.consultantId, effectiveIndustryId);
    }

    let candidate = await this.prisma.candidate.update({
      where: { id },
      data: {
        ...this.toPrismaData(dto),
        // Specializations is a to-many join, not a scalar column — a full
        // list replace (clear then recreate) is simplest and correct here;
        // a candidate's specialization list is short, so there's no need for
        // a diffing update.
        ...(dto.specializationIds !== undefined
          ? {
              specializations: {
                deleteMany: {},
                create: dto.specializationIds.map((specializationId) => ({ specializationId })),
              },
            }
          : {}),
      },
      include: CANDIDATE_INCLUDE,
    });

    // Bidirectional auto-clear: the industry changed without an explicit
    // consultant change in the same request — silently unassign if the
    // existing consultant no longer matches, rather than blocking the edit.
    if ('industryId' in dto && !('consultantId' in dto)) {
      const cleared = await clearMismatchedCandidateAssignment(this.prisma, id, dto.industryId ?? null);
      if (cleared) {
        candidate = await this.prisma.candidate.findUniqueOrThrow({ where: { id }, include: CANDIDATE_INCLUDE });
      }
    }

    return toEntity(candidate);
  }

  /**
   * Soft-deletes the candidate and cascades to its submissions + their
   * placements. Runs as sequential soft-deletes on the extended client (each
   * op is audited); not wrapped in an interactive transaction because the
   * audit extension writes outside it. A partial failure is recoverable via
   * `restore` — children are removed before the parent.
   */
  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
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
        category: dto.category,
        conversationSummary: dto.conversationSummary,
        outreachCampaignNotes: dto.outreachCampaignNotes,
        status: dto.status,
        suburb: dto.suburb,
        currentSalary: dto.currentSalary,
        expectedSalary: dto.expectedSalary,
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
  async addNote(id: string, dto: AddCandidateNoteDto, user: AuthUser) {
    const candidate = await this.findOne(id, user);
    const next: CandidateNoteDto[] = [
      ...this.getNotes(candidate),
      {
        id: randomUUID(),
        content: dto.content,
        timestamp: new Date().toISOString(),
        by: user.consultantId,
        editedAt: null,
        editedBy: null,
      },
    ];
    return this.saveNotes(id, next);
  }

  /** Edits one note's content in place; restricted to its author or an admin. */
  async updateNote(id: string, noteId: string, dto: UpdateCandidateNoteDto, user: AuthUser) {
    const candidate = await this.findOne(id, user);
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
    const candidate = await this.findOne(id, user);
    const notes = this.getNotes(candidate);
    const index = this.findNoteOrThrow(notes, noteId);
    this.assertCanModifyNote(notes[index], user);
    this.assertNotStale(notes[index], expectedVersion);

    const next = notes.filter((n) => n.id !== noteId);
    return this.saveNotes(id, next);
  }

  /**
   * Split the JSON columns and the specializationIds relation out of the DTO.
   * Class instances don't structurally satisfy Prisma's `InputJsonValue` (no
   * index signature), so JSON fields are cast explicitly while the scalar
   * fields keep their compile-time checks. `specializationIds` is a nested
   * relation write, not a column — callers (create/update) build that part
   * of the payload themselves from `dto.specializationIds` directly.
   */
  private toPrismaData<T extends CreateCandidateDto | UpdateCandidateDto>(dto: T) {
    const { workHistory, specializationIds: _specializationIds, ...rest } = dto;
    return {
      ...rest,
      ...(workHistory !== undefined
        ? { workHistory: workHistory as unknown as Prisma.InputJsonValue }
        : {}),
    };
  }
}
