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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryRolesDto } from './dto/query-roles.dto';
import { RoleEntity } from './entities/role.entity';
import { PaginatedRolesEntity } from './entities/paginated-roles.entity';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';

/**
 * Role management. Admin has full CRUD; manager may CRUD every role except the
 * privileged `admin`/`manager` roles and can only grant permissions it holds
 * (both enforced in the service). Other roles get 403.
 */
@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission('role', 'read')
  @ApiOperation({ operationId: 'getRoles', summary: 'List roles with their permissions' })
  @ApiResponse({ status: 200, description: 'Paginated roles', type: PaginatedRolesEntity })
  findAll(@Query() query: QueryRolesDto) {
    return this.roles.findAll(query);
  }

  @Get(':id')
  @RequirePermission('role', 'read')
  @ApiOperation({ operationId: 'getRole', summary: 'Get a role by ID' })
  @ApiResponse({ status: 200, description: 'Role found', type: RoleEntity })
  findOne(@Param('id') id: string) {
    return this.roles.findOne(id);
  }

  @Post()
  @RequirePermission('role', 'create')
  @ApiOperation({ operationId: 'createRole', summary: 'Create a new role' })
  @ApiResponse({ status: 201, description: 'Role created', type: RoleEntity })
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthUser) {
    return this.roles.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('role', 'update')
  @ApiOperation({ operationId: 'updateRole', summary: 'Update a role (name, description, permissions)' })
  @ApiResponse({ status: 200, description: 'Role updated', type: RoleEntity })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() user: AuthUser) {
    return this.roles.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('role', 'delete')
  @ApiOperation({
    operationId: 'deleteRole',
    summary:
      'Delete a custom role (built-ins protected). If consultants hold it, pass ?reassignTo=<roleId> to move them to a fallback role first.',
  })
  @ApiQuery({ name: 'reassignTo', required: false, description: 'Role id to move holders to before deleting' })
  @ApiResponse({ status: 204, description: 'Role deleted' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('reassignTo') reassignTo?: string,
  ) {
    return this.roles.remove(id, user, reassignTo);
  }
}
