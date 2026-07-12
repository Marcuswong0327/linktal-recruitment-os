import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Self-service profile edit. Intentionally limited to non-privileged fields —
 * a user can never change their own role or active status here.
 */
export class UpdateMeDto {
  @ApiProperty({ description: 'Your display name', example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName!: string;
}
