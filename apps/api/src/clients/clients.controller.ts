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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { ClientEntity } from './entities/client.entity';
import { PaginatedClientsEntity } from './entities/paginated-clients.entity';
import { RequirePermission } from '../auth/auth.decorators';

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
  @ApiOperation({ operationId: 'getClientByDisplayId', summary: 'Get client by display ID (Client-XXXX)' })
  @ApiResponse({ status: 200, description: 'Client found', type: ClientEntity })
  findByDisplayId(@Param('displayId') displayId: string) {
    return this.clients.findByDisplayId(displayId);
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

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('client', 'delete')
  @ApiOperation({ operationId: 'deleteClient', summary: 'Delete a client' })
  @ApiResponse({ status: 204, description: 'Client deleted' })
  remove(@Param('id') id: string) {
    return this.clients.remove(id);
  }
}
