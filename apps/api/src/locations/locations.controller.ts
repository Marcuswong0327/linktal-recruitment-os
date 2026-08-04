import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
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
    summary: 'Search or browse the geography tree (capped; filterable by name, level, parent or subtree)',
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
  // is seeded to admin alone (see prisma/seed.ts). Unlike the combobox
  // catalogs, this tree is read by the scope resolver, so a hand-typed
  // near-duplicate would silently change who can see what.
  @Post()
  @RequirePermission('location', 'create')
  @ApiOperation({
    operationId: 'createLocation',
    summary: 'Add a location node (admin only — the tree is normally bulk-loaded from GeoNames)',
  })
  @ApiResponse({ status: 201, description: 'Location created', type: LocationEntity })
  create(@Body() dto: CreateLocationDto) {
    return this.locations.create(dto);
  }
}
