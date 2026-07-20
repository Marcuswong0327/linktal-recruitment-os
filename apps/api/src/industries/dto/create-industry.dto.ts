import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateIndustryDto {
  @ApiProperty({ description: 'Industry name', example: 'Manufacturing' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
