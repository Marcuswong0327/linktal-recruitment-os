import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryInterviewsDto {
  @ApiPropertyOptional({ description: 'Filter by submission ID' })
  @IsOptional()
  @IsString()
  submissionId?: string;
}
