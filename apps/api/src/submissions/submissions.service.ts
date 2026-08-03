import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { QuerySubmissionsDto } from './dto/query-submissions.dto';

// Candidate names are firstName/lastName now, and a job order's title is a
// JobTitle relation rather than a scalar — both are flattened back to plain
// strings in `toEntity` so the API shape is unchanged.
const SUBMISSION_INCLUDE = {
  candidate: { select: { firstName: true, lastName: true } },
  jobOrder: { select: { displayId: true, jobTitle: { select: { name: true } } } },
} satisfies Prisma.CandidateSubmissionInclude;

type SubmissionWithRelations = {
  candidate: { firstName: string | null; lastName: string | null } | null;
  jobOrder: { displayId: string; jobTitle: { name: string } | null } | null;
};

/** Joins the name parts, tolerating a candidate with only one (or neither) on file. */
function fullName(person: { firstName: string | null; lastName: string | null } | null): string | null {
  if (!person) return null;
  const joined = [person.firstName, person.lastName].filter(Boolean).join(' ');
  return joined || null;
}

function toEntity<T extends SubmissionWithRelations>(submission: T) {
  const { candidate, jobOrder, ...rest } = submission;
  return {
    ...rest,
    candidateName: fullName(candidate),
    // Falls back to the job order's displayId when it has no title tagged —
    // jobTitleId is optional now, and an empty pipeline cell reads as a bug.
    jobOrderTitle: jobOrder?.jobTitle?.name ?? jobOrder?.displayId ?? null,
  };
}

@Injectable()
export class SubmissionsService {
  constructor(
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    // Base (unfiltered) client — needed to see a soft-deleted row so
    // re-submitting the same candidate to the same job order can restore it
    // instead of colliding with the (non-partial) unique constraint.
    private readonly base: PrismaService,
  ) {}

  async findAll(query: QuerySubmissionsDto) {
    const where: Prisma.CandidateSubmissionWhereInput = {};
    if (query.candidateId) where.candidateId = query.candidateId;
    if (query.jobOrderId) where.jobOrderId = query.jobOrderId;

    const submissions = await this.prisma.candidateSubmission.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      include: SUBMISSION_INCLUDE,
    });
    return submissions.map(toEntity);
  }

  async findOne(id: string) {
    const submission = await this.prisma.candidateSubmission.findUnique({
      where: { id },
      include: SUBMISSION_INCLUDE,
    });
    if (!submission) {
      throw new NotFoundException(`Submission ${id} not found`);
    }
    return toEntity(submission);
  }

  /**
   * (candidateId, jobOrderId) is a unique pair, but not a *partial* unique
   * index — a soft-deleted row still occupies it (see schema.prisma's note
   * on CandidateSubmission). So re-submitting the same candidate to the same
   * job order after a removal restores the dead row (fresh status, cleared
   * deletedAt) instead of colliding with the constraint.
   *
   * Industry guard: a candidate's own industry tag must match the job
   * order's client's industry (a Job Order has none of its own). Blocks the
   * mismatch at the source — the pairing that would otherwise let a scoped
   * consultant's candidate silently end up on a job order outside their
   * industry — rather than allowing it and special-casing visibility around
   * it later. Applies to every role, not just scoped consultants: this is a
   * data-integrity rule about whether the pairing makes sense, not access
   * control.
   */
  async create(dto: CreateSubmissionDto) {
    const [candidate, jobOrder] = await Promise.all([
      this.prisma.candidate.findUnique({ where: { id: dto.candidateId }, select: { industryId: true } }),
      this.prisma.jobOrder.findUnique({
        where: { id: dto.jobOrderId },
        select: { client: { select: { industryId: true } } },
      }),
    ]);
    if (!candidate) {
      throw new NotFoundException(`Candidate ${dto.candidateId} not found`);
    }
    if (!jobOrder) {
      throw new NotFoundException(`Job order ${dto.jobOrderId} not found`);
    }
    // industryId is required on Client and Candidate now, so this is a plain
    // equality check — there's no untagged case left to guard against.
    if (candidate.industryId !== jobOrder.client.industryId) {
      throw new BadRequestException({
        code: 'SUBMISSION_INDUSTRY_MISMATCH',
        message: "This candidate's industry does not match this job order.",
      });
    }

    const existing = await this.base.candidateSubmission.findUnique({
      where: { candidateId_jobOrderId: { candidateId: dto.candidateId, jobOrderId: dto.jobOrderId } },
    });

    if (existing && !existing.deletedAt) {
      throw new ConflictException({
        code: 'ALREADY_SUBMITTED',
        message: 'This candidate is already submitted to this job order.',
      });
    }

    const submission = existing
      ? await this.prisma.candidateSubmission.update({
          where: { id: existing.id },
          data: {
            status: dto.status ?? 'SUBMITTED',
            notes: dto.notes,
            submittedAt: new Date(),
            deletedAt: null,
            deletedById: null,
          },
          include: SUBMISSION_INCLUDE,
        })
      : await this.prisma.candidateSubmission.create({
          data: {
            candidateId: dto.candidateId,
            jobOrderId: dto.jobOrderId,
            status: dto.status,
            notes: dto.notes,
          },
          include: SUBMISSION_INCLUDE,
        });

    return toEntity(submission);
  }

  async update(id: string, dto: UpdateSubmissionDto) {
    await this.findOne(id);
    const submission = await this.prisma.candidateSubmission.update({
      where: { id },
      data: dto,
      include: SUBMISSION_INCLUDE,
    });
    return toEntity(submission);
  }

  /** Soft-deletes the submission — "removed from job order" in the pipeline timeline. */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.candidateSubmission.delete({ where: { id } });
  }
}
