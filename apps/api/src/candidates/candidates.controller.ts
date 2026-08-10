import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CandidatesService } from './candidates.service';
import { AuditService } from '../audit/audit.service';
import { PipelineTimelineEventEntity } from '../audit/entities/pipeline-timeline-event.entity';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { QueryCandidatesDto } from './dto/query-candidates.dto';
import { CreateCandidateContactHistoryDto } from './dto/create-candidate-contact-history.dto';
import { QueryCandidateFacetsDto } from './dto/query-candidate-facets.dto';
import {
  AddCandidateNoteDto,
  DeleteCandidateNoteQueryDto,
  UpdateCandidateNoteDto,
} from './dto/candidate-note.dto';
import { CandidateEntity } from './entities/candidate.entity';
import { PaginatedCandidatesEntity } from './entities/paginated-candidates.entity';
import { CandidateContactHistoryEntity } from './entities/candidate-contact-history.entity';
import { JobRoleTypeFacetEntity } from './entities/job-role-type-facet.entity';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { ForbiddenException } from '@nestjs/common';

@ApiTags('Candidates')
@ApiBearerAuth()
@Controller('candidates')
export class CandidatesController {
  constructor(
    private readonly candidates: CandidatesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission('candidate', 'read')
  @ApiOperation({
    operationId: 'getCandidates',
    summary: 'List candidates (paginated, filterable, sortable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated candidates', type: PaginatedCandidatesEntity })
  findAll(@Query() query: QueryCandidatesDto, @CurrentUser() user: AuthUser) {
    return this.candidates.findAll(query, user);
  }

  // The static routes below must come before the dynamic @Get(':id') further
  // down — Nest/Express match in registration order, so ':id' would
  // otherwise swallow them.
  @Get('facets/job-role-types')
  @RequirePermission('candidate', 'read')
  @ApiOperation({
    operationId: 'getCandidateJobRoleTypeFacets',
    summary: 'Candidate counts per Role Type, given the current filters (jobRoleTypeIds itself excluded)',
  })
  @ApiResponse({ status: 200, description: 'One row per Role Type with at least one match, highest count first', type: JobRoleTypeFacetEntity, isArray: true })
  getJobRoleTypeFacets(@Query() query: QueryCandidateFacetsDto, @CurrentUser() user: AuthUser) {
    return this.candidates.jobRoleTypeFacets(query, user);
  }

  @Get('by-display-id/:displayId')
  @RequirePermission('candidate', 'read')
  @ApiOperation({ operationId: 'getCandidateByDisplayId', summary: 'Get candidate by display ID (CDD-XXXX)' })
  @ApiResponse({ status: 200, description: 'Candidate found', type: CandidateEntity })
  findByDisplayId(@Param('displayId') displayId: string) {
    return this.candidates.findByDisplayId(displayId);
  }

  @Get(':id')
  @RequirePermission('candidate', 'read')
  @ApiOperation({ operationId: 'getCandidate', summary: 'Get candidate by ID' })
  @ApiResponse({ status: 200, description: 'Candidate found', type: CandidateEntity })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.candidates.findOne(id, user);
  }

  @Get(':id/pipeline-timeline')
  @RequirePermission('candidate', 'read')
  @ApiOperation({
    operationId: 'getCandidatePipelineTimeline',
    summary: "This candidate's submission/stage history across every job order",
  })
  @ApiResponse({ status: 200, description: 'Pipeline events, oldest first', type: PipelineTimelineEventEntity, isArray: true })
  getPipelineTimeline(@Param('id') id: string) {
    return this.audit.getPipelineTimeline({ candidateId: id });
  }

  @Post()
  @RequirePermission('candidate', 'create')
  @ApiOperation({ operationId: 'createCandidate', summary: 'Create a new candidate' })
  @ApiResponse({ status: 201, description: 'Candidate created', type: CandidateEntity })
  create(@Body() dto: CreateCandidateDto, @CurrentUser() user: AuthUser) {
    return this.candidates.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('candidate', 'update')
  @ApiOperation({ operationId: 'updateCandidate', summary: 'Update a candidate' })
  @ApiResponse({ status: 200, description: 'Candidate updated', type: CandidateEntity })
  update(@Param('id') id: string, @Body() dto: UpdateCandidateDto, @CurrentUser() user: AuthUser) {
    return this.candidates.update(id, dto, user);
  }

  @Post(':id/notes')
  @RequirePermission('candidate', 'update')
  @ApiOperation({ operationId: 'addCandidateNote', summary: "Append a note to a candidate's timeline" })
  @ApiResponse({ status: 201, description: 'Candidate updated', type: CandidateEntity })
  addNote(@Param('id') id: string, @Body() dto: AddCandidateNoteDto, @CurrentUser() user: AuthUser) {
    return this.candidates.addNote(id, dto, user);
  }

  @Patch(':id/notes/:noteId')
  @RequirePermission('candidate', 'update')
  @ApiOperation({
    operationId: 'updateCandidateNote',
    summary: "Edit one note in a candidate's timeline (author or admin only)",
  })
  @ApiResponse({ status: 200, description: 'Candidate updated', type: CandidateEntity })
  updateNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateCandidateNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidates.updateNote(id, noteId, dto, user);
  }

  @Delete(':id/notes/:noteId')
  @RequirePermission('candidate', 'update')
  @ApiOperation({
    operationId: 'deleteCandidateNote',
    summary: "Remove one note from a candidate's timeline (author or admin only)",
  })
  @ApiResponse({ status: 200, description: 'Candidate updated', type: CandidateEntity })
  deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Query() query: DeleteCandidateNoteQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidates.deleteNote(id, noteId, user, query.expectedVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('candidate', 'delete')
  @ApiOperation({ operationId: 'deleteCandidate', summary: 'Soft-delete a candidate (recoverable)' })
  @ApiResponse({ status: 204, description: 'Candidate soft-deleted' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.candidates.remove(id, user);
  }

  @Post(':id/restore')
  @RequirePermission('candidate', 'delete')
  @ApiOperation({ operationId: 'restoreCandidate', summary: 'Restore a soft-deleted candidate' })
  @ApiResponse({ status: 201, description: 'Candidate restored', type: CandidateEntity })
  restore(@Param('id') id: string) {
    return this.candidates.restore(id);
  }

  @Delete(':id/purge')
  @HttpCode(204)
  @RequirePermission('candidate', 'delete')
  @ApiOperation({
    operationId: 'purgeCandidate',
    summary: 'Permanently erase a candidate + history (admin only)',
  })
  @ApiResponse({ status: 204, description: 'Candidate permanently deleted' })
  purge(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // Hard delete is irreversible + destroys history — restrict to admins.
    if (user.roleName !== 'admin') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an admin can permanently erase a candidate.',
      });
    }
    return this.candidates.purge(id);
  }

  @Post(':id/contact-history')
  @RequirePermission('candidate', 'update')
  @ApiOperation({
    operationId: 'addCandidateContactHistory',
    summary: 'Log a contact with a candidate — the calling consultant is recorded automatically',
  })
  @ApiResponse({ status: 201, description: 'Contact logged', type: CandidateContactHistoryEntity })
  addContactHistory(
    @Param('id') id: string,
    @Body() dto: CreateCandidateContactHistoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidates.addContactHistory(id, dto, user.consultantId);
  }
}
