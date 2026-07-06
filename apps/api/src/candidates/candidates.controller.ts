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
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get()
  findAll() {
    return this.candidates.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.candidates.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCandidateDto) {
    return this.candidates.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCandidateDto) {
    return this.candidates.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.candidates.remove(id);
  }
}
