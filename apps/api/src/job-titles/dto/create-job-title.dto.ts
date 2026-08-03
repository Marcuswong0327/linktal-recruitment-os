import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateJobTitleDto {
  @ApiProperty({ description: 'JobTitle name', example: 'Production Manager' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
