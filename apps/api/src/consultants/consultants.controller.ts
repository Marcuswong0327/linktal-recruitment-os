import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConsultantsService } from './consultants.service';
import { CreateConsultantDto } from './dto/create-consultant.dto';
import { UpdateConsultantDto } from './dto/update-consultant.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { QueryConsultantsDto } from './dto/query-consultants.dto';
import { ConsultantEntity } from './entities/consultant.entity';
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
  findAll(@Query() query: QueryConsultantsDto) {
    return this.consultants.findAll(query);
  }

  @Get('me')
  @ApiOperation({ operationId: 'getMe', summary: 'Get my own consultant profile (any authenticated user)' })
  @ApiResponse({ status: 200, description: 'Current consultant', type: ConsultantEntity })
  getMe(@CurrentUser() user: AuthUser) {
    return this.consultants.findOne(user.consultantId);
  }

  @Patch('me')
  @ApiOperation({ operationId: 'updateMe', summary: 'Update my own name (cannot change role or active status)' })
  @ApiResponse({ status: 200, description: 'Profile updated', type: ConsultantEntity })
  updateMe(@Body() dto: UpdateMeDto, @CurrentUser() user: AuthUser) {
    return this.consultants.updateOwnProfile(user.consultantId, dto.fullName);
  }

  @Get('by-display-id/:displayId')
  @RequirePermission('consultant', 'read')
  @ApiOperation({ operationId: 'getConsultantByDisplayId', summary: 'Get consultant by display ID (consultant-XXXX)' })
  @ApiResponse({ status: 200, description: 'Consultant found', type: ConsultantEntity })
  findByDisplayId(@Param('displayId') displayId: string) {
    return this.consultants.findByDisplayId(displayId);
  }

  @Get(':id')
  @RequirePermission('consultant', 'read')
  @ApiOperation({ operationId: 'getConsultant', summary: 'Get consultant by ID' })
  @ApiResponse({ status: 200, description: 'Consultant found', type: ConsultantEntity })
  findOne(@Param('id') id: string) {
    return this.consultants.findOne(id);
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
}
