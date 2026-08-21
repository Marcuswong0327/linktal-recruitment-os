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
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JobResearchService } from './job-research.service';
import { JobResearchImportService } from './job-research-import.service';
import { CreateJobResearchDto, MarkContactedDto } from './dto/create-job-research.dto';
import { UpdateJobResearchDto } from './dto/update-job-research.dto';
import { QueryJobResearchDto } from './dto/query-job-research.dto';
import { ExportJobResearchDto } from './dto/export-job-research.dto';
import { ExportByIdsDto } from '../common/dto/export-by-ids.dto';
import { ImportOptionsDto } from '../common/dto/import-options.dto';
import { XLSX_CONTENT_TYPE, exportFilename } from '../common/xlsx-export';
import { MAX_IMPORT_FILE_BYTES } from '../common/xlsx-import';
import { JobResearchEntity } from './entities/job-research.entity';
import { PaginatedJobResearchEntity } from './entities/paginated-job-research.entity';
import { ImportResultEntity } from '../common/entities/import-result.entity';
import { CurrentUser, RequirePermission, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';

@ApiTags('Job Research')
@ApiBearerAuth()
@Controller('job-research')
export class JobResearchController {
  constructor(
    private readonly research: JobResearchService,
    private readonly researchImport: JobResearchImportService,
  ) {}

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

  @Get('export')
  @RequirePermission('job_research', 'read')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'exportJobResearch',
    summary: 'Export every research row matching the current filters as an .xlsx file — unbounded, not paginated',
  })
  @ApiResponse({ status: 200, description: 'Job research workbook' })
  async exportAll(@Query() query: ExportJobResearchDto, @CurrentUser() user: AuthUser) {
    const buffer = await this.research.exportAll(query, user);
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${exportFilename('job-research')}"`,
    });
  }

  @Post('export')
  @RequirePermission('job_research', 'read')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'exportJobResearchByIds',
    summary: 'Export an explicit set of research rows (by id) as an .xlsx file',
  })
  @ApiResponse({ status: 201, description: 'Job research workbook' })
  async exportByIds(@Body() dto: ExportByIdsDto, @CurrentUser() user: AuthUser) {
    const buffer = await this.research.exportByIds(dto.ids, user, dto.timezone);
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${exportFilename('job-research')}"`,
    });
  }

  @Get('import/template')
  @RequirePermission('job_research', 'create')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'getJobResearchImportTemplate',
    summary: 'Download the .xlsx template for bulk-importing/updating job research rows',
  })
  @ApiResponse({ status: 200, description: 'Job research import template' })
  async downloadImportTemplate() {
    const buffer = await this.researchImport.buildTemplate();
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: 'attachment; filename="job-research-import-template.xlsx"',
    });
  }

  @Post('import')
  @RequirePermissions({ resource: 'job_research', action: 'create' }, { resource: 'job_research', action: 'update' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }))
  @ApiOperation({
    operationId: 'importJobResearch',
    summary:
      'Preview (commit=false, default) or commit (commit=true) a bulk job research import/update from an .xlsx file. All-or-nothing: any row error means nothing is written.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' }, commit: { type: 'boolean', default: false } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Import result', type: ImportResultEntity })
  async import(@UploadedFile() file: Express.Multer.File | undefined, @Body() options: ImportOptionsDto) {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Upload an .xlsx file as "file".' });
    }
    return this.researchImport.importFromWorkbook(file.buffer, options.commit ?? false, file.originalname);
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
