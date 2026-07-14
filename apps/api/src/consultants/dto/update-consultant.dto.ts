import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateConsultantDto } from './create-consultant.dto';

/** The 6 RBAC roles seeded in prisma/seed.ts. */
export enum ConsultantRoleName {
  admin = 'admin',
  manager = 'manager',
  consultant = 'consultant',
  finance = 'finance',
  researcher = 'researcher',
  viewer = 'viewer',
}

export class UpdateConsultantDto extends PartialType(CreateConsultantDto) {
  /**
   * Assign a role by name (resolved to roleId server-side). Convenience for the
   * admin UI, which works in role names; `roleId` from CreateConsultantDto still
   * works too. Changing a role is admin-only (enforced in the service).
   */
  @ApiPropertyOptional({ enum: ConsultantRoleName })
  @IsOptional()
  @IsEnum(ConsultantRoleName)
  roleName?: ConsultantRoleName;
}
