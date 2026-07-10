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
import { JobOrdersService } from './job-orders.service';
import { CreateJobOrderDto } from './dto/create-job-order.dto';
import { UpdateJobOrderDto } from './dto/update-job-order.dto';
import { QueryJobOrdersDto } from './dto/query-job-orders.dto';
import { JobOrderEntity } from './entities/job-order.entity';
import { PaginatedJobOrdersEntity } from './entities/paginated-job-orders.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Job Orders')
@ApiBearerAuth()
@Controller('job-orders')
export class JobOrdersController {
  constructor(private readonly jobOrders: JobOrdersService) {}

  @Get()
  @RequirePermission('job_order', 'read')
  @ApiOperation({
    operationId: 'getJobOrders',
    summary: 'List job orders (paginated, filterable, sortable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated job orders', type: PaginatedJobOrdersEntity })
  findAll(@Query() query: QueryJobOrdersDto) {
    return this.jobOrders.findAll(query);
  }

  @Get('by-display-id/:displayId')
  @RequirePermission('job_order', 'read')
  @ApiOperation({ operationId: 'getJobOrderByDisplayId', summary: 'Get job order by display ID' })
  @ApiResponse({ status: 200, description: 'Job order found', type: JobOrderEntity })
  findByDisplayId(@Param('displayId') displayId: string) {
    return this.jobOrders.findByDisplayId(displayId);
  }

  @Get(':id')
  @RequirePermission('job_order', 'read')
  @ApiOperation({ operationId: 'getJobOrder', summary: 'Get job order by ID' })
  @ApiResponse({ status: 200, description: 'Job order found', type: JobOrderEntity })
  findOne(@Param('id') id: string) {
    return this.jobOrders.findOne(id);
  }

  @Post()
  @RequirePermission('job_order', 'create')
  @ApiOperation({ operationId: 'createJobOrder', summary: 'Create a new job order' })
  @ApiResponse({ status: 201, description: 'Job order created', type: JobOrderEntity })
  create(@Body() dto: CreateJobOrderDto) {
    return this.jobOrders.create(dto);
  }

  @Patch(':id')
  @RequirePermission('job_order', 'update')
  @ApiOperation({ operationId: 'updateJobOrder', summary: 'Update a job order' })
  @ApiResponse({ status: 200, description: 'Job order updated', type: JobOrderEntity })
  update(@Param('id') id: string, @Body() dto: UpdateJobOrderDto) {
    return this.jobOrders.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('job_order', 'delete')
  @ApiOperation({ operationId: 'deleteJobOrder', summary: 'Delete a job order' })
  @ApiResponse({ status: 204, description: 'Job order deleted' })
  remove(@Param('id') id: string) {
    return this.jobOrders.remove(id);
  }
}
