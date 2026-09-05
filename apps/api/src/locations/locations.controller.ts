import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { QueryLocationsDto } from './dto/query-locations.dto';
import { LocationEntity } from './entities/location.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @RequirePermission('location', 'read')
  @ApiOperation({
    operationId: 'getLocations',
    summary: 'Search or browse the Country / City Coverage tree',
  })
  @ApiResponse({ status: 200, description: 'Matching location nodes', type: LocationEntity, isArray: true })
  findAll(@Query() query: QueryLocationsDto) {
    return this.locations.findAll(query);
  }

  @Get(':id')
  @RequirePermission('location', 'read')
  @ApiOperation({ operationId: 'getLocation', summary: 'Get one location node by ID' })
  @ApiResponse({ status: 200, description: 'Location found', type: LocationEntity })
  findOne(@Param('id') id: string) {
    return this.locations.findOne(id);
  }

  // Admin-only by permission grant, not by a service guard: `location:create`
  // is seeded to admin alone (see prisma/seed.ts).
  @Post()
  @RequirePermission('location', 'create')
  @ApiOperation({
    operationId: 'createLocation',
    summary: 'Add a country or City Coverage value (admin only)',
  })
  @ApiResponse({ status: 201, description: 'Location created', type: LocationEntity })
  create(@Body() dto: CreateLocationDto) {
    return this.locations.create(dto);
  }

  @Patch(':id')
  @RequirePermission('location', 'update')
  @ApiOperation({
    operationId: 'updateLocation',
    summary: 'Rename or reparent a location (admin only; the 13 seeded rows are protected)',
  })
  @ApiResponse({ status: 200, description: 'Location updated', type: LocationEntity })
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.locations.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('location', 'delete')
  @ApiOperation({
    operationId: 'deleteLocation',
    summary: 'Delete a location (admin only; blocked if protected, has children, or is still in use)',
  })
  @ApiResponse({ status: 200, description: 'Location deleted' })
  remove(@Param('id') id: string) {
    return this.locations.remove(id);
  }
}
