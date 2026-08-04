import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JobTitlesService } from './job-titles.service';
import { CreateJobTitleDto } from './dto/create-job-title.dto';
import { QueryJobTitlesDto } from './dto/query-job-titles.dto';
import { JobTitleEntity } from './entities/job-title.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Job Titles')
@ApiBearerAuth()
@Controller('job-titles')
export class JobTitlesController {
  constructor(private readonly jobTitles: JobTitlesService) {}

  @Get()
  @RequirePermission('job_title', 'read')
  @ApiOperation({ operationId: 'getJobTitles', summary: 'List active job titles (searchable, capped)' })
  @ApiResponse({ status: 200, description: 'Active job titles', type: JobTitleEntity, isArray: true })
  findAll(@Query() query: QueryJobTitlesDto) {
    return this.jobTitles.findAll(query);
  }

  @Post()
  @RequirePermission('job_title', 'create')
  @ApiOperation({
    operationId: 'createJobTitle',
    summary: 'Create a job title entry, or return the existing one with that name',
  })
  @ApiResponse({ status: 201, description: 'Created (or already existed)', type: JobTitleEntity })
  create(@Body() dto: CreateJobTitleDto) {
    return this.jobTitles.create(dto);
  }
}
