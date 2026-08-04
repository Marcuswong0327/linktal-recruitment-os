import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SpecializationsService } from './specializations.service';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { UpdateSpecializationDto } from './dto/update-specialization.dto';
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

  @Patch(':id')
  @RequirePermission('specialization', 'update')
  @ApiOperation({ operationId: 'updateSpecialization', summary: 'Rename a specialization (admin, manager only)' })
  @ApiResponse({ status: 200, description: 'Specialization updated', type: SpecializationEntity })
  update(@Param('id') id: string, @Body() dto: UpdateSpecializationDto) {
    return this.specializations.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('specialization', 'delete')
  @ApiOperation({
    operationId: 'deleteSpecialization',
    summary:
      'Deactivate a specialization — hides it from pickers without touching existing references (admin, manager only)',
  })
  @ApiResponse({ status: 204, description: 'Specialization deactivated' })
  remove(@Param('id') id: string) {
    return this.specializations.deactivate(id);
  }
}
