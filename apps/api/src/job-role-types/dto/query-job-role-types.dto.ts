import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryJobRoleTypesDto {
  @ApiPropertyOptional({
    description: 'Filter by name (contains, case-insensitive) — what the combobox types into',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Maximum rows to return. The catalog grows with use, so the picker asks for a page rather than all of it.',
    minimum: 1,
    maximum: 200,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take: number = 50;
}
