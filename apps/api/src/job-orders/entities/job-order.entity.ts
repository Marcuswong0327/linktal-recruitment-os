import { ApiProperty } from '@nestjs/swagger';
import { JobOrder, JobOrderStatus } from '@prisma/client';

/**
 * OpenAPI response shape for a JobOrder.
 *
 * `implements JobOrder` ties this class to the Prisma model at compile time,
 * keeping the generated frontend types honest to the database (the source of
 * truth). Nullable columns use `@ApiProperty({ nullable: true })` with an
 * explicit `type`, because Prisma always returns the column, just as `null`.
 */
export class JobOrderEntity implements JobOrder {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'JO-0001' }) displayId!: string;
  @ApiProperty() clientId!: string;
  @ApiProperty({ type: String, nullable: true }) consultantId!: string | null;
  @ApiProperty({ example: 'Production Manager' }) jobTitle!: string;
  @ApiProperty({ type: String, nullable: true }) department!: string | null;
  @ApiProperty({ type: String, nullable: true }) location!: string | null;
  @ApiProperty({ type: String, nullable: true }) jobType!: string | null;
  @ApiProperty({ type: Number, nullable: true }) salaryMin!: number | null;
  @ApiProperty({ type: Number, nullable: true }) salaryMax!: number | null;
  @ApiProperty({ type: String, nullable: true, example: 'AUD' }) salaryCurrency!: string | null;
  @ApiProperty({ example: 1 }) openings!: number;
  @ApiProperty({ example: 0 }) filledCount!: number;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) requirements!: string | null;
  @ApiProperty({ enum: JobOrderStatus }) status!: JobOrderStatus;
  @ApiProperty({ type: Number, nullable: true, description: '1=High, 2=Medium, 3=Low' }) priorityLevel!: number | null;
  @ApiProperty() receivedAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) closedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
