import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlacementsService } from './placements.service';
import { CreatePlacementDto } from './dto/create-placement.dto';
import { UpdatePlacementDto } from './dto/update-placement.dto';
import { QueryPlacementsDto } from './dto/query-placements.dto';
import { PlacementEntity } from './entities/placement.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Placements')
@ApiBearerAuth()
@Controller('placements')
export class PlacementsController {
  constructor(private readonly placements: PlacementsService) {}

  @Get()
  @RequirePermission('placement', 'read')
  @ApiOperation({ operationId: 'getPlacements', summary: 'List placements, filtered by submissionId and/or jobOrderId' })
  @ApiResponse({ status: 200, description: 'Placements', type: PlacementEntity, isArray: true })
  findAll(@Query() query: QueryPlacementsDto) {
    return this.placements.findAll(query);
  }

  @Get(':id')
  @RequirePermission('placement', 'read')
  @ApiOperation({ operationId: 'getPlacement', summary: 'Get placement by ID' })
  @ApiResponse({ status: 200, description: 'Placement found', type: PlacementEntity })
  findOne(@Param('id') id: string) {
    return this.placements.findOne(id);
  }

  @Post()
  @RequirePermission('placement', 'create')
  @ApiOperation({
    operationId: 'createPlacement',
    summary:
      'Create a placement for a submission — auto-calculates totalPackage/feeValue/guaranteeEndDate, and marks the candidate Placed, the job order Placed (once fully filled), and the client Traded (on their first placement)',
  })
  @ApiResponse({ status: 201, description: 'Placement created', type: PlacementEntity })
  create(@Body() dto: CreatePlacementDto) {
    return this.placements.create(dto);
  }

  @Patch(':id')
  @RequirePermission('placement', 'update')
  @ApiOperation({ operationId: 'updatePlacement', summary: 'Update a placement' })
  @ApiResponse({ status: 200, description: 'Placement updated', type: PlacementEntity })
  update(@Param('id') id: string, @Body() dto: UpdatePlacementDto) {
    return this.placements.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('placement', 'delete')
  @ApiOperation({ operationId: 'deletePlacement', summary: 'Remove a placement (soft-delete, recoverable)' })
  @ApiResponse({ status: 204, description: 'Placement removed' })
  remove(@Param('id') id: string) {
    return this.placements.remove(id);
  }
}
