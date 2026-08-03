import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ClientQuality, ClientStatus } from '@prisma/client';

export class CreateClientDto {
  @ApiProperty({ description: 'Company name', example: 'Acme Corp' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  companyName!: string;

  // Required — the industry arm of the scope resolver relies on this never
  // being null (see the SCOPING note in schema.prisma). Specialization is the
  // optional narrowing within it.
  @ApiProperty({ description: 'Industry ID (see /industries)' })
  @IsString()
  industryId!: string;

  @ApiPropertyOptional({ description: 'Specialization ID (see /specializations)' })
  @IsOptional()
  @IsString()
  specializationId?: string;

  @ApiProperty({
    description:
      "Location nodes this client hires from — its market, not its office address. At least one is required (country level at minimum); mixed granularity is fine.",
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  locationIds!: string[];

  @ApiPropertyOptional({
    description: "The client's own physical office address(es) — distinct from `locationIds` above",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  addresses?: string[];

  @ApiPropertyOptional({
    description: "The client's own office suburb/postcode(s) — same distinction as `addresses`",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suburbsAndPostcodes?: string[];

  @ApiPropertyOptional({ description: 'Website URL', example: 'https://acme.com' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ description: 'Seek / Job Street job market URL' })
  @IsOptional()
  @IsUrl()
  seekJobMarketUrl?: string;

  @ApiPropertyOptional({ description: 'LinkedIn job market URL' })
  @IsOptional()
  @IsUrl()
  linkedinJobMarketUrl?: string;

  @ApiPropertyOptional({ description: 'General description of the company' })
  @IsOptional()
  @IsString()
  generalDescription?: string;

  @ApiPropertyOptional({ description: 'Status; defaults to COLD when omitted', enum: ClientStatus, example: 'COLD' })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional({ description: 'Lead quality; defaults to MEDIUM when omitted', enum: ClientQuality, example: 'MEDIUM' })
  @IsOptional()
  @IsEnum(ClientQuality)
  quality?: ClientQuality;

  @ApiPropertyOptional({ description: 'Owning consultant ID' })
  @IsOptional()
  @IsString()
  consultantId?: string;
}
