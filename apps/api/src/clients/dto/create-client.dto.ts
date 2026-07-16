import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ClientStatus } from '@prisma/client';

export class CreateClientDto {
  @ApiProperty({ description: 'Company name', example: 'Acme Corp' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  companyName!: string;

  @ApiPropertyOptional({ description: 'Industry', example: 'Manufacturing' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ description: 'Specialization', example: 'Heavy Machinery' })
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiPropertyOptional({ description: 'Country', example: 'Australia' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Brisbane' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Website URL', example: 'https://acme.com' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ description: 'Terms of Business signed', default: false })
  @IsOptional()
  @IsBoolean()
  tobSigned?: boolean;

  @ApiPropertyOptional({ description: 'Fee as percentage of package (null until agreed)', example: 15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  feePercentage?: number;

  @ApiPropertyOptional({ description: 'Guarantee period in days', example: 90, default: 90 })
  @IsOptional()
  @IsInt()
  @Min(0)
  guaranteePeriod?: number;

  @ApiPropertyOptional({ description: 'Status; defaults to COLD when omitted', enum: ClientStatus, example: 'COLD' })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Owning consultant ID' })
  @IsOptional()
  @IsString()
  consultantId?: string;
}
