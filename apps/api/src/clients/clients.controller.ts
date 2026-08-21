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
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { ClientsImportService } from './clients-import.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { ExportClientsDto } from './dto/export-clients.dto';
import { ExportByIdsDto } from '../common/dto/export-by-ids.dto';
import { QueryContactHistoryDto } from '../common/dto/query-contact-history.dto';
import { ImportOptionsDto } from '../common/dto/import-options.dto';
import { XLSX_CONTENT_TYPE, exportFilename } from '../common/xlsx-export';
import { MAX_IMPORT_FILE_BYTES } from '../common/xlsx-import';
import { ClientEntity } from './entities/client.entity';
import { ClientContactHistoryEntity } from './entities/client-contact-history.entity';
import { PaginatedClientsEntity } from './entities/paginated-clients.entity';
import { ImportResultEntity } from '../common/entities/import-result.entity';
import { CurrentUser, RequirePermission, RequirePermissions } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

@ApiTags('Clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly clientsImport: ClientsImportService,
  ) {}

  @Get()
  @RequirePermission('client', 'read')
  @ApiOperation({
    operationId: 'getClients',
    summary: 'List clients (paginated, filterable, sortable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated clients', type: PaginatedClientsEntity })
  findAll(@Query() query: QueryClientsDto, @CurrentUser() user: AuthUser) {
    return this.clients.findAll(query, user);
  }

  @Get('by-display-id/:displayId')
  @RequirePermission('client', 'read')
  @ApiOperation({
    operationId: 'getClientByDisplayId',
    summary: 'Get client by display ID (CLI-XXXX)',
  })
  @ApiResponse({ status: 200, description: 'Client found', type: ClientEntity })
  findByDisplayId(@Param('displayId') displayId: string) {
    return this.clients.findByDisplayId(displayId);
  }

  @Get('export')
  @RequirePermission('client', 'read')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'exportClients',
    summary: 'Export every client matching the current filters as an .xlsx file — unbounded, not paginated',
  })
  @ApiResponse({ status: 200, description: 'Clients workbook' })
  async exportAll(@Query() query: ExportClientsDto, @CurrentUser() user: AuthUser) {
    const buffer = await this.clients.exportAll(query, user);
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${exportFilename('companies')}"`,
    });
  }

  @Post('export')
  @RequirePermission('client', 'read')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'exportClientsByIds',
    summary: 'Export an explicit set of clients (by id) as an .xlsx file',
  })
  @ApiResponse({ status: 201, description: 'Clients workbook' })
  async exportByIds(@Body() dto: ExportByIdsDto, @CurrentUser() user: AuthUser) {
    const buffer = await this.clients.exportByIds(dto.ids, user, dto.timezone);
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${exportFilename('companies')}"`,
    });
  }

  @Get('import/template')
  @RequirePermission('client', 'create')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'getClientImportTemplate',
    summary: 'Download the .xlsx template for bulk-importing/updating companies',
  })
  @ApiResponse({ status: 200, description: 'Companies import template' })
  async downloadImportTemplate() {
    const buffer = await this.clientsImport.buildTemplate();
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: 'attachment; filename="companies-import-template.xlsx"',
    });
  }

  // Requires BOTH create and update — see RequirePermissions's doc: an import
  // inserts new rows and updates matched ones in the same request, and a
  // consultant might hold only one of the two.
  @Post('import')
  @RequirePermissions({ resource: 'client', action: 'create' }, { resource: 'client', action: 'update' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }))
  @ApiOperation({
    operationId: 'importClients',
    summary:
      'Preview (commit=false, default) or commit (commit=true) a bulk company import/update from an .xlsx file. All-or-nothing: any row error means nothing is written.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        commit: { type: 'boolean', default: false },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Import result', type: ImportResultEntity })
  async import(@UploadedFile() file: Express.Multer.File | undefined, @Body() options: ImportOptionsDto) {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Upload an .xlsx file as "file".' });
    }
    return this.clientsImport.importFromWorkbook(file.buffer, options.commit ?? false, file.originalname);
  }

  @Get(':id')
  @RequirePermission('client', 'read')
  @ApiOperation({ operationId: 'getClient', summary: 'Get client by ID' })
  @ApiResponse({ status: 200, description: 'Client found', type: ClientEntity })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.clients.findOne(id, user);
  }

  @Post()
  @RequirePermission('client', 'create')
  @ApiOperation({ operationId: 'createClient', summary: 'Create a new client' })
  @ApiResponse({ status: 201, description: 'Client created', type: ClientEntity })
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthUser) {
    return this.clients.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('client', 'update')
  @ApiOperation({ operationId: 'updateClient', summary: 'Update a client' })
  @ApiResponse({ status: 200, description: 'Client updated', type: ClientEntity })
  update(@Param('id') id: string, @Body() dto: UpdateClientDto, @CurrentUser() user: AuthUser) {
    return this.clients.update(id, dto, user);
  }

  // No note-timeline routes of its own, deliberately: client-side notes live
  // in StakeholderContactHistory, not on the Client row itself — see
  // ClientContactHistoryEntity's doc. The route below aggregates across every
  // stakeholder at this client rather than owning a timeline directly.
  @Get(':id/contact-history')
  @RequirePermission('stakeholder', 'read')
  @ApiOperation({
    operationId: 'getClientContactHistory',
    summary: "Most recent logged contacts across this client's stakeholders, newest first (5 unless `limit` says otherwise)",
  })
  @ApiResponse({ status: 200, description: 'Contact history', type: ClientContactHistoryEntity, isArray: true })
  listContactHistory(@Param('id') id: string, @Query() query: QueryContactHistoryDto) {
    return this.clients.listContactHistory(id, query.limit);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('client', 'delete')
  @ApiOperation({
    operationId: 'deleteClient',
    summary: 'Soft-delete a client (recoverable, cascades)',
  })
  @ApiResponse({ status: 204, description: 'Client soft-deleted' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.clients.remove(id, user);
  }

  @Post(':id/restore')
  @RequirePermission('client', 'delete')
  @ApiOperation({ operationId: 'restoreClient', summary: 'Restore a soft-deleted client' })
  @ApiResponse({ status: 201, description: 'Client restored', type: ClientEntity })
  restore(@Param('id') id: string) {
    return this.clients.restore(id);
  }

  @Delete(':id/purge')
  @HttpCode(204)
  @RequirePermission('client', 'delete')
  @ApiOperation({
    operationId: 'purgeClient',
    summary: 'Permanently erase a client + children (admin only)',
  })
  @ApiResponse({ status: 204, description: 'Client permanently deleted' })
  purge(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // Hard delete is irreversible + destroys history — restrict to admins.
    if (user.roleName !== 'admin') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an admin can permanently erase a client.',
      });
    }
    return this.clients.purge(id);
  }
}
