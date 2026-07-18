import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCandidateSavedSearchDto {
  @ApiProperty({ description: 'Display name for this saved search', example: 'IT contractors in Sydney' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Serialized filter state (same shape as the GET /candidates query params)',
    type: Object,
    example: { industryIds: ['abc123'], statuses: ['WARM'], q: 'Sydney' },
  })
  @IsObject()
  filters!: Record<string, unknown>;
}
