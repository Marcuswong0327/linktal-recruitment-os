import { ApiProperty } from '@nestjs/swagger';
import { Tob } from '@prisma/client';

/**
 * OpenAPI response shape for a Terms of Business row.
 *
 * `implements Tob` ties this class to the Prisma model at compile time, keeping
 * the generated frontend types honest to the database (the source of truth).
 * Nullable columns use `@ApiProperty({ nullable: true })` with an explicit
 * `type`, because Prisma always returns the column, just as `null`.
 *
 * `companyName` and `linktalRepresentative` aren't part of the raw `Tob` model
 * (only the FK ids are) — they're the FKs' resolved names, added so a TOB list
 * can be displayed without joining against /clients and /consultants first. The
 * parallel `*Id` fields are what an editable form binds to.
 */
export class TobEntity implements Omit<Tob, 'deletedAt' | 'deletedById'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'TOB-0001' }) displayId!: string;
  @ApiProperty() clientId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved client company name' })
  companyName!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Acme TOB 2024 signed.pdf' })
  fileName!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'TOB Document' }) fileType!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Where the document lives (e.g. a SharePoint URL)' })
  sourceFileLink!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Who signed/agreed on the client side — a name, sometimes with contact details attached',
  })
  clientTobRepresentative!: string | null;
  @ApiProperty({ type: String, nullable: true }) linktalRepresentativeId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Resolved name of the consultant who signed on Linktal’s side',
  })
  linktalRepresentative!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Pricing schedule, as written. Free text — real values are tiered, not a single percentage.',
    example: '13%-(80k below)15%-18%',
  })
  pricing!: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Guarantee period in days. Never used to derive Placement.guaranteeEndDate, which is entered manually — a client can hold several TOBs that disagree.',
    example: 180,
  })
  guaranteePeriod!: number | null;
  @ApiProperty({ type: String, nullable: true, example: '30 days from invoice' })
  paymentTerm!: string | null;
  @ApiProperty({ type: String, nullable: true }) invoiceContactName!: string | null;
  @ApiProperty({ type: String, nullable: true }) invoiceContactEmail!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
