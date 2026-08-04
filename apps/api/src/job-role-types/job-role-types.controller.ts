import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JobRoleTypesService } from './job-role-types.service';
import { CreateJobRoleTypeDto } from './dto/create-job-role-type.dto';
import { QueryJobRoleTypesDto } from './dto/query-job-role-types.dto';
import { JobRoleTypeEntity } from './entities/job-role-type.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Job Role Types')
@ApiBearerAuth()
@Controller('job-role-types')
export class JobRoleTypesController {
  constructor(private readonly jobRoleTypes: JobRoleTypesService) {}

  @Get()
  @RequirePermission('job_role_type', 'read')
  @ApiOperation({ operationId: 'getJobRoleTypes', summary: 'List active job role types (searchable, capped)' })
  @ApiResponse({ status: 200, description: 'Active job role types', type: JobRoleTypeEntity, isArray: true })
  findAll(@Query() query: QueryJobRoleTypesDto) {
    return this.jobRoleTypes.findAll(query);
  }

  @Post()
  @RequirePermission('job_role_type', 'create')
  @ApiOperation({
    operationId: 'createJobRoleType',
    summary: 'Create a job role type entry, or return the existing one with that name',
  })
  @ApiResponse({ status: 201, description: 'Created (or already existed)', type: JobRoleTypeEntity })
  create(@Body() dto: CreateJobRoleTypeDto) {
    return this.jobRoleTypes.create(dto);
  }
}
