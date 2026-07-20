import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CandidateRoleTypesService } from './candidate-role-types.service';
import { CreateCandidateRoleTypeDto } from './dto/create-candidate-role-type.dto';
import { CandidateRoleTypeEntity } from './entities/candidate-role-type.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Candidate Role Types')
@ApiBearerAuth()
@Controller('candidate-role-types')
export class CandidateRoleTypesController {
  constructor(private readonly roleTypes: CandidateRoleTypesService) {}

  @Get()
  @RequirePermission('candidate_role_type', 'read')
  @ApiOperation({ operationId: 'getCandidateRoleTypes', summary: 'List active candidate role types' })
  @ApiResponse({
    status: 200,
    description: 'Active candidate role types',
    type: CandidateRoleTypeEntity,
    isArray: true,
  })
  findAll() {
    return this.roleTypes.findAll();
  }

  @Post()
  @RequirePermission('candidate_role_type', 'create')
  @ApiOperation({
    operationId: 'createCandidateRoleType',
    summary: 'Create a candidate role type, or return the existing one with that name',
  })
  @ApiResponse({
    status: 201,
    description: 'Role type created (or already existed)',
    type: CandidateRoleTypeEntity,
  })
  create(@Body() dto: CreateCandidateRoleTypeDto) {
    return this.roleTypes.create(dto);
  }
}
