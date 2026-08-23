import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import { JobOrdersService } from './job-orders.service';
import { JobOrdersImportService } from './job-orders-import.service';
import { CreateJobOrderDto } from './dto/create-job-order.dto';
import { UpdateJobOrderDto } from './dto/update-job-order.dto';
import { QueryJobOrdersDto } from './dto/query-job-orders.dto';
import { ExportJobOrdersDto } from './dto/export-job-orders.dto';
import { SetJobOrderConsultantsDto } from './dto/set-job-order-consultants.dto';
import { ExportByIdsDto } from '../common/dto/export-by-ids.dto';
import { ImportOptionsDto } from '../common/dto/import-options.dto';
import { XLSX_CONTENT_TYPE, exportFilename } from '../common/xlsx-export';
import { MAX_IMPORT_FILE_BYTES } from '../common/xlsx-import';
import { JobOrderEntity } from './entities/job-order.entity';
import { PaginatedJobOrdersEntity } from './entities/paginated-job-orders.entity';
import { ImportResultEntity } from '../common/entities/import-result.entity';
import { CurrentUser, RequirePermission, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PipelineTimelineEventEntity } from '../audit/entities/pipeline-timeline-event.entity';

@ApiTags('Job Orders')
@ApiBearerAuth()
@Controller('job-orders')
export class JobOrdersController {
  constructor(
    private readonly jobOrders: JobOrdersService,
    private readonly jobOrdersImport: JobOrdersImportService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission('job_order', 'read')
  @ApiOperation({
    operationId: 'getJobOrders',
    summary: 'List job orders (paginated, filterable, sortable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated job orders', type: PaginatedJobOrdersEntity })
  findAll(@Query() query: QueryJobOrdersDto, @CurrentUser() user: AuthUser) {
    return this.jobOrders.findAll(query, user);
  }

  @Get('by-display-id/:displayId')
  @RequirePermission('job_order', 'read')
  @ApiOperation({ operationId: 'getJobOrderByDisplayId', summary: 'Get job order by display ID' })
  @ApiResponse({ status: 200, description: 'Job order found', type: JobOrderEntity })
  findByDisplayId(@Param('displayId') displayId: string) {
    return this.jobOrders.findByDisplayId(displayId);
  }

  @Get('export')
  @RequirePermission('job_order', 'read')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'exportJobOrders',
    summary: 'Export every job order matching the current filters as an .xlsx file — unbounded, not paginated',
  })
  @ApiResponse({ status: 200, description: 'Job orders workbook' })
  async exportAll(@Query() query: ExportJobOrdersDto, @CurrentUser() user: AuthUser) {
    const buffer = await this.jobOrders.exportAll(query, user);
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${exportFilename('job-orders')}"`,
    });
  }

  @Post('export')
  @RequirePermission('job_order', 'read')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'exportJobOrdersByIds',
    summary: 'Export an explicit set of job orders (by id) as an .xlsx file',
  })
  @ApiResponse({ status: 201, description: 'Job orders workbook' })
  async exportByIds(@Body() dto: ExportByIdsDto, @CurrentUser() user: AuthUser) {
    const buffer = await this.jobOrders.exportByIds(dto.ids, user, dto.timezone);
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${exportFilename('job-orders')}"`,
    });
  }

  @Get('import/template')
  @RequirePermission('job_order', 'create')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'getJobOrderImportTemplate',
    summary: 'Download the .xlsx template for bulk-importing/updating job orders',
  })
  @ApiResponse({ status: 200, description: 'Job orders import template' })
  async downloadImportTemplate() {
    const buffer = await this.jobOrdersImport.buildTemplate();
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: 'attachment; filename="job-orders-import-template.xlsx"',
    });
  }

  @Post('import')
  @RequirePermissions({ resource: 'job_order', action: 'create' }, { resource: 'job_order', action: 'update' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }))
  @ApiOperation({
    operationId: 'importJobOrders',
    summary:
      'Preview (commit=false, default) or commit (commit=true) a bulk job order import/update from an .xlsx file. All-or-nothing: any row error means nothing is written.',
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
    return this.jobOrdersImport.importFromWorkbook(file.buffer, options.commit ?? false, file.originalname);
  }

  @Get(':id')
  @RequirePermission('job_order', 'read')
  @ApiOperation({ operationId: 'getJobOrder', summary: 'Get job order by ID' })
  @ApiResponse({ status: 200, description: 'Job order found', type: JobOrderEntity })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.jobOrders.findOne(id, user);
  }

  @Get(':id/pipeline-timeline')
  @RequirePermission('job_order', 'read')
  @ApiOperation({
    operationId: 'getJobOrderPipelineTimeline',
    summary: 'Every candidate submission/stage change for this job order',
  })
  @ApiResponse({ status: 200, description: 'Pipeline events, oldest first', type: PipelineTimelineEventEntity, isArray: true })
  getPipelineTimeline(@Param('id') id: string) {
    return this.audit.getPipelineTimeline({ jobOrderId: id });
  }

  @Post()
  @RequirePermission('job_order', 'create')
  @ApiOperation({ operationId: 'createJobOrder', summary: 'Create a new job order' })
  @ApiResponse({ status: 201, description: 'Job order created', type: JobOrderEntity })
  create(@Body() dto: CreateJobOrderDto, @CurrentUser() user: AuthUser) {
    return this.jobOrders.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('job_order', 'update')
  @ApiOperation({ operationId: 'updateJobOrder', summary: 'Update a job order' })
  @ApiResponse({ status: 200, description: 'Job order updated', type: JobOrderEntity })
  update(@Param('id') id: string, @Body() dto: UpdateJobOrderDto, @CurrentUser() user: AuthUser) {
    return this.jobOrders.update(id, dto, user);
  }

  @Put(':id/consultants')
  @RequirePermission('job_order', 'update')
  @ApiOperation({
    operationId: 'setJobOrderConsultants',
    summary:
      "Replace who's working this job order (full-set-replace). Several consultants can work the same job order concurrently, in or out of their usual scope — no scope check is applied here on purpose.",
  })
  @ApiResponse({ status: 200, description: 'Consultants updated', type: JobOrderEntity })
  setConsultants(
    @Param('id') id: string,
    @Body() dto: SetJobOrderConsultantsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobOrders.setConsultants(id, dto.consultantIds, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('job_order', 'delete')
  @ApiOperation({ operationId: 'deleteJobOrder', summary: 'Delete a job order' })
  @ApiResponse({ status: 204, description: 'Job order deleted' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.jobOrders.remove(id, user);
  }
}
