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
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientStatusFilter, QueryClientsDto } from './dto/query-clients.dto';
import { AddClientNoteDto, ClientNoteDto, UpdateClientNoteDto } from './dto/client-note.dto';

@Injectable()
export class ClientsService {
  constructor(
    // Soft-delete + audit aware client for normal reads/writes.
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    // Base (unfiltered) client — needed to see/erase soft-deleted rows (restore/purge).
    private readonly base: PrismaService,
  ) {}

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
    where.specialization = contains(query.specialization);
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

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [data, total] = await Promise.all([
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

  /** Distinct, non-null values already in use for a free-text field — backs the "pick existing or add new" combobox on Industry/Specialization instead of a fixed enum (both stay plain text on the record). */
  private async findDistinctTextValues(field: 'industry' | 'specialization'): Promise<string[]> {
    const where: Prisma.ClientWhereInput =
      field === 'industry' ? { industry: { not: null } } : { specialization: { not: null } };
    const rows = await this.prisma.client.findMany({
      where,
      select: { industry: true, specialization: true },
      distinct: [field],
      orderBy: { [field]: 'asc' },
    });
    return rows.map((r) => r[field]).filter((v): v is string => v != null);
  }

  getIndustryOptions() {
    return this.findDistinctTextValues('industry');
  }

  getSpecializationOptions() {
    return this.findDistinctTextValues('specialization');
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

  private getNotes(client: { notes: unknown }): ClientNoteDto[] {
    return Array.isArray(client.notes) ? (client.notes as unknown as ClientNoteDto[]) : [];
  }

  private saveNotes(id: string, notes: ClientNoteDto[]) {
    return this.prisma.client.update({
      where: { id },
      data: { notes: notes as unknown as Prisma.InputJsonValue },
    });
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
  async addNote(id: string, dto: AddClientNoteDto, consultantId: string) {
    const client = await this.findOne(id);
    const next: ClientNoteDto[] = [
      ...this.getNotes(client),
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
  async updateNote(id: string, noteId: string, dto: UpdateClientNoteDto, user: AuthUser) {
    const client = await this.findOne(id);
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
    return this.saveNotes(id, next);
  }

  /** Removes one note from the timeline; restricted to its author or an admin. */
  async deleteNote(id: string, noteId: string, user: AuthUser, expectedVersion?: string) {
    const client = await this.findOne(id);
    const notes = this.getNotes(client);
    const index = this.findNoteOrThrow(notes, noteId);
    this.assertCanModifyNote(notes[index], user);
    this.assertNotStale(notes[index], expectedVersion);

    const next = notes.filter((n) => n.id !== noteId);
    return this.saveNotes(id, next);
  }

  /**
   * Soft-deletes the client and cascades to its stakeholders, job research,
   * job orders, and the submissions/placements under those job orders.
   * Sequential soft-deletes on the extended client (each audited); children
   * first, parent last, so a partial failure stays recoverable via `restore`.
   */
  async remove(id: string) {
    await this.findOne(id);

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
    return this.prisma.client.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
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
