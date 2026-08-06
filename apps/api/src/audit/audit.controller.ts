import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { PaginatedAuditLogsEntity } from './entities/paginated-audit-logs.entity';

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
}
