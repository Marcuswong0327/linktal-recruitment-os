import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConsultantsService } from './consultants.service';
import { CreateConsultantDto } from './dto/create-consultant.dto';
import { UpdateConsultantDto } from './dto/update-consultant.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { QueryConsultantsDto } from './dto/query-consultants.dto';
import { SetConsultantIndustriesDto } from './dto/set-consultant-industries.dto';
import { SetConsultantSpecializationsDto } from './dto/set-consultant-specializations.dto';
import { SetConsultantLocationsDto } from './dto/set-consultant-locations.dto';
import { ConsultantEntity } from './entities/consultant.entity';
import { ConsultantNodeEntity } from './entities/consultant-node.entity';
import { PaginatedConsultantsEntity } from './entities/paginated-consultants.entity';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';

/**
 * Consultant directory. Guarded by the `consultant` permission, which only
 * admin and manager hold — every other role gets 403 Forbidden.
 */
@ApiTags('Consultants')
@ApiBearerAuth()
@Controller('consultants')
export class ConsultantsController {
  constructor(private readonly consultants: ConsultantsService) {}

  @Get()
  @RequirePermission('consultant', 'read')
  @ApiOperation({
    operationId: 'getConsultants',
    summary: 'List consultants (paginated, filterable, sortable) — admin/manager only',
  })
  @ApiResponse({ status: 200, description: 'Paginated consultants', type: PaginatedConsultantsEntity })
  findAll(@Query() query: QueryConsultantsDto, @CurrentUser() user: AuthUser) {
    return this.consultants.findAll(query, user);
  }

  // Declared before `:id` — Nest matches routes in declaration order, so a
  // literal segment registered after a param route would never be reached.
  @Get('hierarchy')
  @RequirePermission('consultant', 'read')
  @ApiOperation({
    operationId: 'getConsultantHierarchy',
    summary:
      'Org chart, or one person’s team. Presentation only — reporting lines are never a permission boundary (see docs/rbac-roles.md §3).',
  })
  @ApiQuery({
    name: 'rootId',
    required: false,
    description:
      'Return only this consultant and everyone beneath them ("my team"). Omit for the whole chart, rooted at everyone with no manager.',
  })
  @ApiResponse({ status: 200, description: 'Flat list, depth-ordered', type: ConsultantNodeEntity, isArray: true })
  hierarchy(@Query('rootId') rootId?: string) {
    return this.consultants.hierarchy(rootId);
  }

  @Get('me')
  @ApiOperation({ operationId: 'getMe', summary: 'Get my own consultant profile (any authenticated user)' })
  @ApiResponse({ status: 200, description: 'Current consultant', type: ConsultantEntity })
  getMe(@CurrentUser() user: AuthUser) {
    return this.consultants.findOne(user.consultantId, user);
  }

  @Patch('me')
  @ApiOperation({ operationId: 'updateMe', summary: 'Update my own name (cannot change role or active status)' })
  @ApiResponse({ status: 200, description: 'Profile updated', type: ConsultantEntity })
  updateMe(@Body() dto: UpdateMeDto, @CurrentUser() user: AuthUser) {
    return this.consultants.updateOwnProfile(user.consultantId, dto.fullName, user);
  }

  @Get('by-display-id/:displayId')
  @RequirePermission('consultant', 'read')
  @ApiOperation({ operationId: 'getConsultantByDisplayId', summary: 'Get consultant by display ID (consultant-XXXX)' })
  @ApiResponse({ status: 200, description: 'Consultant found', type: ConsultantEntity })
  findByDisplayId(@Param('displayId') displayId: string, @CurrentUser() user: AuthUser) {
    return this.consultants.findByDisplayId(displayId, user);
  }

  @Get(':id')
  @RequirePermission('consultant', 'read')
  @ApiOperation({ operationId: 'getConsultant', summary: 'Get consultant by ID' })
  @ApiResponse({ status: 200, description: 'Consultant found', type: ConsultantEntity })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.consultants.findOne(id, user);
  }

  @Post()
  @RequirePermission('consultant', 'create')
  @ApiOperation({ operationId: 'createConsultant', summary: 'Create a new consultant' })
  @ApiResponse({ status: 201, description: 'Consultant created', type: ConsultantEntity })
  create(@Body() dto: CreateConsultantDto, @CurrentUser() user: AuthUser) {
    return this.consultants.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('consultant', 'update')
  @ApiOperation({ operationId: 'updateConsultant', summary: 'Update a consultant' })
  @ApiResponse({ status: 200, description: 'Consultant updated', type: ConsultantEntity })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateConsultantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consultants.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('consultant', 'delete')
  @ApiOperation({
    operationId: 'deleteConsultant',
    summary: 'Deactivate a consultant (soft — sets isActive=false, blocks login)',
  })
  @ApiResponse({ status: 204, description: 'Consultant deactivated' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.consultants.remove(id, user);
  }

  @Put(':id/industries')
  @RequirePermission('consultant_industry', 'update')
  @ApiOperation({
    operationId: 'setConsultantIndustries',
    summary: "Replace a consultant's assigned industries (admin/manager only; self/peer-manager escalation rules enforced in the service)",
  })
  @ApiResponse({ status: 200, description: 'Industries updated', type: ConsultantEntity })
  setIndustries(
    @Param('id') id: string,
    @Body() dto: SetConsultantIndustriesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consultants.setIndustries(id, dto.industryIds, user);
  }

  @Put(':id/specializations')
  @RequirePermission('consultant_specialization', 'update')
  @ApiOperation({
    operationId: 'setConsultantSpecializations',
    summary:
      "Replace a consultant's assigned specializations, narrowing their industry arm (admin/manager only; same escalation rules as industries)",
  })
  @ApiResponse({ status: 200, description: 'Specializations updated', type: ConsultantEntity })
  setSpecializations(
    @Param('id') id: string,
    @Body() dto: SetConsultantSpecializationsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consultants.setSpecializations(id, dto.specializationIds, user);
  }

  @Put(':id/locations')
  @RequirePermission('consultant_location', 'update')
  @ApiOperation({
    operationId: 'setConsultantLocations',
    summary:
      "Replace a consultant's assigned locations — their patch (admin/manager only; same escalation rules as industries)",
  })
  @ApiResponse({ status: 200, description: 'Locations updated', type: ConsultantEntity })
  setLocations(
    @Param('id') id: string,
    @Body() dto: SetConsultantLocationsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consultants.setLocations(id, dto.locationIds, user);
  }
}
