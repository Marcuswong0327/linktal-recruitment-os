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
  assertInJobScope,
  clearMismatchedClientAssignment,
  industryScope,
} from '../common/industry-scope';
import { redactConsultantField } from '../common/redact-consultant-field';
import { AuthUser } from '../auth/auth.types';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientQualityFilter, ClientStatusFilter, QueryClientsDto } from './dto/query-clients.dto';
import { AddClientNoteDto, ClientNoteDto, UpdateClientNoteDto } from './dto/client-note.dto';

// Industry/specialization are FK relations now, not scalars — every read
// needs this to get the resolved name back, and every write needs it to
// return one (ClientEntity documents them as plain `string | null`, not the
// nested `{id, name, ...}` object Prisma would otherwise hand back).
//
// lastContactType/Notes/By aren't sorted or filtered on (unlike
// lastContactedAt, which is a denormalized column for that reason), so
// they're resolved live instead: each non-deleted stakeholder's own top-1
// contact row (bounded — a client typically has a handful of stakeholders),
// flattened and reduced to the single most recent one in `toEntity`. A
// two-hop "latest across all stakeholders" aggregate isn't expressible as a
// single Prisma relation `orderBy`/`take`, so this fetches the small
// candidate set and picks the max in application code instead of a raw query.
const CLIENT_INCLUDE = {
  industry: { select: { name: true } },
  specialization: { select: { name: true } },
  stakeholders: {
    where: { deletedAt: null },
    select: {
      contactHistory: {
        orderBy: { contactedAt: 'desc' },
        take: 1,
        select: { contactType: true, notes: true, contactedAt: true, contactedBy: { select: { fullName: true } } },
      },
    },
  },
} satisfies Prisma.ClientInclude;

type LatestContactRow = {
  contactType: string;
  notes: string | null;
  contactedAt: Date;
  contactedBy: { fullName: string } | null;
};

type ClientWithRelations = {
  industry: { name: string } | null;
  specialization: { name: string } | null;
  stakeholders: { contactHistory: LatestContactRow[] }[];
};

function latestContact(rows: LatestContactRow[]): LatestContactRow | undefined {
  return rows.reduce<LatestContactRow | undefined>(
    (max, row) => (!max || row.contactedAt > max.contactedAt ? row : max),
    undefined,
  );
}

function toEntity<T extends ClientWithRelations>(client: T) {
  const { industry, specialization, stakeholders, ...rest } = client;
  const latest = latestContact(stakeholders.flatMap((s) => s.contactHistory));
  return {
    ...rest,
    industry: industry?.name ?? null,
    specialization: specialization?.name ?? null,
    lastContactType: latest?.contactType ?? null,
    lastContactNotes: latest?.notes ?? null,
    lastContactedBy: latest?.contactedBy?.fullName ?? null,
  };
}

@Injectable()
export class ClientsService {
  constructor(
    // Soft-delete + audit aware client for normal reads/writes.
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    // Base (unfiltered) client — needed to see/erase soft-deleted rows (restore/purge).
    private readonly base: PrismaService,
  ) {}

  async findAll(query: QueryClientsDto, user: AuthUser) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.ClientWhereInput = {};

    if (query.status !== ClientStatusFilter.ALL) {
      where.status = query.status as unknown as Prisma.ClientWhereInput['status'];
    }

    if (query.quality !== ClientQualityFilter.ALL) {
      where.quality = query.quality as unknown as Prisma.ClientWhereInput['quality'];
    }

    // contains/insensitive text filters
    const contains = (value?: string) =>
      value ? { contains: value, mode: Prisma.QueryMode.insensitive } : undefined;
    const containsName = (value?: string) => {
      const filter = contains(value);
      return filter ? { name: filter } : undefined;
    };
    where.industry = containsName(query.industry);
    where.specialization = containsName(query.specialization);
    where.country = contains(query.country);
    where.city = contains(query.city);

    if (user.roleName === 'consultant') {
      // Consultants only ever see their own book of companies — enforced
      // here, not just hidden in the UI, so a crafted `consultantId` query
      // param can't be used to browse someone else's clients. Overrides
      // whatever the caller passed; there's no "view others" mode for this
      // role.
      where.consultantId = user.consultantId;
    } else if (query.consultantId !== undefined) {
      // '' is the frontend's "Unassigned" sentinel — maps to a null FK, not a no-op.
      where.consultantId = query.consultantId === '' ? null : query.consultantId;
    }

    if (query.tobSigned != null) {
      where.tobSigned = query.tobSigned;
    }

    // Built as an AND-ed list rather than assigning `where.OR` directly —
    // the free-text search below also needs its own `OR`, and a second
    // top-level `where.OR` assignment would silently clobber the first
    // instead of combining with it (see CandidatesService.findAll for the
    // same idiom already established there).
    const and: Prisma.ClientWhereInput[] = [];

