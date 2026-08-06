import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SpecializationsService } from './specializations.service';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { QuerySpecializationsDto } from './dto/query-specializations.dto';
import { SpecializationEntity } from './entities/specialization.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Specializations')
@ApiBearerAuth()
@Controller('specializations')
export class SpecializationsController {
  constructor(private readonly specializations: SpecializationsService) {}

  @Get()
  @RequirePermission('specialization', 'read')
  @ApiOperation({ operationId: 'getSpecializations', summary: 'List active specializations (optionally searched/capped)' })
  @ApiResponse({
    status: 200,
    description: 'Active specializations',
    type: SpecializationEntity,
    isArray: true,
  })
  findAll(@Query() query: QuerySpecializationsDto) {
    return this.specializations.findAll(query);
  }

  @Get(':id')
  @RequirePermission('specialization', 'read')
  @ApiOperation({
    operationId: 'getSpecialization',
    summary: 'Get one specialization by id — resolves a selected id back to a name for a search-driven picker that has since scrolled it out of its results',
  })
  @ApiResponse({ status: 200, description: 'Specialization found', type: SpecializationEntity })
  findOne(@Param('id') id: string) {
    return this.specializations.findOne(id);
  }

  @Post()
  @RequirePermission('specialization', 'create')
  @ApiOperation({
    operationId: 'createSpecialization',
    summary: 'Create a specialization, or return the existing one with that name',
  })
  @ApiResponse({
    status: 201,
    description: 'Specialization created (or already existed)',
    type: SpecializationEntity,
  })
  create(@Body() dto: CreateSpecializationDto) {
    return this.specializations.create(dto);
  }
}
