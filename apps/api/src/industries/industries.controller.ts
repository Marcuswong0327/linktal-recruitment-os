import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IndustriesService } from './industries.service';
import { CreateIndustryDto } from './dto/create-industry.dto';
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
}
