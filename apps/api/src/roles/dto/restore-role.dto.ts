import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RestoreRoleDto {
  @ApiProperty({ description: "AuditLog row id (from GET .../history) to restore this role's name/description/permissions to" })
  @IsString()
  auditLogId!: string;
}
