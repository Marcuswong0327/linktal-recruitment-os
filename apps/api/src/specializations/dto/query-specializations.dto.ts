import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QuerySpecializationsDto {
  @ApiPropertyOptional({
    description: 'Filter by name (contains, case-insensitive) — what the combobox types into',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description:
      "Maximum rows to return, for a search-driven picker that asks for a page matching what's been typed. " +
      'Omit for the full catalog (775+ rows) — existing pickers (candidate/consultant specialization editors) rely on getting everything back, so this only limits when a caller opts in.',
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
