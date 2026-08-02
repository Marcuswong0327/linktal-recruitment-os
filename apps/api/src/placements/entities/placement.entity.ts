import { ApiProperty } from '@nestjs/swagger';
import { Placement, PlacementFeeType, PlacementStatus } from '@prisma/client';

/** OpenAPI response shape for a Placement. */
export class PlacementEntity implements Omit<Placement, 'deletedAt' | 'deletedById'> {
  @ApiProperty({ type: String, example: 'PLC-0001' }) displayId!: string;
  @ApiProperty() id!: string;
  @ApiProperty() submissionId!: string;
  @ApiProperty({ type: Number, nullable: true }) baseSalary!: number | null;
  @ApiProperty() superPercentage!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'Auto: baseSalary * (1 + superPercentage / 100)' })
  totalPackage!: number | null;
  @ApiProperty({ enum: PlacementFeeType }) feeType!: PlacementFeeType;
  @ApiProperty({ type: Number, nullable: true }) feePercentage!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Auto (PERCENTAGE): totalPackage * feePercentage / 100' })
  feeValue!: number | null;
  @ApiProperty({ type: Date, nullable: true }) startDate!: Date | null;
  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      'End of the guarantee period. Entered manually — guarantee terms live per-TOB and a client can hold several that disagree, so it is not derived from startDate.',
  })
  guaranteeEndDate!: Date | null;
  @ApiProperty() accountsNotified!: boolean;
  @ApiProperty({ enum: PlacementStatus }) status!: PlacementStatus;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
