import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Terms of Business — one row per agreement on file with a client. Many per
 * client, deliberately: a company can hold several TOBs that disagree on
 * pricing and guarantee (see `Tob` in schema.prisma), which is why the old
 * `Client.tobSigned` flag and the per-client fee columns are gone.
 *
 * Everything but `clientId` is optional, matching the source workbook's fill
 * rates — most historical rows carry a file name and little else.
 */
export class CreateTobDto {
  @ApiProperty({ description: 'Client ID this agreement belongs to' })
  @IsString()
  clientId!: string;

  @ApiPropertyOptional({ description: 'Name of the source document', example: 'Acme TOB 2024 signed.pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional({ description: 'Kind of document', example: 'TOB Document' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fileType?: string;

  // Not @IsUrl: the workbook column holds SharePoint links, bare file paths
  // and the occasional note about where a document lives. Rejecting the
  // non-URLs would lose the only pointer to the original.
  @ApiPropertyOptional({ description: 'Where the document lives (e.g. a SharePoint URL)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceFileLink?: string;

  @ApiPropertyOptional({
    description: 'Who signed/agreed on the client side — a name, sometimes with contact details attached',
    example: 'Jane Doe, Head of Talent',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientTobRepresentative?: string;

  @ApiPropertyOptional({ description: 'Consultant ID who signed on Linktal’s side' })
  @IsOptional()
  @IsString()
  linktalRepresentativeId?: string;

  // Free text, not a number — real values include "13%-(80k below)15%-18%"
  // alongside plain percentages. See the model comment in schema.prisma.
  @ApiPropertyOptional({
    description: 'Pricing schedule, as written. Free text: real values are tiered, not a single percentage.',
    example: '13%-(80k below)15%-18%',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  pricing?: string;

  // Days, so it stays computable, even though the sheet writes "6 Months".
  // Capped at ~10 years to catch a value pasted in months by mistake.
  @ApiPropertyOptional({
    description: 'Guarantee period in **days** (the sheet writes "6 Months"; store 180)',
    minimum: 0,
    maximum: 3650,
    example: 180,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  guaranteePeriod?: number;

  @ApiPropertyOptional({ description: 'Payment terms', example: '30 days from invoice' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  paymentTerm?: string;

  @ApiPropertyOptional({ description: 'Who to invoice at the client', example: 'Accounts Payable' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  invoiceContactName?: string;

  @ApiPropertyOptional({ description: 'Invoice contact email', example: 'ap@acme.com' })
  @IsOptional()
  @IsEmail()
  invoiceContactEmail?: string;
}
