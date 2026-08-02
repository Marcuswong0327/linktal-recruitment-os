import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSpecializationDto {
  @ApiProperty({ description: 'Specialization name', example: 'Food - Bakery' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Industry this specialization belongs to. Names are unique per-industry, not globally.',
  })
  @IsString()
  industryId!: string;

  @ApiPropertyOptional({
    description:
      'Parent category, e.g. the id of "Food" when creating "Food - Bakery". Omit to create a top-level category.',
  })
  @IsOptional()
  @IsString()
  parentId?: string;
}
