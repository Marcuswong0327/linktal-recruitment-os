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
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { QueryCandidatesDto } from './dto/query-candidates.dto';
import { CandidateEntity } from './entities/candidate.entity';
import { PaginatedCandidatesEntity } from './entities/paginated-candidates.entity';
import { RequirePermission } from '../auth/auth.decorators';

@ApiTags('Candidates')
@ApiBearerAuth()
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get()
  @RequirePermission('candidate', 'read')
  @ApiOperation({
    operationId: 'getCandidates',
    summary: 'List candidates (paginated, filterable, sortable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated candidates', type: PaginatedCandidatesEntity })
  findAll(@Query() query: QueryCandidatesDto) {
    return this.candidates.findAll(query);
  }

  @Get('by-display-id/:displayId')
  @RequirePermission('candidate', 'read')
  @ApiOperation({ operationId: 'getCandidateByDisplayId', summary: 'Get candidate by display ID (CDD-XXXX)' })
  @ApiResponse({ status: 200, description: 'Candidate found', type: CandidateEntity })
  findByDisplayId(@Param('displayId') displayId: string) {
    return this.candidates.findByDisplayId(displayId);
  }

  @Get(':id')
  @RequirePermission('candidate', 'read')
  @ApiOperation({ operationId: 'getCandidate', summary: 'Get candidate by ID' })
  @ApiResponse({ status: 200, description: 'Candidate found', type: CandidateEntity })
  findOne(@Param('id') id: string) {
    return this.candidates.findOne(id);
  }

  @Post()
  @RequirePermission('candidate', 'create')
  @ApiOperation({ operationId: 'createCandidate', summary: 'Create a new candidate' })
  @ApiResponse({ status: 201, description: 'Candidate created', type: CandidateEntity })
  create(@Body() dto: CreateCandidateDto) {
    return this.candidates.create(dto);
  }

  @Patch(':id')
  @RequirePermission('candidate', 'update')
  @ApiOperation({ operationId: 'updateCandidate', summary: 'Update a candidate' })
  @ApiResponse({ status: 200, description: 'Candidate updated', type: CandidateEntity })
  update(@Param('id') id: string, @Body() dto: UpdateCandidateDto) {
    return this.candidates.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('candidate', 'delete')
  @ApiOperation({ operationId: 'deleteCandidate', summary: 'Delete a candidate' })
  @ApiResponse({ status: 204, description: 'Candidate deleted' })
  remove(@Param('id') id: string) {
    return this.candidates.remove(id);
  }
}
