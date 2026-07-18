import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { CONTACT_TYPES } from '../../common/contact-types';

export class CreateCandidateContactHistoryDto {
  @ApiProperty({ description: 'How this contact happened', enum: CONTACT_TYPES, example: 'call' })
  @IsIn(CONTACT_TYPES)
  contactType!: string;

  @ApiPropertyOptional({ description: 'Notes from this contact' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'When this contact happened (ISO 8601); defaults to now if omitted — set explicitly to log a past contact',
    example: '2026-07-16T18:58:34.123Z',
  })
  @IsOptional()
  @IsISO8601()
  contactedAt?: string;
}
