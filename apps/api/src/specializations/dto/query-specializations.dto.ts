import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const toArray = ({ value }: { value: unknown }) => (Array.isArray(value) ? value : value === undefined ? value : [value]);

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
      'Omit for the full catalog (775+ rows) — a search-driven picker opts into the capped/filtered form explicitly.',
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;

  @ApiPropertyOptional({
    description:
      'Narrow to specialization(s) under one or more industries (exact match on Specialization.industryId) — e.g. a picker only offering specializations under industries a consultant already holds, or under the industry chosen elsewhere in the same form.',
    type: [String],
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  industryIds?: string[];
}
