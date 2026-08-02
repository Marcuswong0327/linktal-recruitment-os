import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StakeholderRoleTypesService } from './stakeholder-role-types.service';
import { CreateStakeholderRoleTypeDto } from './dto/create-stakeholder-role-type.dto';
import { QueryStakeholderRoleTypesDto } from './dto/query-stakeholder-role-types.dto';
import { StakeholderRoleTypeEntity } from './entities/stakeholder-role-type.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Stakeholder Role Types')
@ApiBearerAuth()
@Controller('stakeholder-role-types')
export class StakeholderRoleTypesController {
  constructor(private readonly stakeholderRoleTypes: StakeholderRoleTypesService) {}

  @Get()
  @RequirePermission('stakeholder_role_type', 'read')
  @ApiOperation({ operationId: 'getStakeholderRoleTypes', summary: 'List active stakeholder role types (searchable, capped)' })
  @ApiResponse({ status: 200, description: 'Active stakeholder role types', type: StakeholderRoleTypeEntity, isArray: true })
  findAll(@Query() query: QueryStakeholderRoleTypesDto) {
    return this.stakeholderRoleTypes.findAll(query);
  }

  @Post()
  @RequirePermission('stakeholder_role_type', 'create')
  @ApiOperation({
    operationId: 'createStakeholderRoleType',
    summary: 'Create a stakeholder role type entry, or return the existing one with that name',
  })
  @ApiResponse({ status: 201, description: 'Created (or already existed)', type: StakeholderRoleTypeEntity })
  create(@Body() dto: CreateStakeholderRoleTypeDto) {
    return this.stakeholderRoleTypes.create(dto);
  }
}
