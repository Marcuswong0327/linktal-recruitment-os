import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IndustriesService } from './industries.service';
import { CreateIndustryDto } from './dto/create-industry.dto';
import { UpdateIndustryDto } from './dto/update-industry.dto';
import { IndustryEntity } from './entities/industry.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Industries')
@ApiBearerAuth()
@Controller('industries')
export class IndustriesController {
  constructor(private readonly industries: IndustriesService) {}

  @Get()
  @RequirePermission('industry', 'read')
  @ApiOperation({ operationId: 'getIndustries', summary: 'List active industries' })
  @ApiResponse({ status: 200, description: 'Active industries', type: IndustryEntity, isArray: true })
  findAll() {
    return this.industries.findAll();
  }

  @Post()
  @RequirePermission('industry', 'create')
  @ApiOperation({
    operationId: 'createIndustry',
    summary: 'Create an industry, or return the existing one with that name',
  })
  @ApiResponse({ status: 201, description: 'Industry created (or already existed)', type: IndustryEntity })
  create(@Body() dto: CreateIndustryDto) {
    return this.industries.create(dto);
  }

  @Patch(':id')
  @RequirePermission('industry', 'update')
  @ApiOperation({ operationId: 'updateIndustry', summary: 'Rename an industry (admin, manager only)' })
  @ApiResponse({ status: 200, description: 'Industry updated', type: IndustryEntity })
  update(@Param('id') id: string, @Body() dto: UpdateIndustryDto) {
    return this.industries.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('industry', 'delete')
  @ApiOperation({
    operationId: 'deleteIndustry',
    summary:
      'Deactivate an industry — hides it from pickers without touching existing references (admin, manager only)',
  })
  @ApiResponse({ status: 204, description: 'Industry deactivated' })
  remove(@Param('id') id: string) {
    return this.industries.deactivate(id);
  }
}
