import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateStakeholderRoleTypeDto {
  @ApiProperty({ description: 'StakeholderRoleType name', example: 'Procurement' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
