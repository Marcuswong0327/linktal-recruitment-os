import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StakeholderRoleTypesService } from './stakeholder-role-types.service';
import { CreateStakeholderRoleTypeDto } from './dto/create-stakeholder-role-type.dto';
import { StakeholderRoleTypeEntity } from './entities/stakeholder-role-type.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Stakeholder Role Types')
@ApiBearerAuth()
@Controller('stakeholder-role-types')
export class StakeholderRoleTypesController {
  constructor(private readonly roleTypes: StakeholderRoleTypesService) {}

  @Get()
  @RequirePermission('stakeholder_role_type', 'read')
  @ApiOperation({ operationId: 'getStakeholderRoleTypes', summary: 'List active stakeholder role types' })
  @ApiResponse({
    status: 200,
    description: 'Active stakeholder role types',
    type: StakeholderRoleTypeEntity,
    isArray: true,
  })
  findAll() {
    return this.roleTypes.findAll();
  }

  @Post()
  @RequirePermission('stakeholder_role_type', 'create')
  @ApiOperation({
    operationId: 'createStakeholderRoleType',
    summary: 'Create a stakeholder role type, or return the existing one with that name',
  })
  @ApiResponse({
    status: 201,
    description: 'Role type created (or already existed)',
    type: StakeholderRoleTypeEntity,
  })
  create(@Body() dto: CreateStakeholderRoleTypeDto) {
    return this.roleTypes.create(dto);
  }
}
