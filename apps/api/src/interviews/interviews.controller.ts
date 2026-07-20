import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InterviewsService } from './interviews.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { UpdateInterviewDto } from './dto/update-interview.dto';
import { QueryInterviewsDto } from './dto/query-interviews.dto';
import { InterviewEntity } from './entities/interview.entity';
import { RequirePermission } from '../auth/auth.decorators';

// Interview rounds are a sub-resource of a submission (same pattern as
// stakeholder/candidate contact-history) — gated under the existing
// `submission` permission rather than adding a new RBAC resource.
@ApiTags('Interviews')
@ApiBearerAuth()
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get()
  @RequirePermission('submission', 'read')
  @ApiOperation({ operationId: 'getInterviews', summary: 'List interview rounds, filtered by submissionId' })
  @ApiResponse({ status: 200, description: 'Interview rounds, earliest first', type: InterviewEntity, isArray: true })
  findAll(@Query() query: QueryInterviewsDto) {
    return this.interviews.findAll(query);
  }

  @Get(':id')
  @RequirePermission('submission', 'read')
  @ApiOperation({ operationId: 'getInterview', summary: 'Get interview round by ID' })
  @ApiResponse({ status: 200, description: 'Interview round found', type: InterviewEntity })
  findOne(@Param('id') id: string) {
    return this.interviews.findOne(id);
  }

  @Post()
  @RequirePermission('submission', 'update')
  @ApiOperation({ operationId: 'createInterview', summary: 'Add an interview round to a submission' })
  @ApiResponse({ status: 201, description: 'Interview round created', type: InterviewEntity })
  create(@Body() dto: CreateInterviewDto) {
    return this.interviews.create(dto);
  }

  @Patch(':id')
  @RequirePermission('submission', 'update')
  @ApiOperation({ operationId: 'updateInterview', summary: 'Update an interview round (e.g. record its outcome)' })
  @ApiResponse({ status: 200, description: 'Interview round updated', type: InterviewEntity })
  update(@Param('id') id: string, @Body() dto: UpdateInterviewDto) {
    return this.interviews.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('submission', 'update')
  @ApiOperation({ operationId: 'deleteInterview', summary: 'Remove an interview round (soft-delete, recoverable)' })
  @ApiResponse({ status: 204, description: 'Interview round removed' })
  remove(@Param('id') id: string) {
    return this.interviews.remove(id);
  }
}