    if (q) {
      and.push({
        OR: [
          { companyName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { website: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }

    if (user.roleName === 'consultant') {
      and.push(industryScope(user.industryIds));
    }

    if (and.length > 0) {
      where.AND = and;
    }

    // Default: most-recently-contacted first. lastContactedAt is null for
    // clients with no contact history yet — "nulls: last" keeps those at the
    // bottom regardless of sort direction, rather than Postgres's default
    // (nulls first on desc), which would otherwise put never-contacted
    // clients at the very top.
    const orderBy: Prisma.ClientOrderByWithRelationInput =
      sortBy === 'lastContactedAt' || !sortBy
        ? { lastContactedAt: { sort: sortBy ? sortOrder : 'desc', nulls: 'last' } }
        : { [sortBy]: sortOrder };

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: CLIENT_INCLUDE,
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      data: data.map((c) => redactConsultantField(toEntity(c), user)),
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  /**
   * `user` gates the "not under your job scope" check below (findOne/update/
   * remove are single-record access — a scoped consultant hitting an
   * out-of-scope record directly gets an explicit 403, unlike `findAll`,
   * which just silently filters).
   */
  async findOne(id: string, user: AuthUser) {
    const client = await this.prisma.client.findUnique({ where: { id }, include: CLIENT_INCLUDE });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    assertInJobScope(user, client.industryId);
    return redactConsultantField(toEntity(client), user);
  }

  async findByDisplayId(displayId: string) {
    const client = await this.prisma.client.findUnique({
      where: { displayId },
      include: CLIENT_INCLUDE,
    });
    if (!client) {
      throw new NotFoundException(`Client ${displayId} not found`);
    }
    return toEntity(client);
  }

  async create(dto: CreateClientDto) {
    // Industry-first: a consultant can only be assigned once the company
    // already has an industry tagged, and only if they hold that industry.
    if (dto.consultantId) {
      await assertConsultantIndustryMatch(this.prisma, dto.consultantId, dto.industryId ?? null);
    }
    // displayId is assigned by the DB (Client_displayId_seq default).
    const client = await this.prisma.client.create({ data: dto, include: CLIENT_INCLUDE });
    return toEntity(client);
  }

  async update(id: string, dto: UpdateClientDto, user: AuthUser) {
    // A consultant can reassign a company to another consultant, but can't
    // orphan it — 'consultantId' present and falsy means "clear the FK"
    // (see the null-vs-undefined regression test above), which combined with
    // the consultant-only scoping in `findAll` would otherwise let them drop
    // a company out of their own book entirely, with no one left owning it.
    if (
      user.roleName === 'consultant' &&
      'consultantId' in dto &&
      !dto.consultantId
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Consultants cannot unassign a company from a consultant.',
      });
    }

    const existing = await this.findOne(id, user);

    // Industry-first: only validated when a consultant is explicitly being
    // set/changed here — an industry-only edit never blocks on this (that's
    // what the auto-clear below is for instead of erroring).
    if ('consultantId' in dto && dto.consultantId) {
      const effectiveIndustryId = 'industryId' in dto ? (dto.industryId ?? null) : existing.industryId;
      await assertConsultantIndustryMatch(this.prisma, dto.consultantId, effectiveIndustryId);
    }

    let client = await this.prisma.client.update({ where: { id }, data: dto, include: CLIENT_INCLUDE });

    // Bidirectional auto-clear: the industry changed without an explicit
    // consultant change in the same request — silently unassign if the
    // existing consultant no longer matches, rather than blocking the edit.
    // Re-fetch only if it actually cleared something, so the response
    // reflects it — most industry edits won't touch the consultant at all.
    if ('industryId' in dto && !('consultantId' in dto)) {
      const cleared = await clearMismatchedClientAssignment(this.prisma, id, dto.industryId ?? null);
      if (cleared) {
        client = await this.prisma.client.findUniqueOrThrow({ where: { id }, include: CLIENT_INCLUDE });
      }
    }

    return redactConsultantField(toEntity(client), user);
  }

  private getNotes(client: { notes: unknown }): ClientNoteDto[] {
    return Array.isArray(client.notes) ? (client.notes as unknown as ClientNoteDto[]) : [];
  }

  private async saveNotes(id: string, notes: ClientNoteDto[], user: AuthUser) {
    const client = await this.prisma.client.update({
      where: { id },
      data: { notes: notes as unknown as Prisma.InputJsonValue },
      include: CLIENT_INCLUDE,
    });
    return redactConsultantField(toEntity(client), user);
  }

  /** Only the note's own author, or an admin, may edit/delete it. */
  private assertCanModifyNote(note: ClientNoteDto, user: AuthUser) {
    if (note.by !== user.consultantId && user.roleName !== 'admin') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: "Only the note's author or an admin can modify it.",
      });
    }
  }

