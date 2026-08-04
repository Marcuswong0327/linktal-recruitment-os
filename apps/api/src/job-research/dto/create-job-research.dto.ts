import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * A row of public market research — a job ad found online, logged against the
 * company advertising it. Deliberately *not* a JobOrder: this is information
 * Linktal went and found, not a brief a client has given them (see the
 * recruitment workflow in CLAUDE.md). A JobOrder may later link back to the
 * research row it originated from.
 *
 * Catalog fields arrive as ids only — a title new to the catalog goes through
 * `POST /job-titles` first, same rule as JobOrder and Stakeholder. Nothing here
 * grows a catalog on the way past.
 *
 * `lastContactedById` is absent by design: attribution comes from the caller's
 * own session via `POST /job-research/:id/mark-contacted`, never the body.
 */
export class CreateJobResearchDto {
  @ApiProperty({ description: 'Client ID the ad was placed by' })
  @IsString()
  clientId!: string;

  @ApiPropertyOptional({
    description:
      'Consultant who conducted the research. Usually a researcher, but not restricted to that role.',
  })
  @IsOptional()
  @IsString()
  consultantId?: string;

  @ApiPropertyOptional({
    description:
      'Most specific known Location node for the ad (see /locations) — replaces the sheet’s separate "City Advertised"/"Suburbs" columns',
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Job title ID (see /job-titles) — the advertiser’s own words' })
  @IsOptional()
  @IsString()
  jobTitleId?: string;

  @ApiPropertyOptional({
    description: 'Job role type ID (see /job-role-types) — the consultant’s classification of the ad',
  })
  @IsOptional()
  @IsString()
  jobRoleTypeId?: string;

  // A snapshot of how the client stood when the ad was logged, not a live
  // reference to Client.status — the two drift apart on purpose.
  @ApiPropertyOptional({
    description: 'Snapshot of the client’s status when this research was logged',
    enum: ClientStatus,
  })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional({ description: 'Link to the Seek listing' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  seekUrl?: string;

  @ApiPropertyOptional({ description: 'Permanent/archived link to the ad, if the original expires' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  permanentUrl?: string;

  // Distinct from researchedAt (when the consultant logged it), which the DB
  // defaults to now().
  @ApiPropertyOptional({ description: 'When the ad was posted (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  postedDate?: string;

  @ApiPropertyOptional({ description: 'Contact email scraped from the ad' })
  @IsOptional()
  @IsEmail()
  contactEmailFromAd?: string;

  // Free text copied off the ad verbatim — real values read like
  // "salary + super + FMCV + bonus scheme".
  @ApiPropertyOptional({
    description: 'Salary as written in the ad. Free text, copied verbatim.',
    example: 'salary + super + FMCV + bonus scheme',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  salaryRange?: string;

  @ApiPropertyOptional({
    description:
      'Whether the advertiser has been approached about this ad. Prefer POST /job-research/:id/mark-contacted, which also records who and when; this is here for corrections.',
  })
  @IsOptional()
  @IsBoolean()
  isContacted?: boolean;

  @ApiPropertyOptional({ description: 'When the research was logged (ISO 8601). Defaults to now.' })
  @IsOptional()
  @IsDateString()
  researchedAt?: string;

  @ApiPropertyOptional({ description: 'Free-text notes on the ad' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

/** Body for `POST /job-research/:id/mark-contacted`. */
export class MarkContactedDto {
  @ApiPropertyOptional({
    description: 'When the contact happened (ISO 8601). Defaults to now. Who is taken from your session.',
  })
  @IsOptional()
  @IsDateString()
  @Type(() => String)
  contactedAt?: string;
}
