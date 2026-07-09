import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@ApiTags('Candidates')
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all candidates' })
  @ApiResponse({ status: 200, description: 'List of candidates' })
  findAll() {
    return this.candidates.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get candidate by ID' })
  @ApiResponse({ status: 200, description: 'Candidate found' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  findOne(@Param('id') id: string) {
    return this.candidates.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new candidate' })
  @ApiResponse({ status: 201, description: 'Candidate created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  create(@Body() dto: CreateCandidateDto) {
    return this.candidates.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a candidate' })
  @ApiResponse({ status: 200, description: 'Candidate updated' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  update(@Param('id') id: string, @Body() dto: UpdateCandidateDto) {
    return this.candidates.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a candidate' })
  @ApiResponse({ status: 204, description: 'Candidate deleted' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  remove(@Param('id') id: string) {
    return this.candidates.remove(id);
  }
}
