import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JobResearchService } from './job-research.service';
import { CreateJobResearchDto, MarkContactedDto } from './dto/create-job-research.dto';
import { UpdateJobResearchDto } from './dto/update-job-research.dto';
import { QueryJobResearchDto } from './dto/query-job-research.dto';
import { JobResearchEntity } from './entities/job-research.entity';
import { PaginatedJobResearchEntity } from './entities/paginated-job-research.entity';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';

@ApiTags('Job Research')
@ApiBearerAuth()
@Controller('job-research')
export class JobResearchController {
  constructor(private readonly research: JobResearchService) {}

  @Get()
  @RequirePermission('job_research', 'read')
  @ApiOperation({
    operationId: 'getJobResearch',
    summary: 'List market research rows (paginated, filterable, sortable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated job research', type: PaginatedJobResearchEntity })
  findAll(@Query() query: QueryJobResearchDto, @CurrentUser() user: AuthUser) {
    return this.research.findAll(query, user);
  }

  @Get('by-display-id/:displayId')
  @RequirePermission('job_research', 'read')
  @ApiOperation({
    operationId: 'getJobResearchByDisplayId',
    summary: 'Get a research row by display ID (JR-XXXX)',
  })
  @ApiResponse({ status: 200, description: 'Research row found', type: JobResearchEntity })
  findByDisplayId(@Param('displayId') displayId: string) {
    return this.research.findByDisplayId(displayId);
  }

  @Get(':id')
  @RequirePermission('job_research', 'read')
  @ApiOperation({ operationId: 'getJobResearchById', summary: 'Get a research row by ID' })
  @ApiResponse({ status: 200, description: 'Research row found', type: JobResearchEntity })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.research.findOne(id, user);
  }

  @Post()
  @RequirePermission('job_research', 'create')
  @ApiOperation({ operationId: 'createJobResearch', summary: 'Log a job ad found in the market' })
  @ApiResponse({ status: 201, description: 'Research row created', type: JobResearchEntity })
  create(@Body() dto: CreateJobResearchDto) {
    return this.research.create(dto);
  }

  @Patch(':id')
  @RequirePermission('job_research', 'update')
  @ApiOperation({ operationId: 'updateJobResearch', summary: 'Update a research row' })
  @ApiResponse({ status: 200, description: 'Research row updated', type: JobResearchEntity })
  update(@Param('id') id: string, @Body() dto: UpdateJobResearchDto, @CurrentUser() user: AuthUser) {
    return this.research.update(id, dto, user);
  }

  @Post(':id/mark-contacted')
  @RequirePermission('job_research', 'update')
  @ApiOperation({
    operationId: 'markJobResearchContacted',
    summary: 'Record that the advertiser has been approached — the calling consultant is recorded automatically',
  })
  @ApiResponse({ status: 201, description: 'Research row updated', type: JobResearchEntity })
  markContacted(@Param('id') id: string, @Body() dto: MarkContactedDto, @CurrentUser() user: AuthUser) {
    return this.research.markContacted(id, dto.contactedAt, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('job_research', 'delete')
  @ApiOperation({ operationId: 'deleteJobResearch', summary: 'Soft-delete a research row (recoverable)' })
  @ApiResponse({ status: 204, description: 'Research row soft-deleted' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.research.remove(id, user);
  }

  @Post(':id/restore')
  @RequirePermission('job_research', 'delete')
  @ApiOperation({ operationId: 'restoreJobResearch', summary: 'Restore a soft-deleted research row' })
  @ApiResponse({ status: 201, description: 'Research row restored', type: JobResearchEntity })
  restore(@Param('id') id: string) {
    return this.research.restore(id);
  }

  @Delete(':id/purge')
  @HttpCode(204)
  @RequirePermission('job_research', 'delete')
  @ApiOperation({ operationId: 'purgeJobResearch', summary: 'Permanently erase a research row (admin only)' })
  @ApiResponse({ status: 204, description: 'Research row permanently deleted' })
  purge(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // Hard delete is irreversible + destroys history — restrict to admins.
    if (user.roleName !== 'admin') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an admin can permanently erase a research row.',
      });
    }
    return this.research.purge(id);
  }
}
