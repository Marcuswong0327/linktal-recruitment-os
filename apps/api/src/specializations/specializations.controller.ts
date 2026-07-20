import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SpecializationsService } from './specializations.service';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { SpecializationEntity } from './entities/specialization.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Specializations')
@ApiBearerAuth()
@Controller('specializations')
export class SpecializationsController {
  constructor(private readonly specializations: SpecializationsService) {}

  @Get()
  @RequirePermission('specialization', 'read')
  @ApiOperation({ operationId: 'getSpecializations', summary: 'List active specializations' })
  @ApiResponse({
    status: 200,
    description: 'Active specializations',
    type: SpecializationEntity,
    isArray: true,
  })
  findAll() {
    return this.specializations.findAll();
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
