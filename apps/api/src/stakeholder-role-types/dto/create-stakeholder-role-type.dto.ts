import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateStakeholderRoleTypeDto {
  @ApiProperty({ description: 'Role type name', example: 'Hiring Manager' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
