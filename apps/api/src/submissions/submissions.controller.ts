import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SubmissionsService } from './submissions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { QuerySubmissionsDto } from './dto/query-submissions.dto';
import { SubmissionEntity } from './entities/submission.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Submissions')
@ApiBearerAuth()
@Controller('candidate-submissions')
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get()
  @RequirePermission('submission', 'read')
  @ApiOperation({
    operationId: 'getSubmissions',
    summary: 'List submissions, filtered by candidateId and/or jobOrderId',
  })
  @ApiResponse({ status: 200, description: 'Submissions', type: SubmissionEntity, isArray: true })
  findAll(@Query() query: QuerySubmissionsDto) {
    return this.submissions.findAll(query);
  }

  @Get(':id')
  @RequirePermission('submission', 'read')
  @ApiOperation({ operationId: 'getSubmission', summary: 'Get submission by ID' })
  @ApiResponse({ status: 200, description: 'Submission found', type: SubmissionEntity })
  findOne(@Param('id') id: string) {
    return this.submissions.findOne(id);
  }

  @Post()
  @RequirePermission('submission', 'create')
  @ApiOperation({
    operationId: 'createSubmission',
    summary: 'Submit a candidate to a job order (restores a prior removed submission for the same pair instead of erroring)',
  })
  @ApiResponse({ status: 201, description: 'Submission created', type: SubmissionEntity })
  create(@Body() dto: CreateSubmissionDto) {
    return this.submissions.create(dto);
  }

  @Patch(':id')
  @RequirePermission('submission', 'update')
  @ApiOperation({ operationId: 'updateSubmission', summary: 'Update a submission (e.g. move to a new stage)' })
  @ApiResponse({ status: 200, description: 'Submission updated', type: SubmissionEntity })
  update(@Param('id') id: string, @Body() dto: UpdateSubmissionDto) {
    return this.submissions.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('submission', 'delete')
  @ApiOperation({ operationId: 'deleteSubmission', summary: 'Remove a candidate from a job order (soft-delete, recoverable)' })
  @ApiResponse({ status: 204, description: 'Submission removed' })
  remove(@Param('id') id: string) {
    return this.submissions.remove(id);
  }
}
