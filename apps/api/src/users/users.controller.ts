import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { UsersService } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';
import { PaginatedUsersEntity } from './entities/paginated-users.entity';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('user', 'read')
  @ApiOperation({ operationId: 'getUsers', summary: 'List users (paginated, filterable, sortable)' })
  @ApiResponse({ status: 200, description: 'Paginated users', type: PaginatedUsersEntity })
  findAll(@Query() query: QueryUsersDto) {
    return this.users.findAll(query);
  }

  @Patch(':id')
  @RequirePermission('user', 'update')
  @ApiOperation({ operationId: 'updateUser', summary: "Update a user's role and/or active status" })
  @ApiResponse({ status: 200, description: 'User updated', type: UserEntity })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() currentUser: AuthUser) {
    return this.users.update(id, dto, currentUser.consultantId);
  }
}
