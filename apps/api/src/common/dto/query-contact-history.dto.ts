import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Shared by every entity's `GET .../contact-history` route — same "recent N, newest first" shape regardless of entity. */
export class QueryContactHistoryDto {
  @ApiPropertyOptional({
    description: 'Most recent rows to return, newest first. The caller only needs to pass this to see further back.',
    minimum: 1,
    maximum: 200,
    default: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 5;
}
