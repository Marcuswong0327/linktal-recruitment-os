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
import { TobsService } from './tobs.service';
import { CreateTobDto } from './dto/create-tob.dto';
import { UpdateTobDto } from './dto/update-tob.dto';
import { QueryTobsDto } from './dto/query-tobs.dto';
import { TobEntity } from './entities/tob.entity';
import { PaginatedTobsEntity } from './entities/paginated-tobs.entity';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';

@ApiTags('TOBs')
@ApiBearerAuth()
@Controller('tobs')
export class TobsController {
  constructor(private readonly tobs: TobsService) {}

  @Get()
  @RequirePermission('tob', 'read')
  @ApiOperation({
    operationId: 'getTobs',
    summary: 'List Terms of Business (paginated, filterable, sortable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated TOBs', type: PaginatedTobsEntity })
  findAll(@Query() query: QueryTobsDto, @CurrentUser() user: AuthUser) {
    return this.tobs.findAll(query, user);
  }

  @Get('by-display-id/:displayId')
  @RequirePermission('tob', 'read')
  @ApiOperation({ operationId: 'getTobByDisplayId', summary: 'Get a TOB by display ID (TOB-XXXX)' })
  @ApiResponse({ status: 200, description: 'TOB found', type: TobEntity })
  findByDisplayId(@Param('displayId') displayId: string) {
    return this.tobs.findByDisplayId(displayId);
  }

  @Get(':id')
  @RequirePermission('tob', 'read')
  @ApiOperation({ operationId: 'getTob', summary: 'Get a TOB by ID' })
  @ApiResponse({ status: 200, description: 'TOB found', type: TobEntity })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.tobs.findOne(id, user);
  }

  @Post()
  @RequirePermission('tob', 'create')
  @ApiOperation({ operationId: 'createTob', summary: 'File a new Terms of Business against a client' })
  @ApiResponse({ status: 201, description: 'TOB created', type: TobEntity })
  create(@Body() dto: CreateTobDto, @CurrentUser() user: AuthUser) {
    return this.tobs.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('tob', 'update')
  @ApiOperation({ operationId: 'updateTob', summary: 'Update a TOB' })
  @ApiResponse({ status: 200, description: 'TOB updated', type: TobEntity })
  update(@Param('id') id: string, @Body() dto: UpdateTobDto, @CurrentUser() user: AuthUser) {
    return this.tobs.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('tob', 'delete')
  @ApiOperation({ operationId: 'deleteTob', summary: 'Soft-delete a TOB (recoverable)' })
  @ApiResponse({ status: 204, description: 'TOB soft-deleted' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.tobs.remove(id, user);
  }

  @Post(':id/restore')
  @RequirePermission('tob', 'delete')
  @ApiOperation({ operationId: 'restoreTob', summary: 'Restore a soft-deleted TOB' })
  @ApiResponse({ status: 201, description: 'TOB restored', type: TobEntity })
  restore(@Param('id') id: string) {
    return this.tobs.restore(id);
  }

  @Delete(':id/purge')
  @HttpCode(204)
  @RequirePermission('tob', 'delete')
  @ApiOperation({ operationId: 'purgeTob', summary: 'Permanently erase a TOB (admin only)' })
  @ApiResponse({ status: 204, description: 'TOB permanently deleted' })
  purge(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // Hard delete is irreversible + destroys history — restrict to admins.
    if (user.roleName !== 'admin') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an admin can permanently erase a TOB.',
      });
    }
    return this.tobs.purge(id);
  }
}
