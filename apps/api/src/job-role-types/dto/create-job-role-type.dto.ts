import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateJobRoleTypeDto {
  @ApiProperty({ description: 'JobRoleType name', example: 'CNC Machinist' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
