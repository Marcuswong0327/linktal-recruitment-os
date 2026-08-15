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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StakeholdersService } from './stakeholders.service';
import { CreateStakeholderDto } from './dto/create-stakeholder.dto';
import { UpdateStakeholderDto } from './dto/update-stakeholder.dto';
import { QueryStakeholdersDto } from './dto/query-stakeholders.dto';
import { ExportStakeholdersDto } from './dto/export-stakeholders.dto';
import { ExportByIdsDto } from '../common/dto/export-by-ids.dto';
import { XLSX_CONTENT_TYPE, exportFilename } from '../common/xlsx-export';
import { CreateStakeholderContactHistoryDto } from './dto/create-stakeholder-contact-history.dto';
import { StakeholderEntity } from './entities/stakeholder.entity';
import { PaginatedStakeholdersEntity } from './entities/paginated-stakeholders.entity';
import { StakeholderContactHistoryEntity } from './entities/stakeholder-contact-history.entity';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';

@ApiTags('Stakeholders')
@ApiBearerAuth()
@Controller('stakeholders')
export class StakeholdersController {
  constructor(private readonly stakeholders: StakeholdersService) {}

  @Get()
  @RequirePermission('stakeholder', 'read')
  @ApiOperation({
    operationId: 'getStakeholders',
    summary: 'List stakeholders (paginated, filterable, sortable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated stakeholders', type: PaginatedStakeholdersEntity })
  findAll(@Query() query: QueryStakeholdersDto, @CurrentUser() user: AuthUser) {
    return this.stakeholders.findAll(query, user);
  }

  @Get('by-display-id/:displayId')
  @RequirePermission('stakeholder', 'read')
  @ApiOperation({ operationId: 'getStakeholderByDisplayId', summary: 'Get stakeholder by display ID (STK-XXXX)' })
  @ApiResponse({ status: 200, description: 'Stakeholder found', type: StakeholderEntity })
  findByDisplayId(@Param('displayId') displayId: string) {
    return this.stakeholders.findByDisplayId(displayId);
  }

  @Get('export')
  @RequirePermission('stakeholder', 'read')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'exportStakeholders',
    summary: 'Export every stakeholder matching the current filters as an .xlsx file — unbounded, not paginated',
  })
  @ApiResponse({ status: 200, description: 'Stakeholders workbook' })
  async exportAll(@Query() query: ExportStakeholdersDto, @CurrentUser() user: AuthUser) {
    const buffer = await this.stakeholders.exportAll(query, user);
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${exportFilename('stakeholders')}"`,
    });
  }

  @Post('export')
  @RequirePermission('stakeholder', 'read')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    operationId: 'exportStakeholdersByIds',
    summary: 'Export an explicit set of stakeholders (by id) as an .xlsx file',
  })
  @ApiResponse({ status: 201, description: 'Stakeholders workbook' })
  async exportByIds(@Body() dto: ExportByIdsDto, @CurrentUser() user: AuthUser) {
    const buffer = await this.stakeholders.exportByIds(dto.ids, user, dto.timezone);
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${exportFilename('stakeholders')}"`,
    });
  }

  @Get(':id')
  @RequirePermission('stakeholder', 'read')
  @ApiOperation({ operationId: 'getStakeholder', summary: 'Get stakeholder by ID' })
  @ApiResponse({ status: 200, description: 'Stakeholder found', type: StakeholderEntity })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.stakeholders.findOne(id, user);
  }

  @Post()
  @RequirePermission('stakeholder', 'create')
  @ApiOperation({ operationId: 'createStakeholder', summary: 'Create a new stakeholder' })
  @ApiResponse({ status: 201, description: 'Stakeholder created', type: StakeholderEntity })
  create(@Body() dto: CreateStakeholderDto, @CurrentUser() user: AuthUser) {
    return this.stakeholders.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('stakeholder', 'update')
  @ApiOperation({ operationId: 'updateStakeholder', summary: 'Update a stakeholder' })
  @ApiResponse({ status: 200, description: 'Stakeholder updated', type: StakeholderEntity })
  update(@Param('id') id: string, @Body() dto: UpdateStakeholderDto, @CurrentUser() user: AuthUser) {
    return this.stakeholders.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('stakeholder', 'delete')
  @ApiOperation({ operationId: 'deleteStakeholder', summary: 'Delete a stakeholder' })
  @ApiResponse({ status: 204, description: 'Stakeholder deleted' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.stakeholders.remove(id, user);
  }

  @Post(':id/contact-history')
  @RequirePermission('stakeholder', 'update')
  @ApiOperation({
    operationId: 'addStakeholderContactHistory',
    summary: 'Log a contact with a stakeholder — the calling consultant is recorded automatically',
  })
  @ApiResponse({ status: 201, description: 'Contact logged', type: StakeholderContactHistoryEntity })
  addContactHistory(
    @Param('id') id: string,
    @Body() dto: CreateStakeholderContactHistoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stakeholders.addContactHistory(id, dto, user.consultantId);
  }
}
