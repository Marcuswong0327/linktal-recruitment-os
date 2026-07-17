import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { AddClientNoteDto, DeleteClientNoteQueryDto, UpdateClientNoteDto } from './dto/client-note.dto';
import { ClientEntity } from './entities/client.entity';
import { PaginatedClientsEntity } from './entities/paginated-clients.entity';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { ForbiddenException } from '@nestjs/common';

@ApiTags('Clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermission('client', 'read')
  @ApiOperation({
    operationId: 'getClients',
    summary: 'List clients (paginated, filterable, sortable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated clients', type: PaginatedClientsEntity })
  findAll(@Query() query: QueryClientsDto) {
    return this.clients.findAll(query);
  }

  @Get('by-display-id/:displayId')
  @RequirePermission('client', 'read')
  @ApiOperation({
    operationId: 'getClientByDisplayId',
    summary: 'Get client by display ID (Client-XXXX)',
  })
  @ApiResponse({ status: 200, description: 'Client found', type: ClientEntity })
  findByDisplayId(@Param('displayId') displayId: string) {
    return this.clients.findByDisplayId(displayId);
  }

  @Get('options/industries')
  @RequirePermission('client', 'read')
  @ApiOperation({
    operationId: 'getClientIndustryOptions',
    summary: 'Distinct industry values already in use, for the Industry autocomplete',
  })
  @ApiResponse({ status: 200, description: 'Distinct industry values', type: [String] })
  getIndustryOptions() {
    return this.clients.getIndustryOptions();
  }

  @Get('options/specializations')
  @RequirePermission('client', 'read')
  @ApiOperation({
    operationId: 'getClientSpecializationOptions',
    summary: 'Distinct specialization values already in use, for the Specialization autocomplete',
  })
  @ApiResponse({ status: 200, description: 'Distinct specialization values', type: [String] })
  getSpecializationOptions() {
    return this.clients.getSpecializationOptions();
  }

  @Get(':id')
  @RequirePermission('client', 'read')
  @ApiOperation({ operationId: 'getClient', summary: 'Get client by ID' })
  @ApiResponse({ status: 200, description: 'Client found', type: ClientEntity })
  findOne(@Param('id') id: string) {
    return this.clients.findOne(id);
  }

  @Post()
  @RequirePermission('client', 'create')
  @ApiOperation({ operationId: 'createClient', summary: 'Create a new client' })
  @ApiResponse({ status: 201, description: 'Client created', type: ClientEntity })
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Patch(':id')
  @RequirePermission('client', 'update')
  @ApiOperation({ operationId: 'updateClient', summary: 'Update a client' })
  @ApiResponse({ status: 200, description: 'Client updated', type: ClientEntity })
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }

  @Post(':id/notes')
  @RequirePermission('client', 'update')
  @ApiOperation({ operationId: 'addClientNote', summary: "Append a note to a client's timeline" })
  @ApiResponse({ status: 201, description: 'Client updated', type: ClientEntity })
  addNote(@Param('id') id: string, @Body() dto: AddClientNoteDto, @CurrentUser() user: AuthUser) {
    return this.clients.addNote(id, dto, user.consultantId);
  }

  @Patch(':id/notes/:noteId')
  @RequirePermission('client', 'update')
  @ApiOperation({
    operationId: 'updateClientNote',
    summary: "Edit one note in a client's timeline (author or admin only)",
  })
  @ApiResponse({ status: 200, description: 'Client updated', type: ClientEntity })
  updateNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateClientNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clients.updateNote(id, noteId, dto, user);
  }

  @Delete(':id/notes/:noteId')
  @RequirePermission('client', 'update')
  @ApiOperation({
    operationId: 'deleteClientNote',
    summary: "Remove one note from a client's timeline (author or admin only)",
  })
  @ApiResponse({ status: 200, description: 'Client updated', type: ClientEntity })
  deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Query() query: DeleteClientNoteQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clients.deleteNote(id, noteId, user, query.expectedVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('client', 'delete')
  @ApiOperation({
    operationId: 'deleteClient',
    summary: 'Soft-delete a client (recoverable, cascades)',
  })
  @ApiResponse({ status: 204, description: 'Client soft-deleted' })
  remove(@Param('id') id: string) {
    return this.clients.remove(id);
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
