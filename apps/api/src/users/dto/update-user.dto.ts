import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

/** The 6 RBAC roles seeded in prisma/seed.ts. */
export enum ConsultantRoleName {
  admin = 'admin',
  manager = 'manager',
  consultant = 'consultant',
  finance = 'finance',
  researcher = 'researcher',
  viewer = 'viewer',
}

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: ConsultantRoleName })
  @IsOptional()
  @IsEnum(ConsultantRoleName)
  roleName?: ConsultantRoleName;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
