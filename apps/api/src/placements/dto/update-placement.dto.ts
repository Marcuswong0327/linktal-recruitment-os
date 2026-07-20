import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PlacementStatus } from '@prisma/client';
import { CreatePlacementDto } from './create-placement.dto';

// submissionId isn't patchable — a placement doesn't move to a different
// submission (it's a 1:1 relation); remove and recreate if that were ever needed.
export class UpdatePlacementDto extends PartialType(OmitType(CreatePlacementDto, ['submissionId'] as const)) {
  @ApiPropertyOptional({ description: 'Placement status — e.g. mark FAILED if the candidate leaves within the guarantee period', enum: PlacementStatus })
  @IsOptional()
  @IsEnum(PlacementStatus)
  status?: PlacementStatus;
}
