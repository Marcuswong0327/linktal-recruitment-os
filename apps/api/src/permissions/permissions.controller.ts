import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { PermissionEntity } from './entities/permission.entity';
import { RequirePermission } from '../auth/auth.decorators';

/**
 * Read-only catalog of permissions, used to populate the role editor's picker.
 * The catalog itself is defined in the seed — there are no write endpoints.
 */
@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  @RequirePermission('permission', 'read')
  @ApiOperation({ operationId: 'getPermissions', summary: 'List all permissions' })
  @ApiResponse({ status: 200, description: 'All permissions', type: PermissionEntity, isArray: true })
  findAll() {
    return this.permissions.findAll();
  }
}
