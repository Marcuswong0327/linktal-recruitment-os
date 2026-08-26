import { Body, Controller, Get, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { ExportAuditLogsDto } from './dto/export-audit-logs.dto';
import { ExportByIdsDto } from '../common/dto/export-by-ids.dto';
import { XLSX_CONTENT_TYPE, exportFilename } from '../common/xlsx-export';
import { PaginatedAuditLogsEntity } from './entities/paginated-audit-logs.entity';
import { AuditEntityTypeEntity } from './entities/audit-entity-type.entity';
import { AuditActionCountEntity } from './entities/audit-action-count.entity';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit', 'read')
  @ApiOperation({
    operationId: 'getAuditLogs',
    summary: 'List activity-log entries (admin only, paginated, filterable, sortable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated audit logs', type: PaginatedAuditLogsEntity })
  findAll(@Query() query: QueryAuditLogsDto, @CurrentUser() user: AuthUser) {
    return this.audit.findAll(query, user);
  }

  @Get('entity-types')
  @RequirePermission('audit', 'read')
  @ApiOperation({
    operationId: 'getAuditEntityTypes',
    summary: 'Every record type the activity log can be filtered by, with display labels',
  })
  @ApiResponse({ status: 200, description: 'Record-type filter options', type: [AuditEntityTypeEntity] })
  entityTypes() {
    return this.audit.entityTypes();
  }

  @Get('action-counts')
  @RequirePermission('audit', 'read')
  @ApiOperation({
    operationId: 'getAuditActionCounts',
    summary: 'Per-action entry totals under the current filters (across every page, not just the loaded one)',
  })
  @ApiResponse({ status: 200, description: 'Counts per action', type: [AuditActionCountEntity] })
  actionCounts(@Query() query: QueryAuditLogsDto) {
    return this.audit.actionCounts(query);
  }

  @Get('export')
  @RequirePermission('audit', 'read')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'exportAuditLogs',
    summary: 'Export every activity-log entry matching the current filters as an .xlsx file — unbounded, not paginated',
  })
  @ApiResponse({ status: 200, description: 'Activity log workbook' })
  async exportAll(@Query() query: ExportAuditLogsDto, @CurrentUser() user: AuthUser) {
    const buffer = await this.audit.exportAll(query, user);
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${exportFilename('activity-log')}"`,
    });
  }

  @Post('export')
  @RequirePermission('audit', 'read')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'exportAuditLogsByIds',
    summary: 'Export an explicit set of activity-log entries (by id) as an .xlsx file',
  })
  @ApiResponse({ status: 201, description: 'Activity log workbook' })
  async exportByIds(@Body() dto: ExportByIdsDto, @CurrentUser() user: AuthUser) {
    const buffer = await this.audit.exportByIds(dto.ids, user, dto.timezone);
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${exportFilename('activity-log')}"`,
    });
  }
}
