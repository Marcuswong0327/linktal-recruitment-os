import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCandidateRoleTypeDto {
  @ApiProperty({ description: 'Role type name', example: 'Permanent' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
