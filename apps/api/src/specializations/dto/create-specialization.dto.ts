import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSpecializationDto {
  @ApiProperty({ description: 'Specialization name', example: 'Blockchain Services' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
