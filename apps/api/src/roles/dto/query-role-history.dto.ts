import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryRoleHistoryDto {
  @ApiPropertyOptional({
    description:
      'Most recent saved versions to return, newest first. The caller only needs to pass this to see further back — every save already left a full, restorable snapshot in AuditLog.',
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