  private findNoteOrThrow(notes: ClientNoteDto[], noteId: string) {
    const index = notes.findIndex((n) => n.id === noteId);
    if (index === -1) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }
    return index;
  }

  /** A note's own last-modified marker — its `editedAt`, or `timestamp` if never edited. */
  private noteVersion(note: ClientNoteDto): string {
    return note.editedAt ?? note.timestamp;
  }

  /**
   * Optimistic concurrency check: rejects the request if the note changed
   * since the caller last read it (detected by comparing `noteVersion`), so a
   * second edit/delete can't silently clobber one that landed moments before
   * it. Skipped when the caller doesn't pass `expectedVersion` at all.
   */
  private assertNotStale(note: ClientNoteDto, expectedVersion: string | undefined) {
    if (expectedVersion !== undefined && this.noteVersion(note) !== expectedVersion) {
      throw new ConflictException({
        code: 'NOTE_CONFLICT',
        message: 'This note was changed by someone else. Reload and try again.',
      });
    }
  }

  /** Appends one entry to the client's note timeline (never overwrites prior entries). */
  async addNote(id: string, dto: AddClientNoteDto, user: AuthUser) {
    const client = await this.findOne(id, user);
    const next: ClientNoteDto[] = [
      ...this.getNotes(client),
      {
        id: randomUUID(),
        content: dto.content,
        timestamp: new Date().toISOString(),
        by: user.consultantId,
        editedAt: null,
        editedBy: null,
      },
    ];
    return this.saveNotes(id, next, user);
  }

  /** Edits one note's content in place; restricted to its author or an admin. */
  async updateNote(id: string, noteId: string, dto: UpdateClientNoteDto, user: AuthUser) {
    const client = await this.findOne(id, user);
    const notes = this.getNotes(client);
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
    return this.saveNotes(id, next, user);
  }

  /** Removes one note from the timeline; restricted to its author or an admin. */
  async deleteNote(id: string, noteId: string, user: AuthUser, expectedVersion?: string) {
    const client = await this.findOne(id, user);
    const notes = this.getNotes(client);
    const index = this.findNoteOrThrow(notes, noteId);
    this.assertCanModifyNote(notes[index], user);
    this.assertNotStale(notes[index], expectedVersion);

    const next = notes.filter((n) => n.id !== noteId);
    return this.saveNotes(id, next, user);
  }

  /**
   * Soft-deletes the client and cascades to its stakeholders, job research,
   * job orders, and the submissions/placements under those job orders.
   * Sequential soft-deletes on the extended client (each audited); children
   * first, parent last, so a partial failure stays recoverable via `restore`.
   */
  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);

    const jobOrders = await this.prisma.jobOrder.findMany({
      where: { clientId: id },
      select: { id: true },
    });
    const jobOrderIds = jobOrders.map((j) => j.id);
    if (jobOrderIds.length > 0) {
      const submissions = await this.prisma.candidateSubmission.findMany({
        where: { jobOrderId: { in: jobOrderIds } },
        select: { id: true },
      });
      const submissionIds = submissions.map((s) => s.id);
      if (submissionIds.length > 0) {
        await this.prisma.placement.deleteMany({ where: { submissionId: { in: submissionIds } } });
        await this.prisma.candidateSubmission.deleteMany({
          where: { jobOrderId: { in: jobOrderIds } },
        });
      }
      await this.prisma.jobOrder.deleteMany({ where: { clientId: id } });
    }
    await this.prisma.stakeholder.deleteMany({ where: { clientId: id } });
    await this.prisma.clientJobResearch.deleteMany({ where: { clientId: id } });

    return this.prisma.client.delete({ where: { id } });
  }

  /** Restores a soft-deleted client (audited as RESTORE). Children are not
   * auto-restored — recover them explicitly if needed. */
  async restore(id: string) {
    const existing = await this.base.client.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    if (!existing.deletedAt) {
      throw new BadRequestException(`Client ${id} is not deleted`);
    }
    const client = await this.prisma.client.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
      include: CLIENT_INCLUDE,
    });
    return toEntity(client);
  }

  /**
   * Permanently deletes the client + all its children via the base client
   * (bypasses the soft-delete rewrite; cascades through the FK). Admin-only —
   * for genuine erasure. Writes a HARD_DELETE audit row first.
   */
  async purge(id: string) {
    const existing = await this.base.client.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    await this.base.auditLog.create({
      data: {
        actorId: RequestContext.getActorId() ?? null,
        action: 'HARD_DELETE',
        entityType: 'Client',
        entityId: id,
        metadata: { requestId: RequestContext.getRequestId() },
      },
    });
    return this.base.client.delete({ where: { id } });
  }
}
