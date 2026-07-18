import { ApiProperty } from '@nestjs/swagger';
import { CandidateContactHistory } from '@prisma/client';

/** OpenAPI response shape for a CandidateContactHistory row (one logged contact). */
export class CandidateContactHistoryEntity implements CandidateContactHistory {
  @ApiProperty() id!: string;
  @ApiProperty() candidateId!: string;
  @ApiProperty({ example: 'call' }) contactType!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Consultant who made this contact' })
  contactedById!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() contactedAt!: Date;
  @ApiProperty() createdAt!: Date;
}
