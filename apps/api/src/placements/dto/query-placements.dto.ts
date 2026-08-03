import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryPlacementsDto {
  @ApiPropertyOptional({ description: 'Filter by submission ID' })
  @IsOptional()
  @IsString()
  submissionId?: string;

  @ApiPropertyOptional({ description: 'Filter by job order ID' })
  @IsOptional()
  @IsString()
  jobOrderId?: string;
}
